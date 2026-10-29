import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from './api/client.js';
import BackgroundEffects from './components/BackgroundEffects.jsx';
import AppHeader from './components/layout/AppHeader.jsx';
import BottomNav from './components/layout/BottomNav.jsx';
import HelpSheet from './components/layout/HelpSheet.jsx';
import PurchaseSheet from './components/shop/PurchaseSheet.jsx';
import { useTelegramWebApp } from './hooks/useTelegramWebApp.js';
import { useTranslation } from './i18n/I18nContext.js';
import { syncLocaleFromUser } from './i18n/index.js';
import AdminScreen from './screens/AdminScreen.jsx';
import CasesScreen from './screens/CasesScreen.jsx';
import DocsScreen from './screens/DocsScreen.jsx';
import HomeScreen from './screens/HomeScreen.jsx';
import InventoryScreen from './screens/InventoryScreen.jsx';
import MissionsScreen from './screens/MissionsScreen.jsx';
import ProfileScreen from './screens/ProfileScreen.jsx';
import ShopScreen from './screens/ShopScreen.jsx';
import VipScreen from './screens/VipScreen.jsx';
import { LoadingScreen, MaintenanceScreen, MissingUserScreen, SetupScreen } from './screens/SetupScreens.jsx';
import { readInitialDocsTopic, readInitialTab } from './utils/deepLink.js';

function App() {
  const telegram = useTelegramWebApp();
  const { t } = useTranslation();
  // Стартовая вкладка может прийти дип-линком из бота (раздел «Документация»).
  const [activeTab, setActiveTab] = useState(readInitialTab);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [purchaseItem, setPurchaseItem] = useState(null);
  const [busyItemId, setBusyItemId] = useState(null);
  // Раздел документации: помним, какую статью открыть из окна справки «?».
  const [docsTopic, setDocsTopic] = useState(readInitialDocsTopic);
  /** Окно «?»: краткая справка по текущему разделу, без ухода со страницы. */
  const [helpOpen, setHelpOpen] = useState(false);

  const openDocs = (topicId = '') => {
    setDocsTopic(topicId);
    setActiveTab('docs');
  };

  /** Кнопка «?»: всплывающая справка по текущему экрану. */
  const openSectionHelp = () => setHelpOpen(true);

  /** Из окна справки — сразу в полную статью нужного раздела. */
  const openDocsFromHelp = topicId => {
    setHelpOpen(false);
    openDocs(topicId);
  };

  const changeTab = tabId => {
    if (tabId === 'docs') {
      // Вкладка документации всегда открывает полный список, без фильтра раздела.
      setDocsTopic('');
    }

    setActiveTab(tabId);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const payload = await apiRequest('/api/bootstrap', {}, telegram.initData);
      setData(payload);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [telegram.initData]);

  useEffect(() => {
    document.title = t('app.title');
  }, [t]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Язык из бота (users.lang) применяется, пока пользователь не выбрал язык вручную.
  useEffect(() => {
    if (data?.user?.lang) {
      syncLocaleFromUser(data.user.lang);
    }
  }, [data?.user?.lang]);

  useEffect(() => {
    if (!toast) {
      return undefined;
    }

    const timer = window.setTimeout(() => setToast(''), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const user = data?.user;
  /**
   * Режим «тех. работы»: сервер отдаёт флаг только тем, кому нельзя работать
   * (владельцу бота приходит обычный bootstrap), поэтому заглушку показываем
   * ровно тогда, когда флаг есть и админка этому человеку не видна.
   */
  const maintenance = Boolean(data?.maintenance) && !data?.isOwner;

  const updateFromAction = (payload, message) => {
    setData(payload.data);
    setToast(message);
  };

  const updateData = nextData => {
    setData(nextData);
  };

  /**
   * Точечное обновление блока миссий: экран сам опрашивает сервер, чтобы
   * задания «оживали» без перезахода, и присылает только изменившиеся поля.
   */
  const applyMissions = useCallback(nextMissions => {
    setData(current => (current ? { ...current, ...nextMissions } : current));
  }, []);

  const purchase = async () => {
    if (!purchaseItem) {
      return;
    }

    setBusyItemId(purchaseItem.id);

    try {
      const payload = await apiRequest('/api/shop/purchase', {
        method: 'POST',
        body: JSON.stringify({
          itemId: purchaseItem.id,
        }),
      }, telegram.initData);

      updateFromAction(payload, payload.status === 'owned' ? t('toasts.alreadyOwned') : t('toasts.purchaseDone'));
      setPurchaseItem(null);
    } catch (requestError) {
      setToast(requestError.message);
    } finally {
      setBusyItemId(null);
    }
  };

  const equip = async item => {
    setBusyItemId(item.id);

    try {
      const payload = await apiRequest('/api/shop/equip', {
        method: 'POST',
        body: JSON.stringify({
          itemId: item.id,
        }),
      }, telegram.initData);

      updateFromAction(payload, t('toasts.itemEquipped'));
    } catch (requestError) {
      setToast(requestError.message);
    } finally {
      setBusyItemId(null);
    }
  };

  const toggleFavorite = async item => {
    setBusyItemId(item.id);

    try {
      const payload = await apiRequest('/api/shop/favorite', {
        method: 'POST',
        body: JSON.stringify({
          itemId: item.id,
        }),
      }, telegram.initData);

      updateFromAction(payload, payload.isFavorite ? t('toasts.favoriteAdded') : t('toasts.favoriteRemoved'));
    } catch (requestError) {
      setToast(requestError.message);
    } finally {
      setBusyItemId(null);
    }
  };

  // Тех. работы: ни шапки, ни навигации — только заглушка и кнопка «Проверить снова».
  if (maintenance) {
    return (
      <div className="app-shell">
        <BackgroundEffects />
        <main className="app-main">
          <MaintenanceScreen onRetry={loadData} />
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <BackgroundEffects />

      {/* VIP рисует собственную компактную шапку (назад / Space / баланс),
          поэтому общая панель здесь не нужна — как и в профиле. */}
      {activeTab !== 'profile' && activeTab !== 'vip' && (
        <AppHeader
          key={activeTab}
          onOpenHelp={activeTab === 'admin' ? null : openSectionHelp}
          telegramUser={telegram.user}
          user={data?.user}
        />
      )}


      <main className="app-main">
        {activeTab === 'admin' && <AdminScreen initData={telegram.initData} />}
        {activeTab !== 'admin' && loading && <LoadingScreen />}
        {activeTab !== 'admin' && !loading && error && <SetupScreen error={error} onRetry={loadData} />}
        {activeTab !== 'admin' && !loading && !error && !user && <MissingUserScreen onRetry={loadData} />}
        {activeTab !== 'admin' && !loading && !error && user && (
          <>
            {activeTab === 'cases' && (
              <CasesScreen data={data} initData={telegram.initData} onData={updateData} onToast={setToast} />
            )}
            {activeTab === 'home' && <HomeScreen data={data} onOpenDocs={openDocs} onOpenShop={() => setActiveTab('shop')} />}
            {activeTab === 'shop' && (
              <ShopScreen
                busyItemId={busyItemId}
                data={data}
                onEquip={equip}
                onFavorite={toggleFavorite}
                onPurchase={setPurchaseItem}
              />
            )}
            {activeTab === 'inventory' && (
              <InventoryScreen
                busyItemId={busyItemId}
                data={data}
                onBack={() => setActiveTab('profile')}
                onEquip={equip}
                onFavorite={toggleFavorite}
              />
            )}
            {activeTab === 'missions' && (
              <MissionsScreen
                data={data}
                initData={telegram.initData}
                onData={updateData}
                onMissions={applyMissions}
                onToast={setToast}
              />
            )}
            {activeTab === 'profile' && (
              <ProfileScreen
                data={data}
                telegramUser={telegram.user}
                onOpenAdmin={() => setActiveTab('admin')}
                onOpenDocs={() => openDocs('profile')}
                onOpenHelp={openSectionHelp}
                onOpenInventory={() => setActiveTab('inventory')}
                onOpenVip={() => setActiveTab('vip')}
              />
            )}
            {/* VIP покупается за звёзды Telegram: счёт открывает сам Telegram. */}
            {activeTab === 'vip' && (
              <VipScreen
                data={data}
                initData={telegram.initData}
                onBack={() => setActiveTab('profile')}
                onData={updateData}
                onToast={setToast}
              />
            )}

            {activeTab === 'docs' && (
              <DocsScreen
                initData={telegram.initData}
                key={docsTopic}
                topic={docsTopic}
              />
            )}
          </>
        )}
      </main>

      <BottomNav activeTab={activeTab} onChange={changeTab} />

      {purchaseItem && user && (
        <PurchaseSheet
          busy={busyItemId === purchaseItem.id}
          item={purchaseItem}
          user={user}
          onCancel={() => setPurchaseItem(null)}
          onConfirm={purchase}
        />
      )}

      {/* В окне документации кнопка «Полная документация» не нужна: мы уже там. */}
      {helpOpen && (
        <HelpSheet
          onClose={() => setHelpOpen(false)}
          onOpenDocs={activeTab === 'docs' ? null : openDocsFromHelp}
          sectionId={activeTab}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

export default App;
