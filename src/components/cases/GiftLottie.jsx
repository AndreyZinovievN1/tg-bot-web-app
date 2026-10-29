import { useEffect, useRef, useState } from 'react';
import { Lottie } from 'lottie-react';
import { giftIdText } from '../../utils/giftCatalog.js';

/**
 * Сколько анимаций качаем одновременно.
 *
 * Каждая — это поход в Telegram через юзербот за файлом `.tgs`, а юзербот ходит
 * в Telegram одной сессией. Четыре потока наполняют сетку каталога заметно
 * быстрее одного, но не забивают ни юзербот, ни канал целиком.
 */
const maxParallelLoads = 4;

/**
 * Сколько помним неудачу по подарку, прежде чем попробовать снова.
 *
 * Выдержка взята у сервера (`errorRetryMs` в `server/giftsApi.js`): выключенный
 * юзербот не заставляет сетку каталога молотить сервер на каждой прокрутке, а
 * поднятый подхватывается сам.
 */
const failureTtlMs = 30 * 1000;

/**
 * Через сколько после промаха пробуем ещё раз, пока карточка остаётся в кадре.
 *
 * Чуть больше `failureTtlMs`: повтор, назначенный ровно на границу выдержки,
 * вернул бы ту же ошибку из памяти (`loadFrame` помнит промах `failureTtlMs`) и
 * поход в юзербот не случился бы.
 */
const retryDelayMs = failureTtlMs + 250;

/**
 * Сколько разобранных кадров держим в памяти.
 *
 * В каталоге подарков их полторы сотни, и целиком это десятки мегабайт
 * Lottie-JSON. Дальние кадры вытесняем: обратно они приедут из кеша браузера
 * (у прокси стикера `Cache-Control` на неделю), то есть без похода в Telegram.
 */
const frameCacheLimit = 60;

/** Разобранные кадры: id подарка -> Lottie-JSON. Порядок ключей — давность обращения. */
const frameCache = new Map();

/** Время последнего промаха по подарку: id -> миллисекунды. */
const failureCache = new Map();

/** Подарки, о промахе которых уже сказали в консоль (см. `reportFailure`). */
const reportedFailures = new Set();

/**
 * Сказать о промахе в консоль — по разу на подарок.
 *
 * Причина промаха почти всегда в юзерботе (выключен, отвечает 502, Telegram
 * просит подождать), а заглушка одинаково выглядит и пока кадр едет, и когда он
 * не приехал. Печатаем по разу на подарок, чтобы сетка каталога не завалила
 * консоль: в кадре таких карточек единицы, и по строке видно, кого винить.
 */
function reportFailure(giftId, error) {
  if (reportedFailures.has(giftId)) {
    return;
  }

  reportedFailures.add(giftId);
  console.warn(
    `[gifts] анимация подарка ${giftId} не загрузилась (${error?.message || error}); ` +
      `повторю через ${Math.round(retryDelayMs / 1000)} с`,
  );
}

/** Идущие и ждущие загрузки: id подарка -> задача (см. `loadFrame`). */
const frameJobs = new Map();

/** Задачи, которым не хватило места в `maxParallelLoads`. */
const frameQueue = [];

let loadingCount = 0;

/** Положить кадр в кеш, вытеснив самый давний, если кеш полон. */
function rememberFrame(giftId, animation) {
  // Повторный `set` переносит ключ в конец — так Map хранит давность обращения.
  frameCache.delete(giftId);
  frameCache.set(giftId, animation);

  while (frameCache.size > frameCacheLimit) {
    frameCache.delete(frameCache.keys().next().value);
  }
}

/** Отмена — не ошибка загрузки: потребитель по ней просто молчит. */
function abortError() {
  const error = new Error('загрузка анимации больше не нужна');

  error.name = 'AbortError';

  return error;
}

/**
 * Задача окончена: освободить слот, ответить потребителям и разбудить очередь.
 *
 * Отменённая задача могла ещё стоять в очереди — тогда она слот не занимала, и
 * из очереди её выбрасываем сами.
 */
function settleJob(job, error, animation) {
  if (job.settled) {
    return;
  }

  job.settled = true;
  frameJobs.delete(job.giftId);

  if (job.queued) {
    const index = frameQueue.indexOf(job);

    if (index >= 0) {
      frameQueue.splice(index, 1);
    }
  } else {
    loadingCount -= 1;
  }

  if (error) {
    job.reject(error);
  } else {
    job.resolve(animation);
  }

  pumpQueue();
}

/**
 * Забрать из очереди столько задач, сколько позволяет `maxParallelLoads`.
 *
 * Начатая загрузка не отменяется: файл всё равно ляжет в кеш и пригодится при
 * следующей прокрутке.
 */
function pumpQueue() {
  while (loadingCount < maxParallelLoads && frameQueue.length > 0) {
    const job = frameQueue.shift();

    job.queued = false;
    loadingCount += 1;

    fetch(`/api/gifts/sticker/${job.giftId}.json`)
      .then(response => (
        response.ok
          ? response.json()
          // Статус в тексте ошибки: он же уходит в консоль (`reportFailure`), а по
          // «502» владелец сразу понимает, что дело в юзерботе, а не в плеере.
          : Promise.reject(new Error(`HTTP ${response.status} — /api/gifts/sticker/${job.giftId}.json`))
      ))
      .then(animation => {
        rememberFrame(job.giftId, animation);
        failureCache.delete(job.giftId);
        settleJob(job, null, animation);
      })
      .catch(error => {
        failureCache.set(job.giftId, Date.now());
        settleJob(job, error, null);
      });
  }
}

/**
 * Потребителю кадр больше не нужен.
 *
 * Пока задача ждёт в очереди и на неё уже никто не смотрит (карточка уехала из
 * видимой области), выбрасываем её: прокрутка сетки каталога не должна
 * выкачивать весь каталог. Начатая загрузка доходит до конца — обрывать её
 * смысла нет, файл ляжет в кеш.
 */
function releaseJob(job) {
  job.waiters -= 1;

  if (job.waiters > 0 || job.settled || !job.queued) {
    return;
  }

  settleJob(job, abortError(), null);
}

/**
 * Кадр анимации: из кеша, из уже идущей загрузки или из очереди.
 *
 * Возвращает `{ promise, cancel }`; `cancel` снимает ожидание очереди (см.
 * `releaseJob`). Промах, случившийся меньше `failureTtlMs` назад, не повторяем:
 * карточек в каталоге сотни, а юзербот может быть выключен.
 */
function loadFrame(giftId) {
  const cached = frameCache.get(giftId);

  if (cached) {
    // Кадром пользуются прямо сейчас — освежаем порядок вытеснения.
    rememberFrame(giftId, cached);

    return { promise: Promise.resolve(cached), cancel: () => {} };
  }

  const failed = failureCache.get(giftId);

  if (failed && Date.now() - failed < failureTtlMs) {
    return {
      promise: Promise.reject(new Error('анимация подарка не загрузилась — попробуем позже')),
      cancel: () => {},
    };
  }

  const running = frameJobs.get(giftId);

  if (running) {
    running.waiters += 1;

    return { promise: running.promise, cancel: () => releaseJob(running) };
  }

  const job = {
    giftId,
    promise: null,
    queued: true,
    reject: null,
    resolve: null,
    settled: false,
    waiters: 1,
  };

  job.promise = new Promise((resolve, reject) => {
    job.resolve = resolve;
    job.reject = reject;
  });

  frameJobs.set(giftId, job);
  frameQueue.push(job);
  pumpQueue();

  return { promise: job.promise, cancel: () => releaseJob(job) };
}

/**
 * Lottie-анимация подарка Telegram.
 *
 * Файл анимации (`.tgs`, он же Lottie-JSON) отдаёт наш сервер по адресу
 * `/api/gifts/sticker/{id}.json` — сервер проксирует юзербот. Загружаем файл
 * сами, а не ссылкой в плеере: так видно, что анимации нет (юзербот выключен,
 * подарок не найден), и знак показывает понятную заглушку вместо пустой рамки.
 * Ссылка открытая: `<img>` и плеер не умеют передавать Telegram initData.
 *
 * Кадр, который сейчас рисуем, помним вместе с его `giftId`: слоты перебирают
 * подарки, и ответ на прошлый запрос не должен подмениться на чужой анимации.
 * Поэтому «загружаем» и «не получилось» считаются по текущему `giftId`, а не
 * сбрасываются в начале эффекта — заодно без лишнего рендера.
 *
 * Загрузки живут в модуле (кеш, очередь, промахи): в сетке каталога карточек
 * полторы сотни, и каждая анимация — это поход в Telegram через юзербот, а не
 * пара байт из сети. Модульные кеши экономят не трафик (его держит браузер), а
 * сам поход и разбор Lottie-JSON, который нужен и карточке, и слоту кейса, и
 * превью в админке.
 *
 * `lazy` — режим сетки каталога: карточка просит кадр, только когда попадает в
 * видимую область, а уехав, возвращает заглушку вместо плеера (кадр остаётся в
 * кеше, поэтому возвращение мгновенное). Так в DOM живут единицы плееров, а не
 * полторы сотни.
 *
 * `keepFallback` — показывать заглушку, пока кадр едет. В сетке каталога это
 * уместнее спиннера: сотня крутилок выглядит хуже, чем знак подарка, который
 * «оживает» по мере загрузки.
 *
 * Промах — не приговор: пока карточка в кадре, кадр перезапрашивается раз в
 * `failureTtlMs` (юзербот мог подняться, а владелец не должен угадывать, что
 * сетку нужно прокрутить туда-обратно). Первый промах по подарку уходит в консоль:
 * заглушка одинакова и при долгой загрузке, и при ошибке — без строки в консоли
 * причину не отличить (у сервера на этот случай `[gifts] анимация подарка
 * недоступна` в `server/giftsApi.js`).
 */
function GiftLottie({ fallback = null, giftId, keepFallback = false, lazy = false }) {
  const anchorRef = useRef(null);
  const [frame, setFrame] = useState(null);
  const [failedId, setFailedId] = useState('');
  // Без `lazy` анимация нужна сразу: так ведут себя слот кейса и выпадение.
  const [inView, setInView] = useState(!lazy);
  // Id — строка цифр (`giftIdText`): девятнадцать знаков число не переживает, а он
  // же уходит в адрес анимации (`pumpQueue`).
  const id = giftIdText(giftId);

  /**
   * Ленивая карточка ждёт, пока попадёт в кадр.
   *
   * Наблюдаем обёртку, а не плеер: она остаётся в DOM и когда плеер снят, поэтому
   * «вернулась в кадр» и «уехала из кадра» видно в любом состоянии. Обрезку
   * прокруткой считает браузер, так что карточка, ушедшая под низ сетки
   * каталога, наблюдателю больше не видна.
   */
  useEffect(() => {
    if (!lazy) {
      return undefined;
    }

    const node = anchorRef.current;

    // Старый WebView без IntersectionObserver: показываем анимацию сразу — без
    // наблюдателя ленивая карточка так и осталась бы заглушкой.
    if (!node || typeof IntersectionObserver === 'undefined') {
      setInView(true);

      return undefined;
    }

    // Запас по краю: кадр успевает приехать к подъезду карточки, а не начинает
    // качаться на глазах у владельца.
    const observer = new IntersectionObserver(entries => {
      setInView(entries.some(entry => entry.isIntersecting));
    }, { rootMargin: '96px 0px' });

    observer.observe(node);

    return () => observer.disconnect();
  }, [lazy]);

  useEffect(() => {
    if (!inView || !id) {
      return undefined;
    }

    let cancelled = false;
    let retryTimer = 0;
    let job = null;

    /**
     * Запросить кадр и, если не вышло, повторить, пока карточка в кадре.
     *
     * Повтор живёт здесь, а не в состоянии компонента: он нужен только видимой
     * карточке, и уход из кадра (очистка эффекта) должен его снимать вместе с
     * ожиданием очереди. Выдержку держит `failureTtlMs` — чаще, чем раз в 30
     * секунд, в юзербот не пойдём.
     */
    const attempt = () => {
      // Кадр приходит и из кеша, и из сети — разница только в том, что кеш
      // отвечает микрозадачей, то есть до отрисовки (см. `loadFrame`).
      job = loadFrame(id);

      job.promise
        .then(animation => {
          // Кадр всё-таки приехал: следующий промах по этому подарку снова
          // расскажет о себе в консоль.
          reportedFailures.delete(id);
          setFrame({ animation, giftId: id });
        })
        .catch(error => {
          // Отмена — это уход карточки из кадра, а не «анимации нет».
          if (error?.name === 'AbortError') {
            return;
          }

          setFailedId(id);
          reportFailure(id, error);

          if (!cancelled) {
            retryTimer = setTimeout(attempt, retryDelayMs);
          }
        });
    };

    attempt();

    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
      job.cancel();
    };
  }, [id, inView]);

  const loading = <span aria-hidden="true" className="loot-lottie is-loading" />;

  // Заглушка нужна ещё и наблюдателю: у пустого узла нет размера, и ленивая
  // карточка без неё никогда бы не «попала в кадр».
  const placeholder = fallback || loading;

  let content;

  if (inView && frame?.giftId === id) {
    // `as="span"` — плеер стоит внутри `<span>` знака, поэтому остаётся фразовым
    // элементом. Размер приходит из `.loot-lottie`: у плеера без размера бокс
    // нулевой и анимации не видно.
    content = (
      <Lottie
        aria-hidden="true"
        as="span"
        autoplay
        className="loot-lottie"
        loop
        src={frame.animation}
      />
    );
  } else if (failedId === id || keepFallback) {
    // Ждём кадр, не получилось или уехали из кадра — знак остаётся заглушкой.
    content = placeholder;
  } else {
    content = loading;
  }

  if (!lazy) {
    return content;
  }

  return <span className="gift-lottie" ref={anchorRef}>{content}</span>;
}

export default GiftLottie;
