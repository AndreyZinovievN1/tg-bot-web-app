import { useState } from 'react';
import { FiArrowRight, FiCheck, FiChevronDown, FiDroplet, FiRotateCcw } from 'react-icons/fi';
import { useTranslation } from '../../i18n/I18nContext.js';
import { themeHex } from '../../theme/colors.js';
import {
  caseBackgrounds,
  caseGradientBackgroundId,
  caseSolidBackgroundId,
  caseSolidBackgrounds,
  caseThemeTokens,
  isThemeToken,
  normalizeCaseTheme,
  themeForAccent,
} from '../../utils/caseTheme.js';
import { FeaturedCaseView } from '../cases/FeaturedCase.jsx';

/** Пипетка есть не во всех браузерах: кнопку показываем только там, где API доступно. */
const canPickFromScreen = typeof window !== 'undefined' && 'EyeDropper' in window;

/**
 * Редактор темы блока «Кейс дня».
 *
 * Сначала — библиотека готовых фонов: список плиток-строк, где квадрат слева
 * показывает ровно тот градиент или цвет, что встанет на блок. Любой фон можно
 * поставить любому кейсу в один тап. Дальше тонкая настройка:
 *   - режим: один цвет или градиент (`missions-seg`);
 *   - цвет: образцы из палитры приложения, свой `input[type=color]` и пипетка;
 *   - наклон градиента — ползунок (только для градиента);
 *   - «как у акцента» — возвращает фон, подобранный под акцент карточки.
 *
 * Снизу — живое превью настоящего блока (`FeaturedCaseView`), поэтому владелец
 * видит результат до сохранения; в панели блока превью уже есть выше, поэтому там
 * оно выключается пропом `preview={false}`. Значения — токены палитры или
 * `#rrggbb`; как они превращаются в цвет, знает `src/utils/caseTheme.js`.
 */
function CaseThemePicker({ accent, collapsible = true, description, hint, image, label, onChange, preview = true, title, value }) {
  const { t } = useTranslation();
  // Свёрнут по умолчанию: иначе палитра из двух десятков плиток растягивает форму вниз.
  const [open, setOpen] = useState(false);
  const theme = normalizeCaseTheme(value, accent);
  const gradient = theme.mode === 'gradient';
  const gradientId = caseGradientBackgroundId(theme);
  const solidId = caseSolidBackgroundId(theme);
  // Название выбранного фона — для не-технического владельца: видно словами, а не только цветом.
  const chosenName = gradientId
    ? t(`admin.cases.backgrounds.${gradientId}`)
    : solidId
      ? t(`admin.cases.backgroundsSolid.${solidId}`)
      : t('admin.cases.backgroundCustom');

  const heading = label || t('admin.cases.groupTheme');
  const showBody = !collapsible || open;

  const patch = changes => onChange({ ...theme, ...changes });

  return (
    <div className={`cases-theme ${collapsible ? 'is-collapsible' : ''} ${open ? 'is-open' : ''}`}>
      {/* Плашка-переключатель: в свёрнутом виде — одна строка с названием выбранного фона. */}
      {collapsible ? (
        <button
          aria-expanded={open}
          className="cases-theme__toggle"
          type="button"
          onClick={() => setOpen(current => !current)}
        >
          <FiDroplet className="cases-theme__toggle-icon" aria-hidden="true" />
          <span className="cases-theme__toggle-label">{heading}</span>
          <span className="cases-theme__toggle-summary">{chosenName}</span>
          <FiChevronDown className="cases-theme__toggle-chevron" aria-hidden="true" />
        </button>
      ) : null}

      {showBody ? (
        <>
          {hint ? <small className="cases-theme__hint">{hint}</small> : null}
      {/* Готовые фоны — списком: квадрат-образец слева, название справа. */}
      <div className="missions-field">
        <span>{t('admin.cases.backgroundField')}</span>

        {/* Градиенты — пары цветов: от «от» к «до». */}
        <div className="cases-theme__group">
          <small className="cases-theme__group-head">{t('admin.cases.backgroundsGradientGroup')}</small>

          <div className="cases-theme__options">
            {caseBackgrounds.map(background => {
              const active = gradientId === background.id;
              const name = t(`admin.cases.backgrounds.${background.id}`);

              return (
                <button
                  aria-label={name}
                  aria-pressed={active}
                  className={`cases-theme__option ${active ? 'is-active' : ''}`}
                  key={background.id}
                  title={name}
                  type="button"
                  onClick={() => patch({ mode: 'gradient', from: background.from, to: background.to })}
                >
                  <span
                    aria-hidden="true"
                    className="cases-theme__option-swatch"
                    style={{ '--swatch-a': `var(--${background.from})`, '--swatch-b': `var(--${background.to})` }}
                  />
                  <span className="cases-theme__option-name">{name}</span>
                  {active ? <FiCheck aria-hidden="true" className="cases-theme__option-check" /> : null}
                </button>
              );
            })}
          </div>
        </div>

        {/* Однотонные — один цвет палитры, без перелива. */}
        <div className="cases-theme__group">
          <small className="cases-theme__group-head">{t('admin.cases.backgroundsSolidGroup')}</small>

          <div className="cases-theme__options">
            {caseSolidBackgrounds.map(background => {
              const active = solidId === background.id;
              const name = t(`admin.cases.backgroundsSolid.${background.id}`);

              return (
                <button
                  aria-label={name}
                  aria-pressed={active}
                  className={`cases-theme__option ${active ? 'is-active' : ''}`}
                  key={background.id}
                  title={name}
                  type="button"
                  onClick={() => patch({ mode: 'solid', from: background.color })}
                >
                  <span
                    aria-hidden="true"
                    className="cases-theme__option-swatch is-solid"
                    style={{ '--swatch-a': `var(--${background.color})` }}
                  />
                  <span className="cases-theme__option-name">{name}</span>
                  {active ? <FiCheck aria-hidden="true" className="cases-theme__option-check" /> : null}
                </button>
              );
            })}
          </div>
        </div>

        <small className="cases-theme__chosen">
          {t('admin.cases.backgroundChosen', { name: chosenName })}
        </small>
        <small>{t('admin.cases.backgroundHint')}</small>
      </div>

      {/* Свой цвет: палитра приложения плюс пипетка и свой hex. */}
      <div className="missions-field cases-theme__own">
        <span>{t('admin.cases.themeCustom')}</span>

        <div className="missions-seg cases-theme__modes" role="group">
          <button
            aria-pressed={!gradient}
            className={`missions-seg__btn ${!gradient ? 'is-active' : ''}`}
            type="button"
            onClick={() => patch({ mode: 'solid' })}
          >
            {t('admin.cases.themeModeSolid')}
          </button>

          <button
            aria-pressed={gradient}
            className={`missions-seg__btn ${gradient ? 'is-active' : ''}`}
            type="button"
            onClick={() => patch({ mode: 'gradient' })}
          >
            {t('admin.cases.themeModeGradient')}
          </button>
        </div>

        <ThemeColorField label={t('admin.cases.themeFrom')} value={theme.from} onChange={from => patch({ from })} />

        {gradient ? (
          <ThemeColorField label={t('admin.cases.themeTo')} value={theme.to} onChange={to => patch({ to })} />
        ) : null}

        {gradient ? (
          <div className="missions-field">
            <span>{t('admin.cases.themeAngle')}</span>

            <div className="cases-theme__angle">
              <input
                aria-label={t('admin.cases.themeAngle')}
                max="360"
                min="0"
                step="5"
                type="range"
                value={theme.angle}
                onChange={event => patch({ angle: Number(event.target.value) })}
              />
              <em>{theme.angle}°</em>
            </div>
          </div>
        ) : null}
      </div>

      <div className="cases-theme__reset">
        <button className="btn btn-ghost btn-small" type="button" onClick={() => onChange(themeForAccent(accent))}>
          <FiRotateCcw /> {t('admin.cases.themeReset')}
        </button>
      </div>

      {preview ? (
        <div className="cases-theme__preview">
          <small>{t('admin.cases.themePreview')}</small>

          <FeaturedCaseView
            accent={accent}
            description={description || t('admin.cases.textEmpty')}
            eyebrow={t('cases.featuredEyebrow')}
            image={image}
            theme={theme}
            title={title || t('admin.cases.untitled')}
            footer={
              <button className="featured-case__cta" disabled type="button">
                <span>{t('cases.openCase')}</span>
                <FiArrowRight aria-hidden="true" />
              </button>
            }
          />
        </div>
      ) : null}
        </>
      ) : null}
    </div>
  );
}

/**
 * Цвет темы: образцы палитры приложения, свой цвет и пипетка.
 * Одинаково работает и для «От», и для «До».
 */
function ThemeColorField({ label, onChange, value }) {
  const { t } = useTranslation();
  const hex = pickerColor(value);

  // Пипетка берёт цвет прямо с экрана — удобно подобрать тон под картинку кейса.
  const pickFromScreen = async () => {
    try {
      const result = await new window.EyeDropper().open();

      if (result?.sRGBHex) {
        onChange(result.sRGBHex.toLowerCase());
      }
    } catch {
      // Владелец закрыл пипетку — цвет оставляем как есть.
    }
  };

  return (
    <div className="cases-theme__color">
      <span className="cases-theme__color-label">{label}</span>

      <div className="missions-colors">
        {caseThemeTokens.map(token => (
          <button
            aria-label={token}
            aria-pressed={value === token}
            className={`missions-swatch ${value === token ? 'is-active' : ''}`}
            key={token}
            style={{ '--swatch': `var(--${token})` }}
            title={token}
            type="button"
            onClick={() => onChange(token)}
          />
        ))}

        <label className="cases-theme__picker" title={t('admin.cases.themeCustom')}>
          <input
            aria-label={t('admin.cases.themeCustom')}
            type="color"
            value={hex}
            onChange={event => onChange(event.target.value.toLowerCase())}
          />
          <code>{hex}</code>
        </label>

        {canPickFromScreen ? (
          <button
            aria-label={t('admin.cases.themeEyedropper')}
            className="cases-theme__eyedropper"
            title={t('admin.cases.themeEyedropper')}
            type="button"
            onClick={pickFromScreen}
          >
            <FiDroplet />
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** Цвет для `<input type="color">`: токен раскладываем в hex через палитру. */
function pickerColor(value) {
  if (isThemeToken(value)) {
    return themeHex(value);
  }

  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(value || '')) ? String(value) : themeHex('accent');
}

export default CaseThemePicker;
