import { useEffect, useRef, useState } from 'react';
import { FiArrowRight, FiCheck, FiChevronDown, FiDroplet, FiStar } from 'react-icons/fi';
import { useTranslation } from '../../i18n/I18nContext.js';
import { buildCaseTypes } from '../../utils/caseCatalog.js';
import { caseDescription, caseTitle } from '../../utils/caseText.js';
import { normalizeCaseTheme, sameCaseTheme } from '../../utils/caseTheme.js';
import { FeaturedCaseView } from '../cases/FeaturedCase.jsx';
import CaseThemePicker from './CaseThemePicker.jsx';

/**
 * Панель блока «Кейс дня» — какой кейс показывать на экране кейсов.
 *
 * Владелец выбирает кейс из выпадающего списка: название, описание, картинка и
 * тема подставляются автоматически, а превью показывает ровно то, что увидит
 * игрок. Пустой выбор («Не показывать») убирает блок с экрана.
 *
 * Ниже — настройка фона: блок красится в тему кейса, поэтому фон правится тут же
 * (`CaseThemePicker`), без похода в редактор кейса. Сохранение — тем же `PUT`,
 * что и редактор, но без картинки: так тумблеры и фон не гоняют её по сети.
 *
 * Флаг «в блоке» отмечается у одного кейса: сервер снимает его с остальных
 * (`POST /api/admin/cases/featured`), поэтому отдельного «показать» не нужно.
 */
function CaseSpotlightAdmin({ busy, cases, onApply, onSaveTheme }) {
  const { t } = useTranslation();
  const list = Array.isArray(cases) ? cases : [];
  // Текущий кейс держим в списке даже выключенным: иначе выбор в меню «повиснет».
  const selectable = list.filter(item => item.active || item.featured);
  const current = list.find(item => item.featured) || null;
  const currentId = current?.id || '';
  // Выбор синхронизируем с сервером без useEffect: сравниваем ссылку на текущий id.
  const [selected, setSelected] = useState(currentId);
  const [synced, setSynced] = useState(currentId);
  const [open, setOpen] = useState(false);
  const pickerRef = useRef(null);

  if (currentId !== synced) {
    setSynced(currentId);
    setSelected(currentId);
  }

  // Кейс, который показан в превью: выбранный в меню или первый доступный.
  const previewId = selected || selectable[0]?.id || '';
  const previewCase = list.find(item => item.id === previewId) || null;

  // Черновик фона кейса: синхронизируем при смене показанного кейса, правки не теряем.
  const [themeDraft, setThemeDraft] = useState(() => normalizeCaseTheme(previewCase?.theme, previewCase?.accent));
  const [themeSynced, setThemeSynced] = useState(previewId);

  if (previewId !== themeSynced) {
    setThemeSynced(previewId);
    setThemeDraft(normalizeCaseTheme(previewCase?.theme, previewCase?.accent));
  }

  // Меню ведёт себя как настоящее выпадающее: закрывается по клику мимо и по Escape.
  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const onPointerDown = event => {
      if (pickerRef.current && !pickerRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    const onKeyDown = event => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  // Кейсы админки держат картинку как data-URL (`image`), а не как `imageUrl` —
  // поэтому подменяем поле: карта кейсов ниже собирается так же, как в приложении.
  const caseTypes = buildCaseTypes(list.map(item => ({ ...item, imageUrl: item.image })), {});
  const labelFor = id => caseTitle(caseTypes, id);
  const meta = caseTypes[previewId];
  const dirty = selected !== currentId;
  const themeDirty = Boolean(previewCase) && !sameCaseTheme(themeDraft, previewCase.theme);
  const currentLabel = selected ? labelFor(selected) : t('admin.cases.spotlightNone');

  const choose = id => {
    setSelected(id);
    setOpen(false);
  };

  return (
    <section className="profile-panel docs-admin cases-admin cases-spotlight">
      <div className="profile-panel__head">
        <h3><FiStar /> {t('admin.cases.spotlightTitle')}</h3>

        <span className="docs-admin__count">
          {current ? caseTitle(caseTypes, currentId) : t('admin.cases.spotlightHidden')}
        </span>
      </div>

      <div className="profile-panel__body">
        <p className="admin-hint">{t('admin.cases.spotlightHint')}</p>

        <div className="missions-field">
          <span>{t('admin.cases.spotlightField')}</span>

          <div className={`cases-pick ${open ? 'is-open' : ''}`} ref={pickerRef}>
            <button
              aria-expanded={open}
              aria-haspopup="listbox"
              className="cases-pick__field"
              disabled={busy}
              type="button"
              onClick={() => setOpen(value => !value)}
            >
              <span className={`cases-pick__value ${selected ? '' : 'is-empty'}`}>{currentLabel}</span>
              {selected ? <i className="missions-alarm__code">{selected}</i> : null}
              <FiChevronDown className="cases-pick__chevron" aria-hidden="true" />
            </button>

            {open ? (
              <ul className="cases-pick__menu" role="listbox">
                <li>
                  <button
                    aria-selected={!selected}
                    className={`cases-pick__opt ${selected ? '' : 'is-active'}`}
                    role="option"
                    type="button"
                    onClick={() => choose('')}
                  >
                    <span className="cases-pick__opt-title">{t('admin.cases.spotlightNone')}</span>
                    {selected ? null : <FiCheck aria-hidden="true" />}
                  </button>
                </li>

                {selectable.map(item => (
                  <li key={item.id}>
                    <button
                      aria-selected={selected === item.id}
                      className={`cases-pick__opt ${selected === item.id ? 'is-active' : ''}`}
                      role="option"
                      type="button"
                      onClick={() => choose(item.id)}
                    >
                      <span className="cases-pick__opt-title">{labelFor(item.id)}</span>
                      <i className="missions-alarm__code">{item.id}</i>
                      {selected === item.id ? <FiCheck aria-hidden="true" /> : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <small>{t('admin.cases.spotlightFieldHint')}</small>
        </div>

        <div className="cases-spotlight__preview">
          <small>{t('admin.cases.spotlightPreview')}</small>

          {meta ? (
            <FeaturedCaseView
              accent={meta.accent}
              description={caseDescription(caseTypes, previewId)}
              eyebrow={t('cases.featuredEyebrow')}
              image={meta.image}
              theme={themeDraft}
              title={caseTitle(caseTypes, previewId)}
              footer={
                <button className="featured-case__cta" disabled type="button">
                  <span>{t('cases.openCase')}</span>
                  <FiArrowRight aria-hidden="true" />
                </button>
              }
            />
          ) : (
            <div className="docs-empty">
              <strong>{t('admin.cases.spotlightEmpty')}</strong>
              <small>{t('admin.cases.spotlightEmptyText')}</small>
            </div>
          )}
        </div>

        {/* Фон блока — это тема показанного кейса, поэтому правим его прямо здесь.
            Превью выше уже показывает результат: правки видны до сохранения. */}
        {previewCase ? (
          <section className="cases-spotlight__theme">
            <CaseThemePicker
              accent={previewCase.accent}
              description={caseDescription(caseTypes, previewId)}
              hint={t('admin.cases.themeGroupHint')}
              image={previewCase.image}
              label={t('admin.cases.spotlightThemeTitle')}
              preview={false}
              title={caseTitle(caseTypes, previewId)}
              value={themeDraft}
              onChange={setThemeDraft}
            />

            <div className="missions-actions">
              <button
                className={`btn btn-primary btn-small missions-actions__save ${themeDirty ? 'is-dirty' : ''}`}
                disabled={busy || !themeDirty}
                type="button"
                onClick={() => onSaveTheme(previewId, themeDraft)}
              >
                <FiDroplet /> {busy ? t('admin.cases.saving') : t('admin.cases.spotlightThemeSave')}
              </button>
            </div>

            {/* Кнопка гаснет, когда фон уже такой — поясняем это словами. */}
            {themeDirty ? null : <small className="missions-note">{t('admin.cases.spotlightThemeNoChanges')}</small>}
          </section>
        ) : null}

        <div className="missions-actions">
          <button
            className="btn btn-primary btn-small missions-actions__save"
            disabled={busy || !dirty}
            type="button"
            onClick={() => onApply(selected)}
          >
            <FiStar /> {busy ? t('admin.cases.saving') : t('admin.cases.spotlightSave')}
          </button>
        </div>

        {/* Кнопка гаснет, когда менять нечего — поясняем это словами. */}
        {dirty ? null : <small className="missions-note">{t('admin.cases.spotlightNoChanges')}</small>}
      </div>
    </section>
  );
}

export default CaseSpotlightAdmin;
