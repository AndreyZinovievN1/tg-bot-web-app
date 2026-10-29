import { useEffect, useState } from 'react';
import { FiHelpCircle } from 'react-icons/fi';
import { ImCoinDollar } from 'react-icons/im';
import { IoPlanet } from 'react-icons/io5';
import { useTranslation } from '../../i18n/I18nContext.js';
import { formatCompactNumber } from '../../utils/formatters.js';
import { HeaderLanguageButton } from './LanguageSwitcher.jsx';

/**
 * Порог в пикселях: меньшее смещение игнорируем, чтобы шапка не «дёргалась»
 * на инерционном скролле в Telegram.
 */
const scrollThreshold = 12;

/** Позиция скролла: у Telegram Web View прокручивается document.scrollingElement. */
function readScrollTop() {
  return window.scrollY || document.scrollingElement?.scrollTop || 0;
}

/**
 * Верхняя панель: кто в приложении, его баланс и быстрые действия.
 * Банан живёт только в профиле (WalletGrid), здесь его нет.
 * Панель прячется при скролле вниз и возвращается при скролле вверх.
 */
function AppHeader({ user, telegramUser, onOpenHelp }) {
  const { t } = useTranslation();
  const [isHidden, setIsHidden] = useState(false);
  const avatarUrl = telegramUser?.photo_url || user?.photo_url || '';
  const displayName = user?.name || telegramUser?.first_name || telegramUser?.username || 'Space';
  const username = user?.username || telegramUser?.username || '';

  const coins = user?.coins ?? 0;
  const starcoins = user?.starcoins ?? 0;

  useEffect(() => {
    let lastY = readScrollTop();
    let frame = 0;

    const handleScroll = () => {
      if (frame) {
        return;
      }

      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const currentY = readScrollTop();
        const delta = currentY - lastY;

        if (currentY <= 16) {
          setIsHidden(false);
        } else if (delta > scrollThreshold) {
          setIsHidden(true);
        } else if (delta < -scrollThreshold) {
          setIsHidden(false);
        }

        lastY = currentY;
      });
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => {
      window.removeEventListener('scroll', handleScroll);

      if (frame) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, []);

  return (
    <header className={`app-header ${isHidden ? 'is-hidden' : ''}`}>
      <span className="app-header__glow" aria-hidden="true" />

      <div className="app-header__top">
        <div className="app-header__user">
          <span className="app-header__avatar" aria-hidden="true">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" />
            ) : (
              <span>{displayName.charAt(0).toUpperCase()}</span>
            )}
          </span>

          <span className="app-header__identity">
            <span className="app-header__name">{displayName}</span>
            <span className="app-header__caption">{username ? `@${username}` : t('app.title')}</span>
          </span>
        </div>

        <div className="app-header__actions">
          {onOpenHelp ? (
            <button
              aria-label={t('docs.helpButton')}
              className="app-header__help"
              title={t('docs.helpButton')}
              type="button"
              onClick={onOpenHelp}
            >
              <FiHelpCircle />
            </button>
          ) : null}

          <HeaderLanguageButton />
        </div>
      </div>

      <div className="app-header__currencies">
        <span
          className="app-header__currency app-header__currency--coins"
          title={t('header.coins', { value: coins })}
        >
          <ImCoinDollar />
          <span className="app-header__value">{formatCompactNumber(coins)}</span>
        </span>

        <span
          className="app-header__currency app-header__currency--stars"
          title={t('header.starcoins', { value: starcoins })}
        >
          <IoPlanet />
          <span className="app-header__value">{formatCompactNumber(starcoins)}</span>
        </span>
      </div>
    </header>
  );
}

export default AppHeader;
