import { useState } from 'react';
import { FiPlus, FiSliders, FiStar, FiX } from 'react-icons/fi';
import { caseContentVisuals } from '../../config/casesMeta.js';
import { useTranslation } from '../../i18n/I18nContext.js';

/**
 * Список кейсов в админке — «рейка» приложения.
 *
 * Кейсы лежат в БД (таблица `mini_app_cases`), поэтому список строится прямо из
 * ответа сервера: стартовые шесть кейсов и всё, что владелец создал сам. Строка
 * повторяет карточку из приложения (картинка, акцент, цена) и держит рядом:
 *   - название с кодом — по коду владелец ищет кейс в балансах и заданиях;
 *   - плашку состава — сколько призов и сколько стоит открытие;
 *   - кнопку «настроить» — уводит в редактор кейса;
 *   - тумблер — включён ли кейс (выключенный виден только в админке).
 *
 * Отдельным блоком — создание кейса: код придумывает владелец, а тексты,
 * картинку и призы он задаёт уже в редакторе.
 */
function CasesAdminList({ cases, catalog, busy, language, onCreate, onOpen, onToggle }) {
  const { t } = useTranslation();
  const [creating, setCreating] = useState(false);
  const [code, setCode] = useState('');
  const rows = buildRows(cases || []);
  const activeCount = rows.filter(row => row.active).length;

  const submit = event => {
    event.preventDefault();

    const id = code.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');

    if (!id || busy) {
      return;
    }

    setCode('');
    setCreating(false);
    onCreate(id);
  };

  return (
    <section className="profile-panel docs-admin missions-admin cases-admin">
      <div className="profile-panel__head">
        <h3>{t('admin.cases.listTitle')}</h3>
        <span className="docs-admin__count">
          {activeCount} / {rows.length}
        </span>
      </div>

      <div className="profile-panel__body">
        <p className="admin-hint">{t('admin.cases.listHint')}</p>

        {creating ? (
          <form className="docs-creator" onSubmit={submit}>
            <p className="admin-hint">{t('admin.cases.createHint')}</p>

            <input
              autoFocus
              className="docs-input"
              maxLength={41}
              placeholder={t('admin.cases.codePlaceholder')}
              value={code}
              onChange={event => setCode(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
            />

            <div className="docs-creator__actions">
              <button className="btn btn-primary btn-small" disabled={busy || code.trim().length < 2} type="submit">
                <FiPlus /> {t('admin.cases.create')}
              </button>

              <button className="btn btn-ghost btn-small" type="button" onClick={() => setCreating(false)}>
                <FiX /> {t('admin.cases.cancel')}
              </button>
            </div>
          </form>
        ) : (
          <button className="docs-create-btn" type="button" onClick={() => setCreating(true)}>
            <FiPlus /> {t('admin.cases.newCase')}
          </button>
        )}

        {rows.length === 0 ? (
          <div className="docs-empty">
            <strong>{t('admin.cases.empty')}</strong>
            <small>{t('admin.cases.emptyText')}</small>
          </div>
        ) : (
          <div className="cases-admin-rows">
            {rows.map(item => (
              <CaseRow
                busy={busy}
                item={item}
                key={item.id}
                language={language}
                onOpen={onOpen}
                onToggle={onToggle}
              />
            ))}
          </div>
        )}

        {catalog?.contentLimit ? (
          <small className="missions-note">
            {t('admin.cases.limitNote', { count: catalog.contentLimit })}
          </small>
        ) : null}
      </div>
    </section>
  );
}

/** Одна строка-капсула: картинка, название с кодом, состав, «настроить», тумблер. */
function CaseRow({ item, busy, language, onOpen, onToggle }) {
  const { t } = useTranslation();
  const contents = Array.isArray(item.contents) ? item.contents : [];
  const stars = Number(item.stars) || 0;
  const title = caseTitle(item, language, t);
  const summary = [
    t(`admin.cases.accents.${item.accent}`),
    stars > 0 ? `${stars} ★` : t('admin.cases.noStars'),
    t('admin.cases.prizesCount', { count: contents.length }),
    t('admin.cases.sortShort', { order: item.sortOrder }),
  ].join(' · ');

  return (
    <article className={`cases-admin-row ${item.active ? 'is-on' : ''}`}>
      <button className="cases-admin-row__main" type="button" onClick={() => onOpen(item.id)}>
        <span className="cases-admin-row__thumb" data-case-accent={item.accent}>
          {item.image ? (
            <img alt="" decoding="async" src={item.image} />
          ) : (
            <span aria-hidden="true">{caseContentVisuals[contents[0]?.type] || '📦'}</span>
          )}
        </span>

        <span className="cases-admin-row__body">
          <span className="cases-admin-row__head">
            <strong>{title}</strong>
            <i className="missions-alarm__code" title={t('admin.cases.codeField')}>{item.id}</i>
            {item.featured ? <span className="docs-chip is-topic">{t('admin.cases.spotlightBadge')}</span> : null}
            {item.legacy ? <span className="docs-chip is-topic">{t('admin.cases.legacyBadge')}</span> : null}
          </span>

          <small>{summary}</small>
        </span>
      </button>

      <div className="cases-admin-row__tools">
        <button
          aria-label={t('admin.cases.configure')}
          className="missions-alarm__edit"
          disabled={busy}
          title={t('admin.cases.configure')}
          type="button"
          onClick={() => onOpen(item.id)}
        >
          <FiSliders />
        </button>

        {/* Слова «Включён/Выключен» рядом с тумблером: владельцу понятно без догадок. */}
        <span className={`cases-admin-switch ${item.active ? 'is-on' : 'is-off'}`}>
          <span className="cases-admin-switch__state">
            {item.active ? t('admin.cases.enabled') : t('admin.cases.disabled')}
          </span>

          <button
            aria-checked={item.active}
            aria-label={item.active ? t('admin.cases.deactivate') : t('admin.cases.activate')}
            className={`missions-toggle ${item.active ? 'is-on' : ''}`}
            disabled={busy}
            role="switch"
            title={item.active ? t('admin.cases.deactivate') : t('admin.cases.activate')}
            type="button"
            onClick={() => onToggle(item)}
          >
            <span className="missions-toggle__track" aria-hidden="true" />
          </button>
        </span>
      </div>
    </article>
  );
}

/** Кейсы как в приложении: сначала по `sortOrder`, затем по коду. */
function buildRows(cases) {
  return [...cases].sort((left, right) => (
    (Number(left.sortOrder) || 0) - (Number(right.sortOrder) || 0)
    || String(left.id).localeCompare(String(right.id))
  ));
}

/**
 * Название кейса: язык админки → русский → любой заполненный → словарь стартовых
 * кейсов (`cases.types.<код>.title`) → код. Английский код в списке владельцу не
 * нужен: он должен сразу читать, что включает.
 */
function caseTitle(item, language, t) {
  const titles = item?.titles || {};
  const text = titles[language] || titles.ru || Object.values(titles).find(value => String(value || '').trim());
  const key = `cases.types.${item?.id}.title`;
  const dictionary = t(key);

  return text || (dictionary === key ? '' : dictionary) || item?.id || t('admin.cases.untitled');
}

export default CasesAdminList;
