import { useState } from 'react';
import {
  FiArrowLeft,
  FiCheck,
  FiChevronDown,
  FiEye,
  FiPlus,
  FiRotateCcw,
  FiSave,
  FiTrash2,
  FiZap,
} from 'react-icons/fi';
import { caseTypes } from '../../config/casesMeta.js';
import {
  missionColor,
  missionColorRgb,
  missionDifficultyMeta,
  missionTargetVisual,
  missionVisual,
} from '../../config/missions.js';
import { useTranslation } from '../../i18n/I18nContext.js';
import { localeMeta, supportedLocales } from '../../i18n/locales/index.js';
import { caseShortTitle } from '../../utils/caseText.js';

/**
 * Редактор задания — короткая форма: сворачиваемая плашка-превью, три блока
 * настроек и тексты по языкам.
 *
 * Сверху лежит «Карточка в приложении»: в свёрнутом виде это одна строка с типом,
 * наградой и кодом задания, в развёрнутом — карточка ровно такая, какой её
 * увидит игрок (те же классы `ops-*`, что и в приложении). Свёрнутая по умолчанию
 * — чтобы настройки были видны сразу, без прокрутки.
 *
 * Блоки идут по порядку «как о задании думают»:
 *   1) «Основное» — включено ли, что делаем, с каким ритмом, цель, XP и награда;
 *   2) «Цели задания» — только у действий, которые работают по списку каналов;
 *   3) «Внешний вид» — уровень карточки и акцентный цвет;
 *   4) «Дополнительно» — порядок в списке (свёрнуто), затем тексты трёх языков.
 *
 * Главное упрощение — «Ритм»: раньше «Тип» и «Сброс» были двумя похожими
 * переключателями и путали. Теперь это один выбор (ежедневно / еженедельно /
 * свой интервал / один раз), который сразу задаёт и тип задания, и часы сброса.
 *
 * Сохраняем через `PUT /api/admin/missions/:id`: сервер сам подрезает значения
 * (цель, цвет, порядок). Место выполнения (`where`) выбрать нельзя — оно
 * привязано к действию и подставляется сервером.
 */
function MissionEditor({ catalog, mission, busy, onBack, onDelete, onSave }) {
  const { t, locale } = useTranslation();
  const [draft, setDraft] = useState(mission);
  const [source, setSource] = useState(mission);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [activeLocale, setActiveLocale] = useState(() => (supportedLocales.includes(locale) ? locale : 'ru'));

  // Справочники сервера не зависят от черновика, поэтому считаем их до сверки с
  // props: по пресетам сброса выводим стартовый режим «Ритма».
  const actions = catalog?.actions || [];
  const difficulties = catalog?.difficulties || [];
  const cases = catalog?.cases || [];
  const presets = catalog?.refreshPresets || [];
  const presetHours = kind => Number(presets.find(item => item.kind === kind)?.hours) || 0;
  const dayHours = presetHours('daily') || 24;
  const weekHours = presetHours('weekly') || 168;
  const [rhythm, setRhythm] = useState(() => rhythmOf(mission, dayHours, weekHours));

  // Сервер подрезает значения (цель, цвет, порядок), поэтому черновик пересобираем
  // из свежего ответа: сравниваем ссылку на шаблон с прошлой и обновляем состояние
  // прямо в рендере — рекомендованный React способ подстроиться под новые props.
  if (mission !== source) {
    setSource(mission);
    setDraft(mission);
    setConfirmDelete(false);
    setRhythm(rhythmOf(mission, dayHours, weekHours));
  }

  const update = (key, value) => setDraft(current => ({ ...current, [key]: value }));
  const updateText = (field, code, value) => setDraft(current => ({
    ...current,
    [field]: { ...current[field], [code]: value },
  }));

  if (!draft) {
    return null;
  }

  const action = actions.find(item => item.code === draft.action) || null;
  const visual = missionVisual(draft);
  const Icon = visual.icon;
  const color = missionColor(draft);
  const colorRgb = missionColorRgb(color);
  const caseMeta = draft.rewardCase ? caseTypes[draft.rewardCase] : null;
  const title = draft.titles?.[activeLocale] || draft.titles?.ru || '';
  const text = draft.texts?.[activeLocale] || draft.texts?.ru || '';
  // Превью показывает ровно то, что увидит игрок: если владелец ещё не задал
  // свои тексты, карточка берёт их из словаря — по коду задания, затем действия.
  const previewTitle = title
    || playerLabel(draft, t, 'title')
    || actionLabel(draft.action, t);
  const previewText = text || playerLabel(draft, t, 'text');
  const xp = Number(draft.xp) || 0;
  const goal = Number(draft.goal) || 1;
  // Цели задания «подписка»: сервер сам считает цель по их количеству, поэтому
  // в форме поле цели только для чтения.
  const targets = Array.isArray(draft.targets) ? draft.targets : [];
  const targetLimit = Number(catalog?.targetLimit) || 12;
  const targetTypes = catalog?.targetTypes || ['subscribe', 'bot_member', 'bot_admin'];
  const previewGoal = action?.targetList ? Math.max(1, targets.length) : goal;
  const filledLocales = supportedLocales.filter(code => Boolean(draft.titles?.[code] || draft.texts?.[code]));
  // Строка под свёрнутой плашкой превью: тип задания плюс награда.
  const previewSummary = draft.kind === 'daily' ? t('admin.missions.kindDaily') : t('admin.missions.kindWeekly');
  const previewReward = xp > 0
    ? `${xp} XP`
    : (caseMeta ? caseShortTitle(caseTypes, draft.rewardCase) : t('admin.missions.noXp'));

  /**
   * «Ритм» одним выбором: «ежедневно» и «еженедельно» сразу ставят и тип задания,
   * и часы сброса, «свой» меняет только часы, а «один раз» выключает повтор.
   * Поэтому ежедневное задание с нестандартным сбросом собрать всё ещё можно.
   */
  const applyRhythm = value => {
    setRhythm(value);
    setDraft(current => {
      if (value === 'once') {
        return { ...current, repeatable: false, refreshHours: 0 };
      }

      if (value === 'custom') {
        return { ...current, repeatable: true, refreshHours: Number(current.refreshHours) || dayHours };
      }

      return {
        ...current,
        kind: value,
        repeatable: true,
        refreshHours: value === 'weekly' ? weekHours : dayHours,
      };
    });
  };

  /** Правка одной цели: список живёт только в черновике, сервер его нормализует. */
  const updateTarget = (index, key, value) => setDraft(current => {
    const list = Array.isArray(current.targets) ? [...current.targets] : [];

    list[index] = { ...(list[index] || {}), [key]: value };

    return { ...current, targets: list };
  });

  /** «+» под списком: новая строка с типом «подписка» — самый частый случай. */
  const addTarget = () => setDraft(current => {
    const list = Array.isArray(current.targets) ? [...current.targets] : [];

    if (list.length >= targetLimit) {
      return current;
    }

    return { ...current, targets: [...list, { type: 'subscribe', chatId: '', title: '', url: '' }] };
  });

  const removeTarget = index => setDraft(current => ({
    ...current,
    targets: (Array.isArray(current.targets) ? current.targets : []).filter((_, itemIndex) => itemIndex !== index),
  }));

  const submit = event => {
    event.preventDefault();

    if (busy) {
      return;
    }

    onSave({
      kind: draft.kind,
      action: draft.action,
      titles: draft.titles || {},
      texts: draft.texts || {},
      goal: Number(draft.goal) || 1,
      xp: Number(draft.xp) || 0,
      rewardCase: draft.rewardCase || '',
      difficulty: draft.difficulty,
      color: draft.color,
      refreshHours: Number(draft.refreshHours) || 0,
      repeatable: Boolean(draft.repeatable),
      active: Boolean(draft.active),
      sortOrder: Number(draft.sortOrder) || 0,
      // Пустые строки целей уходят на сервер как есть: он их отбросит сам, а цель
      // задания пересчитает по числу оставшихся.
      targets: action?.targetList ? targets : [],
    });
  };

  return (
    <section className="profile-panel docs-admin missions-admin">
      <div className="profile-panel__head">
        <h3><FiCheck /> {t('admin.missions.editTitle')}</h3>

        <span className="missions-head">
          <span className={`docs-badge ${draft.active ? 'is-published' : 'is-draft'}`}>
            {draft.active ? t('admin.missions.enabled') : t('admin.missions.disabled')}
          </span>

          <button
            aria-label={t('admin.missions.delete')}
            className="missions-head__danger"
            title={t('admin.missions.delete')}
            type="button"
            onClick={() => setConfirmDelete(current => !current)}
          >
            <FiTrash2 />
          </button>
        </span>
      </div>

      <div className="profile-panel__body">
        {/* Удаление спрашиваем у шапки, подальше от «Сохранить»: промахнуться сложнее. */}
        {confirmDelete ? (
          <div className="docs-confirm">
            <span>{t('admin.missions.deleteConfirm', { title: missionName(draft, t) })}</span>
            <div>
              <button className="btn btn-small docs-danger" disabled={busy} type="button" onClick={() => onDelete(draft.id)}>
                {t('admin.missions.delete')}
              </button>
              <button className="btn btn-ghost btn-small" type="button" onClick={() => setConfirmDelete(false)}>
                {t('admin.missions.cancel')}
              </button>
            </div>
          </div>
        ) : null}

        <form className="missions-form" onSubmit={submit}>
          {/* Превью: свёрнуто — одна строка, развёрнуто — карточка как в приложении. */}
          <section className={`missions-preview ${previewOpen ? 'is-open' : ''}`}>
            <button
              aria-expanded={previewOpen}
              className="missions-preview__toggle"
              type="button"
              onClick={() => setPreviewOpen(current => !current)}
            >
              <FiEye />

              <span className="missions-preview__label">{t('admin.missions.previewTitle')}</span>

              <span className="missions-preview__summary">
                {previewSummary} · {previewReward}
              </span>

              <i className="missions-preview__code">{draft.id}</i>

              <FiChevronDown className="missions-preview__chevron" />
            </button>

            {previewOpen ? (
              <>
                <article
                  className={`ops-card ops-card--${visual.tone}`}
                  style={{ '--card-tone': color, '--card-rgb': colorRgb }}
                >
                  <span className="ops-card__icon"><Icon /></span>

                  <div className="ops-card__body">
                    <header className="ops-card__head">
                      <h3>{previewTitle || t('admin.missions.untitled')}</h3>

                      {xp > 0 ? (
                        <span className="ops-chip ops-chip--xp"><FiZap />+{xp} XP</span>
                      ) : caseMeta ? (
                        <span className="ops-chip ops-chip--case">
                          <img alt="" decoding="async" src={caseMeta.image} />
                          {caseShortTitle(caseTypes, draft.rewardCase)}
                        </span>
                      ) : null}
                    </header>

                    {previewText ? <p className="ops-card__text">{previewText}</p> : null}

                    {action?.targetList && targets.length ? (
                      <div className="ops-targets">
                        {targets.map((target, index) => {
                          const TargetIcon = missionTargetVisual(target).icon;

                          return (
                            <span className="ops-target" key={`${index}-${target.id || target.chatId || ''}`}>
                              <TargetIcon />
                              <span className="ops-target__name">{target.title || target.chatId || t('admin.missions.targetNew')}</span>
                            </span>
                          );
                        })}
                      </div>
                    ) : null}

                    {action?.goalable ? (
                      <div className="ops-meter">
                        <span className="ops-meter__bar"><i style={{ width: '0%' }} /></span>
                        <em>0 / {previewGoal}</em>
                      </div>
                    ) : null}

                    <footer className="ops-card__foot">
                      <span className="ops-card__tags">
                        <span className={`ops-tag ops-tag--${draft.where}`}>{t(`missions.where.${draft.where}`)}</span>
                        <span className="ops-tag ops-tag--diff" style={{ '--tag-rgb': colorRgb }}>
                          {t(`missions.difficulty.${draft.difficulty}`)}
                        </span>
                      </span>

                      <span className="ops-status">{t('missions.awaiting')}</span>
                    </footer>
                  </div>
                </article>

                <small className="missions-preview__hint">{t('admin.missions.previewHint')}</small>
              </>
            ) : null}
          </section>

          {/* 1. Основное: включено ли задание, что делаем, с каким ритмом, цель и награда. */}
          <Group hint={t('admin.missions.actionHint')} label={t('admin.missions.groupMain')}>
            <button
              aria-checked={draft.active}
              className={`missions-switch ${draft.active ? 'is-on' : ''}`}
              role="switch"
              type="button"
              onClick={() => update('active', !draft.active)}
            >
              {t('admin.missions.activeField')}
              <span className="missions-switch__track" aria-hidden="true" />
            </button>

            <label className="missions-field">
              <span>{t('admin.missions.actionField')}</span>

              <select className="docs-input" value={draft.action} onChange={event => update('action', event.target.value)}>
                {actions.map(item => (
                  <option key={item.code} value={item.code}>
                    {t(`admin.missions.actions.${item.code}`)}
                  </option>
                ))}
              </select>

              <small>
                {t('admin.missions.whereHint')}: {t(`missions.where.${draft.where}`)}
                {action?.targetList ? ` · ${t('admin.missions.targetGoalHint')}` : ''}
                {action?.goalable && !action?.targetList ? ` · ${t('admin.missions.maxGoal', { count: action.maxGoal || 0 })}` : ''}
                {action?.cooldownHours ? ` · ${t('admin.missions.cooldown', { hours: action.cooldownHours })}` : ''}
              </small>
            </label>

            <div className="missions-field">
              <span>{t('admin.missions.rhythmField')}</span>

              <div className="missions-seg">
                {['daily', 'weekly', 'custom', 'once'].map(code => (
                  <button
                    key={code}
                    aria-pressed={rhythm === code}
                    className={`missions-seg__btn ${rhythm === code ? 'is-active' : ''}`}
                    type="button"
                    onClick={() => applyRhythm(code)}
                  >
                    {t(`admin.missions.rhythm.${code}`)}
                  </button>
                ))}
              </div>

              {rhythm === 'custom' ? (
                <label className="missions-inline">
                  <span>{t('admin.missions.refreshField')}</span>

                  <input
                    className="docs-input"
                    inputMode="numeric"
                    min="1"
                    type="number"
                    value={draft.refreshHours}
                    onChange={event => update('refreshHours', event.target.value)}
                  />
                </label>
              ) : null}

              <small>
                {rhythm === 'custom'
                  ? t('admin.missions.scheduleCustomHint')
                  : t('admin.missions.rhythmHint')}
              </small>
            </div>

            <div className="missions-pair">
              <label className="missions-field">
                <span>{t('admin.missions.goalField')}</span>

                <input
                  className="docs-input"
                  disabled={!action?.goalable || Boolean(action?.targetList)}
                  inputMode="numeric"
                  min="1"
                  type="number"
                  value={action?.targetList ? previewGoal : draft.goal}
                  onChange={event => update('goal', event.target.value)}
                />

                <small>
                  {action?.targetList
                    ? t('admin.missions.goalByTargets', { count: targets.length })
                    : action?.goalable ? t('admin.missions.goalHint') : t('admin.missions.goalLocked')}
                </small>
              </label>

              <label className="missions-field">
                <span>{t('admin.missions.xpField')}</span>

                <input
                  className="docs-input"
                  inputMode="numeric"
                  max="5000"
                  min="0"
                  type="number"
                  value={draft.xp}
                  onChange={event => update('xp', event.target.value)}
                />

                <small>{t('admin.missions.xpHint')}</small>
              </label>
            </div>

            <label className="missions-field">
              <span>{t('admin.missions.rewardField')}</span>

              <select
                className="docs-input"
                value={draft.rewardCase || ''}
                onChange={event => update('rewardCase', event.target.value)}
              >
                <option value="">{t('admin.missions.rewardNone')}</option>
                {cases.map(code => (
                  <option key={code} value={code}>{caseShortTitle(caseTypes, code)}</option>
                ))}
              </select>

              <small>{t('admin.missions.rewardHint')}</small>
            </label>
          </Group>

          {/* 2. Цели задания «подписка»: список каналов и чатов, которые сервер
              проверяет через Telegram. Показываем блок только для действий,
              которые работают по списку целей. */}
          {action?.targetList ? (
            <Group hint={t('admin.missions.targetsHint')} label={t('admin.missions.targetsTitle')}>
              {targets.length === 0 ? (
                <small className="missions-note">{t('admin.missions.targetsEmpty')}</small>
              ) : null}

              {targets.map((target, index) => (
                <div className="missions-target" key={`${index}-${target.id || target.chatId || ''}`}>
                  <div className="missions-target__head">
                    <select
                      aria-label={t('admin.missions.targetTypeField')}
                      className="docs-input"
                      title={t('admin.missions.targetTypeField')}
                      value={target.type || 'subscribe'}
                      onChange={event => updateTarget(index, 'type', event.target.value)}
                    >
                      {targetTypes.map(code => (
                        <option key={code} value={code}>{t(`admin.missions.targetTypes.${code}`)}</option>
                      ))}
                    </select>

                    <button
                      aria-label={t('admin.missions.targetRemove')}
                      className="missions-target__remove"
                      title={t('admin.missions.targetRemove')}
                      type="button"
                      onClick={() => removeTarget(index)}
                    >
                      <FiTrash2 />
                    </button>
                  </div>

                  <div className="missions-target__grid">
                    <label className="missions-target__field is-wide">
                      <span>{t('admin.missions.targetChatField')}</span>

                      <input
                        aria-label={t('admin.missions.targetChatField')}
                        className="docs-input"
                        placeholder={t('admin.missions.targetChatPlaceholder')}
                        title={t('admin.missions.targetChatHint')}
                        value={target.chatId || ''}
                        onChange={event => updateTarget(index, 'chatId', event.target.value)}
                      />
                    </label>

                    <label className="missions-target__field">
                      <span>{t('admin.missions.targetTitleField')}</span>

                      <input
                        aria-label={t('admin.missions.targetTitleField')}
                        className="docs-input"
                        placeholder={t('admin.missions.targetTitlePlaceholder')}
                        value={target.title || ''}
                        onChange={event => updateTarget(index, 'title', event.target.value)}
                      />
                    </label>

                    <label className="missions-target__field">
                      <span>{t('admin.missions.targetUrlField')}</span>

                      <input
                        aria-label={t('admin.missions.targetUrlField')}
                        className="docs-input"
                        placeholder={t('admin.missions.targetUrlPlaceholder')}
                        value={target.url || ''}
                        onChange={event => updateTarget(index, 'url', event.target.value)}
                      />
                    </label>
                  </div>
                </div>
              ))}

              <div className="missions-target-add">
                <button
                  className="btn btn-ghost btn-small"
                  disabled={targets.length >= targetLimit}
                  type="button"
                  onClick={addTarget}
                >
                  <FiPlus /> {t('admin.missions.targetAdd')}
                </button>

                <small className="missions-note">
                  {targets.length >= targetLimit
                    ? t('admin.missions.targetLimit', { count: targetLimit })
                    : t('admin.missions.targetHint')}
                </small>
              </div>
            </Group>
          ) : null}

          {/* 3. Внешний вид: уровень красит карточку, свою палитру можно сбросить. */}
          <Group hint={t('admin.missions.lookHint')} label={t('admin.missions.groupLook')}>
            <div className="missions-field">
              <span>{t('admin.missions.difficultyField')}</span>

              <div className="missions-difficulty">
                {difficulties.map(item => (
                  <button
                    key={item.code}
                    aria-pressed={draft.difficulty === item.code}
                    className={`missions-difficulty__btn ${draft.difficulty === item.code ? 'is-active' : ''}`}
                    style={{ '--swatch': item.color || missionDifficultyMeta[item.code]?.color }}
                    type="button"
                    onClick={() => update('difficulty', item.code)}
                  >
                    <span className="missions-difficulty__dot" aria-hidden="true" />
                    {t(`missions.difficulty.${item.code}`)}
                  </button>
                ))}
              </div>
            </div>

            <div className="missions-field">
              <span>{t('admin.missions.colorField')}</span>

              <div className="missions-colors">
                {difficulties.map(item => (
                  <button
                    key={item.code}
                    aria-label={t(`missions.difficulty.${item.code}`)}
                    aria-pressed={sameColor(color, item.color)}
                    className={`missions-swatch ${sameColor(color, item.color) ? 'is-active' : ''}`}
                    style={{ '--swatch': item.color || missionDifficultyMeta[item.code]?.color }}
                    title={t(`missions.difficulty.${item.code}`)}
                    type="button"
                    onClick={() => update('color', item.color)}
                  />
                ))}

                <label className="missions-custom" title={t('admin.missions.customColor')}>
                  <input type="color" value={color} onChange={event => update('color', event.target.value)} />
                  {t('admin.missions.customColor')}
                </label>

                <button
                  className="missions-color-reset"
                  disabled={!draft.color}
                  title={t('admin.missions.colorReset')}
                  type="button"
                  onClick={() => update('color', '')}
                >
                  <FiRotateCcw />
                </button>
              </div>
            </div>
          </Group>

          {/* 4. Дополнительно: редкие настройки, чтобы не мешали основному сценарию. */}
          <section className={`missions-more ${moreOpen ? 'is-open' : ''}`}>
            <button className="missions-more__head" type="button" onClick={() => setMoreOpen(current => !current)}>
              <FiChevronDown />
              <span>{t('admin.missions.groupMore')}</span>
              <small>{t('admin.missions.moreHint')}</small>
            </button>

            {moreOpen ? (
              <div className="missions-more__body">
                <label className="missions-field">
                  <span>{t('admin.missions.sortField')}</span>

                  <input
                    className="docs-input"
                    inputMode="numeric"
                    min="0"
                    type="number"
                    value={draft.sortOrder}
                    onChange={event => update('sortOrder', event.target.value)}
                  />

                  <small>{t('admin.missions.sortHint')}</small>
                </label>

                {draft.updatedAt ? (
                  <small className="missions-note">{t('admin.missions.updated', { date: draft.updatedAt })}</small>
                ) : null}
              </div>
            ) : null}
          </section>

          {/* 5. Тексты: вкладки языков вместо трёх одинаковых блоков подряд. */}
          <section className="missions-locales">
            <header className="missions-group__head">
              <span className="missions-group__label">{t('admin.missions.textsTitle')}</span>
              <small>{t('admin.missions.textsHint')}</small>
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
              <span>{t('admin.missions.titleLabel')}</span>

              <input
                className="docs-input"
                maxLength={80}
                placeholder={t('admin.missions.titlePlaceholder')}
                value={draft.titles?.[activeLocale] || ''}
                onChange={event => updateText('titles', activeLocale, event.target.value)}
              />
            </label>

            <label className="missions-field">
              <span>{t('admin.missions.textLabel')}</span>

              <textarea
                className="docs-input"
                maxLength={300}
                placeholder={t('admin.missions.textPlaceholder')}
                rows={3}
                value={draft.texts?.[activeLocale] || ''}
                onChange={event => updateText('texts', activeLocale, event.target.value)}
              />
            </label>
          </section>

          <div className="missions-actions">
            <button className="btn btn-primary btn-small missions-actions__save" disabled={busy} type="button" onClick={submit}>
              <FiSave /> {busy ? t('admin.missions.saving') : t('admin.missions.save')}
            </button>

            <button className="btn btn-ghost btn-small" disabled={busy} type="button" onClick={onBack}>
              <FiArrowLeft /> {t('admin.missions.back')}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
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

/** Сравнение цветов без учёта регистра: `#52A8FF` и `#52a8ff` — один цвет. */
function sameColor(first, second) {
  return String(first || '').toLowerCase() === String(second || '').toLowerCase();
}

/**
 * Понятное имя действия из словаря админки (`admin.missions.actions.<code>`):
 * в превью и подтверждениях владелец должен видеть смысл, а не код.
 */
function actionLabel(code, t) {
  const key = `admin.missions.actions.${code}`;
  const value = t(key);

  return value === key ? '' : value;
}

/**
 * Тексты из словаря игрока (`missions.definitions.<код>.<поле>`): их показывает
 * приложение, пока владелец не заполнил свои поля в редакторе.
 */
function playerLabel(mission, t, field) {
  for (const code of [mission?.id, mission?.action]) {
    const key = `missions.definitions.${code}.${field}`;
    const value = t(key);

    if (value !== key) {
      return value;
    }
  }

  return '';
}

/** Имя задания для служебных подписей: свой текст → имя действия → код. */
function missionName(mission, t) {
  const titles = mission?.titles || {};

  return titles.ru
    || Object.values(titles).find(value => String(value || '').trim())
    || actionLabel(mission?.action || mission?.id, t)
    || mission?.id
    || '';
}

/**
 * Режим «Ритма» из самого задания: ежедневное и еженедельное узнаём по паре
 * «тип + стандартные часы», всё остальное — «свой интервал», а без повтора —
 * «один раз». Такой же режим подсвечиваем при открытии редактора.
 */
function rhythmOf(mission, dayHours, weekHours) {
  if (!mission?.repeatable) {
    return 'once';
  }

  const hours = Number(mission?.refreshHours) || 0;

  if (hours === dayHours && mission?.kind === 'daily') {
    return 'daily';
  }

  if (hours === weekHours && mission?.kind === 'weekly') {
    return 'weekly';
  }

  return 'custom';
}

export default MissionEditor;

