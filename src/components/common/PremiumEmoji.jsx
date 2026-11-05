import { useEffect, useRef, useState } from 'react';
import { Lottie } from 'lottie-react';
import { FiStar } from 'react-icons/fi';

/**
 * Анимация премиум-эмодзи Telegram (custom emoji).
 *
 * `custom_emoji_id` лежит в `shop_items.text_m` категории `premium_emojis` —
 * его передаём в `emojiId`. Дальше работает серверный кэш `/api/emoji`:
 * описание (`format`: `lottie` | `image` | `video`) и сам файл
 * (`.json` — Lottie, `.webp`, `.webm` и др.). Юзербот не участвует: файлы
 * эмодзи — публичные стикеры, их отдаёт Bot API `getCustomEmojiStickers`.
 *
 * Три формата Telegram:
 *  - `lottie`  — `.tgs`, сервер уже распаковал в Lottie-JSON, играем `lottie-react`;
 *  - `image`   — статичный `.webp`/`.png`/`.jpg`, обычный `<img>`;
 *  - `video`   — `.webm`, `<video>` без звука и по кругу.
 *
 * Кеш и параллельные запросы живут в модуле: в сетке маркета и склада одни и те
 * же эмодзи встречаются повторно, а повторный запрос — это поход на сервер
 * (дальше он уже обслуживается с диска, но лишний RTT ни к чему). Промах
 * запоминаем на `failureTtlMs`, как у `GiftLottie`: выключенный Bot API не
 * должен молотить сервер на каждой прокрутке.
 *
 * `lazy` — просить файл, только когда узел попал в кадр (сетка маркета/склада);
 * `fallback` — что показывать, пока кадр едет или если его нет вообще.
 */

const failureTtlMs = 30 * 1000;

/** Разобранные анимации: id эмодзи -> { format, src?, animation?, emoji? }. */
const assetCache = new Map();

/** Идущие загрузки: id эмодзи -> Promise с результатом. */
const assetJobs = new Map();

/** Время последнего промаха: id эмодзи -> миллисекунды. */
const failureCache = new Map();

/** Id -> { format, src, animation, emoji } */
function cacheAsset(id, asset) {
  assetCache.delete(id);
  assetCache.set(id, asset);
}

function normalizeId(emojiId) {
  const id = String(emojiId || '').trim();

  // custom_emoji_id — большое число; мелкие id (id товара и т.п.) отсекаем,
  // чтобы случайный prop не ушёл в запрос к Telegram.
  return /^\d{4,}$/.test(id) ? id : '';
}

async function fetchAsset(id) {
  const response = await fetch(`/api/emoji/${id}`);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} — /api/emoji/${id}`);
  }

  const info = await response.json();

  if (!info?.ok || !info.src) {
    throw new Error(`неизвестный формат эмодзи ${id}`);
  }

  if (info.format === 'lottie') {
    // Lottie-JSON забираем сами: так ошибка файла видна здесь, а не пустым
    // svg внутри плеера. Картинки и видео плеер грузит по `src` сам.
    const fileResponse = await fetch(info.src);

    if (!fileResponse.ok) {
      throw new Error(`HTTP ${fileResponse.status} — ${info.src}`);
    }

    const animation = await fileResponse.json();

    return { format: 'lottie', animation, emoji: info.emoji || '' };
  }

  return { format: info.format, src: info.src, emoji: info.emoji || '' };
}

/**
 * Актив: из кеша, из идущей загрузки или новый запрос к `/api/emoji/{id}`.
 * Свежий промах (< `failureTtlMs`) не повторяем — см. шапку модуля.
 */
function loadAsset(id) {
  const cached = assetCache.get(id);

  if (cached) {
    cacheAsset(id, cached);
    return Promise.resolve(cached);
  }

  const failed = failureCache.get(id);

  if (failed && Date.now() - failed < failureTtlMs) {
    return Promise.reject(new Error('эмодзи недоступно — попробуем позже'));
  }

  const running = assetJobs.get(id);

  if (running) {
    return running;
  }

  const job = fetchAsset(id)
    .then(asset => {
      failureCache.delete(id);
      cacheAsset(id, asset);
      return asset;
    })
    .catch(error => {
      failureCache.set(id, Date.now());
      throw error;
    })
    .finally(() => assetJobs.delete(id));

  assetJobs.set(id, job);

  return job;
}

export default function PremiumEmoji({
  className = '',
  emojiId,
  fallback = null,
  lazy = false,
  loop = true,
  playing = true,
}) {
  const id = normalizeId(emojiId);
  const anchorRef = useRef(null);
  const [asset, setAsset] = useState(() => (id ? assetCache.get(id) || null : null));
  const [inView, setInView] = useState(!lazy);

  // Ленивая загрузка: в сетке маркета/склада эмодзи могут быть за краем экрана,
  // и тянуть их все сразу незачем. Уехав из кадра, узел остаётся заглушкой —
  // сам файл уже лежит в кеше и вернётся мгновенно.
  useEffect(() => {
    if (!lazy) {
      return undefined;
    }

    const node = anchorRef.current;

    if (!node || typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return undefined;
    }

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

    const attempt = () => {
      loadAsset(id)
        .then(result => {
          if (!cancelled) {
            setAsset(result);
          }
        })
        .catch(() => {
          if (cancelled) {
            return;
          }

          // Пока узел в кадре, промах переспрашиваем с выдержкой `failureTtlMs`:
          // сервер мог просто ещё не докачать файл из Telegram.
          retryTimer = setTimeout(attempt, failureTtlMs + 250);
        });
    };

    attempt();

    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
    };
  }, [id, inView]);

  const classes = ['premium-emoji', className].filter(Boolean).join(' ');
  const placeholder = fallback ?? <FiStar aria-hidden="true" className="premium-emoji__fallback" />;

  let content = placeholder;

  if (inView && id && asset?.format === 'lottie' && asset.animation) {
    content = (
      <Lottie
        aria-hidden="true"
        as="span"
        autoplay={playing}
        className="premium-emoji__lottie"
        loop={loop}
        rendererSettings={{ preserveAspectRatio: 'xMidYMid meet' }}
        src={asset.animation}
      />
    );
  } else if (inView && id && asset?.format === 'image' && asset.src) {
    content = <img alt="" className="premium-emoji__media" decoding="async" loading="lazy" src={asset.src} />;
  } else if (inView && id && asset?.format === 'video' && asset.src) {
    content = (
      <video
        className="premium-emoji__media"
        loop={loop}
        muted
        playsInline
        autoPlay={playing}
        src={asset.src}
      />
    );
  }

  return (
    <span className={classes} ref={anchorRef}>
      {content}
    </span>
  );
}
