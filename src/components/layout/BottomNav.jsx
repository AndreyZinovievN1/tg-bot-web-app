import { hiddenTabs, tabs } from '../../config/navigation.js';
import { useTranslation } from '../../i18n/I18nContext.js';

function BottomNav({ activeTab, onChange }) {
  const { t } = useTranslation();
  // Разделы без вкладки (например «Склад») открываются из других экранов,
  // поэтому в нижнем меню их не показываем.
  const visibleTabs = tabs.filter(tab => !hiddenTabs.includes(tab.id));

  return (
    <nav className="bottom-nav" aria-label={t('nav.aria')}>
      {visibleTabs.map(tab => (
        <button
          className={activeTab === tab.id ? 'is-active' : ''}
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
        >
          <span className="bottom-nav__icon" aria-hidden="true">
            <tab.Icon />
          </span>
          <span className="bottom-nav__label">{t(tab.labelKey)}</span>
        </button>
      ))}
    </nav>
  );
}

export default BottomNav;

