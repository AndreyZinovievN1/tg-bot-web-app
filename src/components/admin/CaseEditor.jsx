import { useState } from 'react';
import { FaStar } from 'react-icons/fa';
import {
  FiArrowLeft,
  FiCheck,
  FiChevronDown,
  FiEye,
  FiImage,
  FiSave,
  FiStar,
  FiTrash2,
  FiUpload,
  FiX,
} from 'react-icons/fi';
import { caseAccents, caseContentVisuals, caseImageLimitKb } from '../../config/casesMeta.js';
import { useTranslation } from '../../i18n/I18nContext.js';
import { localeMeta, supportedLocales } from '../../i18n/locales/index.js';
import { caseImageFromFile, caseImageKb } from '../../utils/caseImage.js';
import { normalizeCaseTheme, sameCaseTheme, themeForAccent } from '../../utils/caseTheme.js';
import { findGift } from '../../utils/casePrizes.js';
import { giftTitle } from '../../utils/giftCatalog.js';
import CaseContentEditor from './CaseContentEditor.jsx';
import CaseThemePicker from './CaseThemePicker.jsx';

/**
 * Редактор кейса: превью карточки, картинка, наполнение и тексты.
 *
 * Форма повторяет логику редактора заданий: сверху сворачиваемое превью — оно
 * показывает ровно ту карточку, что увидит игрок, и заодно состав кейса с
 * шансами. Дальше блоки по порядку «как о кейсе думают»:
 *   1) «Основное» — включён ли кейс, акцент карточки и цена в Telegram Stars;
 *   2) «Картинка» — PNG капсулы (ужимается до лимита прямо в браузере);
 *   3) «Наполнение» — призы кейса с весами (`CaseContentEditor`); у строки приза-подарка
 *      тут же выбирается конкретный подарок Telegram из каталога юзербота;
 *   4) «Дополнительно» — порядок в рейке, код кейса и служебные даты;
 *   5) «Тексты» — название и описание по языкам.
 *
 * Сохраняем через `POST /api/admin/cases` (новый) или `PUT /api/admin/cases/:id`.
 * Сервер сам подрезает числа и отбрасывает битые строки наполнения, а код кейса у
 * существующего кейса не меняется: на него ссылаются балансы, заказы и задания.
 *
 * `onRefreshGifts` — перечитать каталог подарков (кнопка в пикере): она обновляет
 * только каталог, поэтому несохранённые правки наполнения не сбрасываются.
 */
function CaseEditor({
  busy,
  catalog,
  caseItem,
  isNew = false,
  onBack,
  onDelete,
  onRefreshGifts,
  onSave,
  onToast,
}) {
  const { t, locale } = useTranslation();
  const [draft, setDraft] = useState(caseItem);
  const [source, setSource] = useState(caseItem);
  const [confirmDelete, setConfirmDelete] = useState(false);
  /** Превью раскрыто по умолчанию: картинка кейса — первое, что проверяет владелец. */
  const [previewOpen, setPreviewOpen] = useState(true);
  const [moreOpen, setMoreOpen] = useState(false);
  const [imageError, setImageError] = useState('');
  const [activeLocale, setActiveLocale] = useState(() => (supportedLocales.includes(locale) ? locale : 'ru'));

  // Сервер подрезает значения, поэтому черновик пересобираем из свежего ответа:
  // сравниваем ссылку на шаблон с прошлой — так и обходимся без useEffect.
  if (caseItem !== source) {
    setSource(caseItem);
    setDraft(caseItem);
    setConfirmDelete(false);
    setImageError('');
  }

  const accents = Array.isArray(catalog?.accents) && catalog.accents.length > 0 ? catalog.accents : caseAccents;
  const contents = Array.isArray(draft.contents) ? draft.contents : [];
  const stars = Number(draft.stars) || 0;
  const filledLocales = supportedLocales.filter(code => Boolean(draft.titles?.[code] || draft.texts?.[code]));
  // Превью показывает то же, что увидит игрок: пока владелец не задал свои
  // тексты, карточка берёт их из словаря стартовых кейсов.
  const previewTitle = draft.titles?.[activeLocale]
    || draft.titles?.ru
    || playerText(draft.id, t, 'title')
    || draft.id;
  const previewText = draft.texts?.[activeLocale]
    || draft.texts?.ru
    || playerText(draft.id, t, 'text');

  const update = (key, value) => setDraft(current => ({ ...current, [key]: value }));

  const updateText = (field, code, value) => setDraft(current => ({
    ...current,
    [field]: { ...(current[field] || {}), [code]: value },
  }));

  /**
   * Смена акцента карточки: пока владелец не трогал цвета блока, тему
   * подтягиваем под новый акцент — блок остаётся «в цвет кейса». Как только
   * цвета настроены вручную, акцент на них больше не влияет.
   */
  const updateAccent = accent => setDraft(current => {
    const theme = normalizeCaseTheme(current.theme, current.accent);
    const followsAccent = sameCaseTheme(theme, themeForAccent(current.accent));

    return { ...current, accent, theme: followsAccent ? themeForAccent(accent) : theme };
  });

  /**
   * Загрузка PNG: файл читается в браузере и ужимается до лимита сервера
   * (`caseImageLimit`), поэтому в БД уезжает уже готовый data-URL.
   */
  const pickImage = async event => {
    const file = event.target.files?.[0];

    // Поле очищаем сразу: повторный выбор того же файла тоже должен срабатывать.
    event.target.value = '';
    setImageError('');

    if (!file) {
      return;
    }

    try {
      const dataUrl = await caseImageFromFile(file);

      setDraft(current => ({ ...current, image: dataUrl }));
      onToast?.(t('admin.cases.imageReady', { kb: caseImageKb(dataUrl) }));
    } catch (error) {
      setImageError(t(error.message));
    }
  };

  const submit = event => {
    event.preventDefault();

    if (busy) {
      return;
    }

    onSave({
      id: draft.id,
      titles: draft.titles || {},
      texts: draft.texts || {},
      accent: draft.accent,
      theme: normalizeCaseTheme(draft.theme, draft.accent),
      stars,
      // Картинку шлём всегда целиком: пустая строка снимает её с кейса.
      image: draft.image || '',
      contents,
      active: Boolean(draft.active),
      sortOrder: Number(draft.sortOrder) || 0,
    });
  };

  return (
    <section className="profile-panel docs-admin missions-admin cases-admin">
      <div className="profile-panel__head">
        <h3><FiCheck /> {t(isNew ? 'admin.cases.createTitle' : 'admin.cases.editTitle')}</h3>

        <span className="missions-head">
          <span className={`docs-badge ${draft.active ? 'is-published' : 'is-draft'}`}>
            {draft.active ? t('admin.cases.enabled') : t('admin.cases.disabled')}
          </span>

          {isNew ? null : (
            <button
              aria-label={t('admin.cases.delete')}
              className="missions-head__danger"
              title={t('admin.cases.delete')}
              type="button"
              onClick={() => setConfirmDelete(current => !current)}
            >
              <FiTrash2 />
            </button>
          )}
        </span>
      </div>

      <div className="profile-panel__body">
        {confirmDelete ? (
          <div className="docs-confirm">
            <span>{t('admin.cases.deleteConfirm', { title: caseName(draft, t) })}</span>
            <div>
              <button className="btn btn-small docs-danger" disabled={busy} type="button" onClick={() => onDelete(draft.id)}>
                {t('admin.cases.delete')}
              </button>
              <button className="btn btn-ghost btn-small" type="button" onClick={() => setConfirmDelete(false)}>
                {t('admin.cases.cancel')}
              </button>
            </div>
          </div>
        ) : null}

        <form className="missions-form" onSubmit={submit}>
          {/* Превью: капсула как в приложении плюс состав кейса с шансами. */}
          <section className={`missions-preview ${previewOpen ? 'is-open' : ''}`}>
            <button
              aria-expanded={previewOpen}
              className="missions-preview__toggle"
              type="button"
              onClick={() => setPreviewOpen(current => !current)}
            >
              <FiEye />

              <span className="missions-preview__label">{t('admin.cases.previewTitle')}</span>

              <span className="missions-preview__summary">
                {t('admin.cases.previewSummary', { count: contents.length })}
                <FiStar />
                {stars > 0 ? stars : '—'}
              </span>

              <i className="missions-preview__code">{draft.id}</i>

              <FiChevronDown className="missions-preview__chevron" />
            </button>

            {previewOpen ? (
              <>
                <article className={`loot-card loot-card--${draft.accent} is-stocked cases-admin-preview`}>
                  <span className="loot-card__scan" aria-hidden="true" />

                  <h3 className="loot-card__title">{previewTitle}</h3>

                  <span className="loot-card__art">
                    {draft.image ? (
                      <img alt="" decoding="async" src={draft.image} />
                    ) : (
                      <span className="cases-admin-preview__empty" aria-hidden="true">
                        {caseContentVisuals[contents[0]?.type] || '📦'}
                      </span>
                    )}
                  </span>

                  <span className="loot-card__foot">
                    <span className="loot-card__price">
                      <FaStar aria-hidden="true" />
                      {stars || t('admin.cases.noStars')}
                    </span>
                  </span>
                </article>

                <OddsList
                  contents={contents}
                  gifts={catalog?.gifts || []}
                  savedGifts={catalog?.savedGifts || []}
                />

                <small className="missions-preview__hint">{t('admin.cases.previewHint')}</small>
              </>
            ) : null}
          </section>

          {/* 1. Основное: виден ли кейс, цвет капсулы и цена в Stars. */}
          <Group hint={t('admin.cases.mainHint')} label={t('admin.cases.groupMain')}>
            <button
              aria-checked={draft.active}
              className={`missions-switch ${draft.active ? 'is-on' : ''}`}
              role="switch"
              type="button"
              onClick={() => update('active', !draft.active)}
            >
              {t('admin.cases.activeField')}
              <span className="missions-switch__track" aria-hidden="true" />
            </button>

            <div className="missions-field">
              <span>{t('admin.cases.accentField')}</span>

              <div className="missions-colors cases-admin-accents">
                {accents.map(accent => (
                  <button
                    key={accent}
                    aria-label={t(`admin.cases.accents.${accent}`)}
                    aria-pressed={draft.accent === accent}
                    className={`missions-swatch ${draft.accent === accent ? 'is-active' : ''}`}
                    data-case-accent={accent}
                    title={t(`admin.cases.accents.${accent}`)}
                    type="button"
                    onClick={() => updateAccent(accent)}
                  />
                ))}
              </div>

              <small>{t('admin.cases.accentHint')}</small>
            </div>

            <label className="missions-field">
              <span>{t('admin.cases.starsField')}</span>

              <input
                className="docs-input"
                inputMode="numeric"
                min="0"
                type="number"
                value={draft.stars}
                onChange={event => update('stars', event.target.value)}
              />

              <small>{t('admin.cases.starsHint')}</small>
            </label>
          </Group>

          {/* 1.1. Тема блока: в какой цвет красится «Кейс дня» на экране кейсов. */}
          <CaseThemePicker
            accent={draft.accent}
            description={previewText}
            hint={t('admin.cases.themeGroupHint')}
            image={draft.image}
            label={t('admin.cases.groupTheme')}
            title={previewTitle}
            value={draft.theme}
            onChange={theme => update('theme', theme)}
          />

          {/* 2. Картинка: PNG капсулы, который видит игрок в рейке и в рулетке. */}
          <Group hint={t('admin.cases.imageHint', { kb: caseImageLimitKb })} label={t('admin.cases.groupImage')}>
            <div className="cases-admin-image">
              <div className={`cases-admin-image__slot ${draft.image ? 'is-filled' : ''}`}>
                {draft.image ? (
                  <img alt="" decoding="async" src={draft.image} />
                ) : (
                  <span className="cases-admin-image__placeholder">
                    <FiImage />
                    {t('admin.cases.imageEmpty')}
                  </span>
                )}
              </div>

              <div className="cases-admin-image__tools">
                <label className="btn btn-primary btn-small cases-admin-image__pick">
                  <FiUpload /> {draft.image ? t('admin.cases.imageReplace') : t('admin.cases.imagePick')}
                  <input accept="image/png" type="file" onChange={pickImage} />
                </label>

                <button
                  className="btn btn-ghost btn-small"
                  disabled={!draft.image}
                  type="button"
                  onClick={() => update('image', '')}
                >
                  <FiX /> {t('admin.cases.imageRemove')}
                </button>

                {draft.image ? (
                  <small className="cases-admin-image__size">
                    {t('admin.cases.imageSize', { kb: caseImageKb(draft.image) })}
                  </small>
                ) : (
                  <small className="cases-admin-image__size">{t('admin.cases.imageTypes')}</small>
                )}
              </div>
            </div>

            {imageError ? <div className="inline-alert">{imageError}</div> : null}
          </Group>

          {/* 3. Наполнение: призы кейса и их веса — из них сервер считает шансы. */}
          <Group hint={t('admin.cases.contentsHint')} label={t('admin.cases.groupContents')}>
            <CaseContentEditor
              busy={busy}
              catalog={catalog}
              contents={contents}
              giftsStatus={catalog?.giftsStatus || null}
              onChange={rows => update('contents', rows)}
              onRefreshGifts={onRefreshGifts}
            />
          </Group>

          {/* 4. Дополнительно: порядок карточки, код кейса и служебные даты. */}
          <section className={`missions-more ${moreOpen ? 'is-open' : ''}`}>
            <button className="missions-more__head" type="button" onClick={() => setMoreOpen(current => !current)}>
              <FiChevronDown />
              <span>{t('admin.cases.groupMore')}</span>
              <small>{t('admin.cases.moreHint')}</small>
            </button>

            {moreOpen ? (
              <div className="missions-more__body">
                <label className="missions-field">
                  <span>{t('admin.cases.sortField')}</span>

                  <input
                    className="docs-input"
                    inputMode="numeric"
                    min="0"
                    type="number"
                    value={draft.sortOrder}
                    onChange={event => update('sortOrder', event.target.value)}
                  />

                  <small>{t('admin.cases.sortHint')}</small>
                </label>

                <div className="missions-field">
                  <span>{t('admin.cases.codeField')}</span>
                  <i className="missions-preview__code">{draft.id}</i>
                  <small>{t(isNew ? 'admin.cases.codeAuto' : 'admin.cases.codeLocked')}</small>
                </div>

                <div className="missions-field">
                  <span>{t('admin.cases.legacyField')}</span>
                  <small>{t(draft.legacy ? 'admin.cases.legacyYes' : 'admin.cases.legacyNo')}</small>
                </div>

                {draft.updatedAt ? (
                  <small className="missions-note">{t('admin.cases.updated', { date: draft.updatedAt })}</small>
                ) : null}
              </div>
            ) : null}
          </section>

          {/* 5. Тексты: вкладки языков и название с описанием. */}
          <section className="missions-locales">
            <header className="missions-group__head">
              <span className="missions-group__label">{t('admin.cases.textsTitle')}</span>
              <small>{t('admin.cases.textsHint')}</small>
            </header>

            <div className="missions-locale-tabs" role="tablist">
              {supportedLocales.map(code => (
                <button
                  key={code}
                  aria-selected={code === activeLocale}
                  className={`missions-locale-tab ${code === activeLocale ? 'is-active' : ''}`}
                  role="tab"
                  type="button"
                  onClick={() => setActiveLocale(code)}
                >
                  <span
                    aria-hidden="true"
                    className={`missions-locale-tab__mark ${filledLocales.includes(code) ? 'is-filled' : ''}`}
                  />
                  {localeMeta[code]?.flag} {localeMeta[code]?.label}
                </button>
              ))}
            </div>

            <label className="missions-field">
              <span>{t('admin.cases.titleLabel')}</span>

              <input
                className="docs-input"
                maxLength={80}
                placeholder={t('admin.cases.titlePlaceholder')}
                value={draft.titles?.[activeLocale] || ''}
                onChange={event => updateText('titles', activeLocale, event.target.value)}
              />
            </label>

            <label className="missions-field">
              <span>{t('admin.cases.textLabel')}</span>

              <textarea
                className="docs-input"
                maxLength={400}
                placeholder={t('admin.cases.textPlaceholder')}
                rows={3}
                value={draft.texts?.[activeLocale] || ''}
                onChange={event => updateText('texts', activeLocale, event.target.value)}
              />
            </label>
          </section>

          <div className="missions-actions">
            <button className="btn btn-primary btn-small missions-actions__save" disabled={busy} type="button" onClick={submit}>
              <FiSave /> {busy ? t('admin.cases.saving') : t('admin.cases.save')}
            </button>

            <button className="btn btn-ghost btn-small" disabled={busy} type="button" onClick={onBack}>
              <FiArrowLeft /> {t('admin.cases.back')}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}

/**
 * Состав кейса с шансами: строка на приз, полоска — доля веса в общем пуле.
 * Игрок видит ровно те же проценты в рулетке, поэтому владелец проверяет
 * баланс наград ещё до сохранения. У подарка и скина рядом с типом приза стоит
 * название: в пуле важно видеть, что именно лежит в капсуле.
 */
function OddsList({ contents, gifts = [], savedGifts = [] }) {
  const { t } = useTranslation();
  const total = contents.reduce((sum, row) => sum + Math.max(0, Number(row.weight) || 0), 0);

  if (contents.length === 0) {
    return <small className="missions-note">{t('admin.cases.contentsEmpty')}</small>;
  }

  return (
    <ul className="cases-admin-odds">
      {contents.map((row, index) => {
        const weight = Math.max(0, Number(row.weight) || 0);
        const share = total > 0 ? Math.round((weight / total) * 1000) / 10 : 0;

        return (
          <li className="cases-admin-odds__row" key={`${index}-${row.type}-${row.itemId || ''}`}>
            <span className="cases-admin-odds__icon" aria-hidden="true">{caseContentVisuals[row.type] || '✦'}</span>

            <span className="cases-admin-odds__name">{oddsName(row, gifts, savedGifts, t)}</span>

            <span className="cases-admin-odds__bar" aria-hidden="true">
              <i style={{ width: `${share}%` }} />
            </span>

            <em className="cases-admin-odds__share">{share}%</em>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Подпись строки состава: тип приза, а для подарка и скина — ещё и название
 * подарка Telegram или код предмета из маркета.
 *
 * Уникальный подарок ищем и в списке подарков аккаунта: в каталоге Telegram его
 * экземпляра нет, а название с номером (`#35 651`) владельцу нужно видеть.
 */
function oddsName(row, gifts, savedGifts, t) {
  const label = t(`admin.cases.rewardTypes.${row.type}`);

  if (row.type === 'gift') {
    const gift = findGift(gifts, row.giftId) || findGift(savedGifts, row.giftId);

    return gift ? `${label} · ${giftTitle(gift)}` : label;
  }

  return row.itemId ? `${label} · ${row.itemId}` : label;
}

/** Блок формы: подпись, короткое пояснение и поля одним столбцом. */
function Group({ hint, label, children }) {
  return (
    <section className="missions-group">
      <header className="missions-group__head">
        <span className="missions-group__label">{label}</span>
        {hint ? <small>{hint}</small> : null}
      </header>

      <div className="missions-group__body">{children}</div>
    </section>
  );
}

/**
 * Тексты стартовых кейсов из словаря игрока (`cases.types.<код>.<поле>`): их
 * показывает приложение, пока владелец не заполнил свои поля в редакторе.
 */
function playerText(id, t, field) {
  const key = `cases.types.${id}.${field}`;
  const value = t(key);

  return value === key ? '' : value;
}

/** Имя кейса для служебных подписей: свой текст → словарь → код. */
function caseName(item, t) {
  const titles = item?.titles || {};

  return titles.ru
    || Object.values(titles).find(value => String(value || '').trim())
    || playerText(item?.id, t, 'title')
    || item?.id
    || '';
}

export default CaseEditor;

