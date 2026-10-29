import { useState } from 'react';
import { FiX } from 'react-icons/fi';
import Card from '../components/Card.jsx';
import MiniShopItem from '../components/shop/MiniShopItem.jsx';
import RelationshipCard from '../components/profile/RelationshipCard.jsx';
import SectionTitle from '../components/common/SectionTitle.jsx';
import WalletGrid from '../components/profile/WalletGrid.jsx';
import { useTranslation } from '../i18n/I18nContext.js';
import { totalCaseBalance } from '../utils/caseText.js';
import { dismissDocsOnboarding, isDocsOnboardingDismissed } from '../utils/docs.js';
import { formatActivity, formatNumber } from '../utils/formatters.js';
import { getAvatarText } from '../utils/shop.js';

function HomeScreen({ data, onOpenShop, onOpenDocs }) {
  const { t } = useTranslation();
  const { user, marriage, inventory, shopItems, activeItems, cases } = data;
  const featuredItems = shopItems.filter(item => !item.is_owned).slice(0, 4);
  const caseCount = totalCaseBalance(cases);
  const activityPercent = Math.min(100, Math.round((Number(user.msg_count || 0) / 1000) * 100));
  // Приветственный блок документации показываем один раз, пока его не закрыли.
  const [docsPromo, setDocsPromo] = useState(() => !isDocsOnboardingDismissed());

  return (
    <section className="screen home-screen">
      <Card className="home-hero">
        <div className="home-hero__glow" />
        <div className="home-hero__user">
          <div className="avatar-ring">{getAvatarText(user, activeItems)}</div>
          <div>
            <p>{t('home.welcome')}</p>
            <h2>{user.name}</h2>
          </div>
          <span>{formatActivity(user.last_activity)}</span>
        </div>

        <div className="home-hero__metric">
          <div>
            <span>{t('home.messagesInSpace')}</span>
            <strong>{formatNumber(user.msg_count)}</strong>
          </div>
          <span>{activityPercent}%</span>
        </div>
        <div className="progress-line">
          <span style={{ width: `${activityPercent}%` }} />
        </div>

        <div className="home-hero__actions">
          <button className="btn btn-primary" type="button" onClick={onOpenShop}>
            {t('home.openShop')}
          </button>
          <button className="btn btn-ghost" type="button" onClick={onOpenShop}>
            {t('home.buyForStars')}
          </button>
        </div>
      </Card>

      <WalletGrid user={user} />

      <div className="stats-grid">
        <Card>
          <strong>{formatNumber(user.msg_count)}</strong>
          <span>{t('home.statsMessages')}</span>
        </Card>
        <Card>
          <strong>{formatNumber(caseCount)}</strong>
          <span>{t('home.statsCases')}</span>
        </Card>
        <Card>
          <strong>{inventory.length}</strong>
          <span>{t('home.statsItems')}</span>
        </Card>
      </div>

      {docsPromo && onOpenDocs ? (
        <div className="docs-new">
          <span className="docs-new__glow" aria-hidden="true" />
          <span className="docs-new__icon" aria-hidden="true">✨</span>

          <span className="docs-new__body">
            <strong>{t('docs.newChipTitle')}</strong>
            <small>{t('docs.newChipText')}</small>
          </span>

          <span className="docs-new__actions">
            <button className="docs-new__open" type="button" onClick={() => onOpenDocs('home')}>
              {t('docs.newChipOpen')}
            </button>
            <button
              aria-label={t('docs.newChipClose')}
              className="docs-new__close"
              title={t('docs.newChipClose')}
              type="button"
              onClick={() => {
                dismissDocsOnboarding();
                setDocsPromo(false);
              }}
            >
              <FiX />
            </button>
          </span>
        </div>
      ) : null}

      <RelationshipCard marriage={marriage} />

      <SectionTitle action={t('home.market')} title={t('home.recommendations')} />
      <div className="mini-shop-grid">
        {featuredItems.length > 0 ? (
          featuredItems.map(item => <MiniShopItem key={item.id} item={item} />)
        ) : (
          <Card className="empty-card">
            <h3>{t('home.collectionDone')}</h3>
            <p>{t('home.collectionDoneText')}</p>
          </Card>
        )}
      </div>
    </section>
  );
}

export default HomeScreen;
