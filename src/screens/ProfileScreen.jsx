import {
  FiBarChart2,
  FiChevronRight,
  FiClock,
  FiGlobe,
  FiHeart,
  FiHelpCircle,
  FiShield,
  FiSliders,
} from 'react-icons/fi';
import { TbBackpack, TbCrown } from 'react-icons/tb';
import LanguageSwitcher from '../components/layout/LanguageSwitcher.jsx';
import ActiveStyleChips from '../components/profile/ActiveStyleChips.jsx';
import ActivityDonut from '../components/profile/ActivityDonut.jsx';
import CooldownGrid from '../components/profile/CooldownGrid.jsx';
import MarriageCompact from '../components/profile/MarriageCompact.jsx';
import ProfileOverview from '../components/profile/ProfileOverview.jsx';
import { profileSections } from '../config/features.js';
import { useTranslation } from '../i18n/I18nContext.js';
import { totalCaseBalance } from '../utils/caseText.js';
import { formatDateOnly, formatNumber } from '../utils/formatters.js';
import { getAvatarText, getChartRingPalette, getChartSkinUrl } from '../utils/shop.js';

/**
 * Каскадное появление блоков: каждый следующий блок на шаг позже.
 * Задержки задаются инлайном (animationDelay), сами анимации — в styles.css,
 * раздел «ПРОФИЛЬ v2»: только transform/opacity, чтобы не грузить телефон.
 */
const riseStep = 60;

function riseStyle(index) {
  return { animationDelay: `${Math.min(index, 8) * riseStep}ms` };
}

function ProfileScreen({ data, telegramUser, onOpenAdmin, onOpenDocs, onOpenHelp, onOpenInventory, onOpenVip }) {
  const { t, tp } = useTranslation();
  const { user, marriage, activeItems, inventory, cases, isOwner, vip } = data;
  const groupsActivity = safeObject(user.groups_activity);
  const caseCount = totalCaseBalance(cases);
  const vipStatus = vip || { active: false, until: null, daysLeft: 0 };
  const avatarUrl = telegramUser?.photo_url || user.photo_url || '';
  // Активная «Графика» из инвентаря (категории chart_skin_*) — фон шапки.
  const chartSkinUrl = getChartSkinUrl(activeItems?.chart);
  // Палитра неонового кольца: у каждой графики свой ручной набор из трёх цветов.
  const [ringFirst, ringSecond, ringThird] = getChartRingPalette(activeItems?.chart);
  const ringStyle = ringFirst
    ? { '--ring-first': ringFirst, '--ring-second': ringSecond, '--ring-third': ringThird }
    : undefined;
  const displayName = user.name || telegramUser?.first_name || telegramUser?.username || t('profile.nameFallback');
  const username = user.username || telegramUser?.username || '';
  // «В Space с …» — дата регистрации из бота; при пустом значении строку не показываем.
  const memberSince = user.created_at ? formatDateOnly(user.created_at) : '';

  return (
    <section className="screen profile-screen">
      {/* ── Шапка: кто в приложении + справка ─────────────────────── */}
      <header className={`profile-hero profile-rise${chartSkinUrl ? ' has-cover' : ''}`} style={riseStyle(0)}>
        {/* Обложка: активная «Графика» от самого верха карточки до середины аватара. */}
        {chartSkinUrl ? (
          <span
            className="profile-hero__cover"
            style={{ '--profile-hero-cover-image': `url("${chartSkinUrl}")` }}
            aria-hidden="true"
          />
        ) : null}

        <div className="profile-hero__top">
          <button
            aria-label={t('profile.help')}
            className="profile-hero__help"
            title={t('profile.help')}
            type="button"
            onClick={onOpenHelp}
          >
            <FiHelpCircle />
          </button>
        </div>

        <div className="profile-identity">
          <div className="profile-avatar" aria-label={t('profile.avatarAria')} role="img" style={ringStyle}>
            <span className="profile-avatar__ring" aria-hidden="true" />
            {avatarUrl ? (
              <img src={avatarUrl} alt="" />
            ) : (
              <span className="profile-avatar__letter">{getAvatarText(user, activeItems)}</span>
            )}
          </div>

          {/* Имя: у VIP рядом с ником стоит аккуратная корона. */}
          <h2>
            <span className="profile-name__text">{displayName}</span>
            {vipStatus.active ? (
              <span className="profile-name__crown" title={t('profile.vipBadge')}>
                <TbCrown aria-hidden="true" />
              </span>
            ) : null}
          </h2>

          {/* Только юзернейм: без пилюли активности он стоит по центру. */}
          <p className="profile-identity__meta">
            <span className="profile-identity__handle">{username ? `@${username}` : t('profile.noUsername')}</span>
          </p>

          {memberSince ? (
            <span className="profile-identity__since">{t('profile.memberSince', { date: memberSince })}</span>
          ) : null}
        </div>
      </header>

      {/* ── Кошелёк + плитки статистики: одна карточка, одни стили ── */}
      <ProfileOverview
        caseCount={caseCount}
        itemCount={inventory.length}
        riseStyle={riseStyle(1)}
        user={user}
      />

      {/* ── VIP: золотая карточка-вход в раздел подписки ──────────── */}
      {profileSections.vipEntry && onOpenVip && (
        <button
          className={`profile-vip profile-rise ${vipStatus.active ? 'is-active' : ''}`}
          style={riseStyle(2)}
          type="button"
          onClick={onOpenVip}
        >
          <span className="profile-vip__icon" aria-hidden="true"><TbCrown /></span>

          <span className="profile-vip__body">
            <span className="profile-vip__title">
              <strong>{t('profile.vipTitle')}</strong>
              <span className="profile-vip__badge">{t('profile.vipBadge')}</span>
            </span>

            <small>
              {vipStatus.active
                ? t('profile.vipActiveText', { date: formatDateOnly(vipStatus.until) })
                : t('profile.vipText')}
            </small>
          </span>

          {vipStatus.active ? (
            <span className="profile-vip__days">
              {tp('profile.vipDays', vipStatus.daysLeft, { days: vipStatus.daysLeft })}
            </span>
          ) : null}
          <FiChevronRight aria-hidden="true" />
        </button>
      )}

      <ProfilePanel
        icon={<FiClock />}
        riseStyle={riseStyle(3)}
        title={t('profile.sectionTimers')}
        tone="accent"
      >
        <CooldownGrid user={user} />
      </ProfilePanel>

      <ProfilePanel
        icon={<FiHeart />}
        riseStyle={riseStyle(4)}
        title={t('profile.sectionRelationship')}
        tone="pink"
      >
        <MarriageCompact marriage={marriage} />
      </ProfilePanel>

      <ProfilePanel
        icon={<FiSliders />}
        riseStyle={riseStyle(5)}
        title={t('profile.sectionStyle')}
        tone="ice"
      >
        <ActiveStyleChips activeItems={activeItems} />
      </ProfilePanel>

      {/* Панель «Активность в группах» скрыта переключателем в src/config/features.js */}
      {profileSections.groupActivity && Object.keys(groupsActivity).length > 0 && (
        <ProfilePanel
          icon={<FiBarChart2 />}
          riseStyle={riseStyle(6)}
          title={t('profile.sectionGroupActivity')}
          tone="green"
        >
          <ActivityDonut groupsActivity={groupsActivity} />
        </ProfilePanel>
      )}

      <ProfilePanel
        icon={<FiGlobe />}
        riseStyle={riseStyle(7)}
        title={t('profile.sectionLanguage')}
        tone="amber"
      >
        <LanguageSwitcher />
      </ProfilePanel>

      {/* Склад убран из нижнего меню и живёт заметным блоком внизу профиля. */}
      {profileSections.storeEntry && onOpenInventory && (
        <button className="profile-store profile-rise" style={riseStyle(8)} type="button" onClick={onOpenInventory}>
          <span className="profile-store__icon" aria-hidden="true"><TbBackpack /></span>

          <span className="profile-store__body">
            <strong>{t('profile.storeTitle')}</strong>
            <small>{t('profile.storeText')}</small>
          </span>

          <span className="profile-store__count">{formatNumber(inventory.length)}</span>
          <FiChevronRight aria-hidden="true" />
        </button>
      )}

      {/* Кнопка документации скрыта: раздел переехал во вкладку нижнего меню. */}
      {profileSections.docsEntry && onOpenDocs && (
        <button className="profile-docs profile-rise" style={riseStyle(9)} type="button" onClick={onOpenDocs}>
          <span aria-hidden="true">📘</span>
          {t('docs.open')}
        </button>
      )}

      {/* Вход в админ-панель: только владелец бота (isOwner приходит из bootstrap). */}
      {profileSections.adminEntry && isOwner && onOpenAdmin && (
        <button className="profile-owner profile-rise" style={riseStyle(10)} type="button" onClick={onOpenAdmin}>
          <span className="profile-owner__icon" aria-hidden="true"><FiShield /></span>

          <span className="profile-owner__body">
            <strong>{t('profile.ownerTitle')}</strong>
            <small>{t('profile.ownerText')}</small>
          </span>

          <span className="profile-owner__badge">{t('profile.ownerBadge')}</span>
          <FiChevronRight aria-hidden="true" />
        </button>
      )}
    </section>
  );
}

/**
 * Панель профиля: иконка-тон в заголовке + заголовок.
 * Один и тот же каркас для таймеров, связи, оформления и языка —
 * поэтому блоки выглядят как один набор, а не как разные карточки.
 */
function ProfilePanel({ icon, riseStyle, title, tone = 'accent', children }) {
  return (
    <section className={`profile-panel profile-panel--${tone} profile-rise`} style={riseStyle}>
      <div className="profile-panel__head">
        {icon ? <span className="profile-panel__icon" aria-hidden="true">{icon}</span> : null}
        <h3>{title}</h3>
      </div>
      <div className="profile-panel__body">{children}</div>
    </section>
  );
}

function safeObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value;
}

export default ProfileScreen;
