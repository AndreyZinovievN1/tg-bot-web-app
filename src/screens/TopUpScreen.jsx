import { useCallback, useEffect, useRef, useState } from 'react';
import { FiArrowLeft, FiRefreshCw } from 'react-icons/fi';
import { apiRequest } from '../api/client.js';
import { useTranslation } from '../i18n/I18nContext.js';
import { formatDate, formatMoney, formatNumber } from '../utils/formatters.js';

export default function TopUpScreen({ initData, onWallet, onBack }) {
  const { t } = useTranslation();
  const [wallet, setWallet] = useState(null);
  const [selectedId, setSelectedId] = useState('');
  const [customAmount, setCustomAmount] = useState('');
  const [method, setMethod] = useState('stars');
  const [busy, setBusy] = useState(false);
  const [refreshCycle, setRefreshCycle] = useState(0);
  const payment = useRef(null);
  const watchedOrders = useRef(new Set());
  const finishInvoice = useRef(null);
  const paying = useRef(false);
  const loading = useRef(false);
  const [error, setError] = useState(false);
  const [notice, setNotice] = useState('');
  const [cardNotice, setCardNotice] = useState('');
  const onWalletRef = useRef(onWallet);
  const alive = useRef(true);
  useEffect(() => { onWalletRef.current = onWallet; }, [onWallet]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; finishInvoice.current?.('unknown'); }; }, []);
  const load = useCallback(async () => {
    if (loading.current) return;
    loading.current = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    const options = { signal: controller.signal };
    try {
      const result = await apiRequest('/api/space-stars', options, initData);
      if (!alive.current) return;
      // Restore observation only: a historical invoice never selects or locks an amount.
      if (result.pendingOrder) watchedOrders.current.add(result.pendingOrder.id);
      setWallet(result); onWalletRef.current(result);
      const orderId = watchedOrders.current.values().next().value;
      if (orderId) {
        watchedOrders.current.delete(orderId);
        try {
          let status = await apiRequest('/api/space-stars/orders/' + orderId, options, initData);
          if (status.order?.status === 'pending') {
            status = await apiRequest('/api/payments/sync', { ...options, method: 'POST', body: JSON.stringify({ orderId }) }, initData);
          }
          if (status.order?.status === 'pending') watchedOrders.current.add(orderId);
          else {
            const updated = await apiRequest('/api/space-stars', options, initData);
            if (alive.current) { setWallet(updated); onWalletRef.current(updated); }
          }
        } catch { watchedOrders.current.add(orderId); }
      }
    } catch { if (alive.current) setError(true); }
    finally { window.clearTimeout(timeout); loading.current = false; }
  }, [initData]);
  useEffect(() => {
    let stopped = false;
    let timer;
    let attempts = 0;
    const tick = async () => {
      if (stopped) return;
      if (document.visibilityState === 'hidden') return;
      await load(); attempts++;
      if (!stopped && (method === 'card' || attempts < 12)) timer = window.setTimeout(tick, 5000);
    };
    timer = window.setTimeout(tick, 0);
    return () => { stopped = true; window.clearTimeout(timer); };
  }, [load, refreshCycle, method]);
  useEffect(() => {
    const resume = () => { if (document.visibilityState !== 'hidden') setRefreshCycle(value => value + 1); };
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('focus', resume);
    const webApp = window.Telegram?.WebApp;
    webApp?.onEvent?.('activated', resume);
    return () => {
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('focus', resume);
      webApp?.offEvent?.('activated', resume);
    };
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 6000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  const packs = (method === 'stars' ? wallet?.packages : wallet?.tribute?.packages) || [];
  const custom = wallet?.custom;
  const customSelected = method === 'stars' && selectedId === 'custom';
  const units = /^\d+$/.test(customAmount) ? Number(customAmount) : NaN;
  const amountValid = custom && Number.isSafeInteger(units) && units >= (custom.minStars || 50) && units <= custom.maxXtr
;
  const customPrice = amountValid ? units : null;
  const creditedUnits = amountValid ? Number(BigInt(units) * BigInt(custom.units) / BigInt(custom.xtr)) : null;
  const customValid = Number.isSafeInteger(creditedUnits) && creditedUnits > 0 && creditedUnits <= custom?.max && amountValid && Number.isSafeInteger(customPrice) && customPrice >= 50 && customPrice <= (custom.maxXtr || 1000000000);
  const selected = customSelected ? (customValid ? { id: 'custom', units: creditedUnits, xtr: customPrice } : null)
    : packs.find(pack => pack.id === selectedId) || packs[0];
  const cardAllowed = wallet?.tribute?.enabled && /^https:\/\/t\.me\/tribute\/app\?startapp=[A-Za-z0-9_-]+$/.test(selected?.link || '');
  const payCard = async () => {
    if (!cardAllowed || paying.current) return;
    const webApp = window.Telegram?.WebApp;
    if (!webApp?.openTelegramLink) { setCardNotice('telegramOnly'); return; }
    paying.current = true; setBusy(true); setError(false); setCardNotice('');
    try {
      // Recheck server owner permission and current catalog before opening checkout.
      const fresh = await apiRequest('/api/space-stars', {}, initData);
      const pack = fresh.tribute?.packages?.find(item => item.id === selected.id);
      if (!fresh.tribute?.enabled || pack?.link !== selected.link || pack?.amount !== selected.amount
        || pack?.currency !== 'USD' || pack?.units !== selected.units) throw new Error('Checkout unavailable');
      webApp.openTelegramLink(pack.link);
    } catch { if (alive.current) setError(true); }
    finally { paying.current = false; if (alive.current) setBusy(false); }
  };
  const xtrPrice = pack => Number.isSafeInteger(pack?.xtr) && pack.xtr > 0 ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>{formatNumber(pack.xtr)}<svg className="top-up__stars-mark" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path fill="#FFD43B" d="M12.38 1.45c.28-.64 1.19-.61 1.44.04l2.26 5.9 6.26.58c.7.07.98.94.45 1.4l-4.76 4.12 1.42 6.11c.16.68-.57 1.21-1.16.85l-5.38-3.25-5.34 3.3c-.59.37-1.33-.15-1.18-.83l.68-3.12 6.66-5.27-5.9 2.76-5.31-4.56c-.53-.46-.26-1.33.44-1.4l6.25-.65 3.17-6.02Z" />
          </svg></span> : t('topUp.xtrUnavailable');
  const packagePrice = pack => method === 'stars' ? xtrPrice(pack)
    : String(pack?.currency).toUpperCase() === 'USD' && Number.isSafeInteger(pack?.amount) && pack.amount > 0
      ? formatMoney(pack.amount / 100, 'USD') : t('topUp.usdUnavailable');
  const pay = async () => {
    if (method !== 'stars' || !wallet?.enabled || !selected || paying.current) return;
    const webApp = window.Telegram?.WebApp;
    if (!webApp?.openInvoice) { setNotice('telegramOnly'); return; }
    paying.current = true; setBusy(true); setError(false); setNotice('');
    let controller;
    let timeout;
    try {
      if (webApp.showConfirm && !await new Promise(resolve => {
        const timer = window.setTimeout(() => resolve(false), 60000);
        webApp.showConfirm(t('topUp.confirmPurchase', { units: formatNumber(selected.units), price: formatNumber(selected.xtr) }),
          confirmed => { window.clearTimeout(timer); resolve(confirmed); });
      })) return;
      // Retry an uncertain invoice request only for the same selection and amount.
      if (!payment.current || payment.current.packageId !== selected.id
        || (selected.id === 'custom' && payment.current.amount !== selected.xtr)) {
        payment.current = { packageId: selected.id, requestId: crypto.randomUUID(), ...(selected.id === 'custom' ? { amount: selected.xtr } : {}) };
      }
      controller = new AbortController();
      timeout = window.setTimeout(() => controller.abort(), 15000);
      const order = await apiRequest('/api/space-stars/invoice', {
        method: 'POST', signal: controller.signal,
        body: JSON.stringify({ packageId: payment.current.packageId, requestId: payment.current.requestId, ...(payment.current.packageId === 'custom' ? { amount: payment.current.amount } : {}) }),
      }, initData);
      window.clearTimeout(timeout);
      if (!alive.current) return;
      watchedOrders.current.add(order.orderId);
      if (order.status === 'pending') {
        const status = await new Promise((resolve, reject) => {
          let done = false;
          let timer;
          const closed = event => { if (event.url === order.invoiceLink) finish(event.status); };
          const finish = value => {
            if (done) return;
            done = true; window.clearTimeout(timer);
            webApp.offEvent?.('invoiceClosed', closed);
            finishInvoice.current = null; resolve(value);
          };
          finishInvoice.current = finish;
          timer = window.setTimeout(() => finish('unknown'), 120000);
          try { webApp.onEvent?.('invoiceClosed', closed); webApp.openInvoice(order.invoiceLink, finish); }
          catch (err) { finish('unknown'); reject(err); }
        });
        // All callback statuses close the UI flow; none authorizes a wallet credit.
        if (status !== 'unknown') payment.current = null;
        if (alive.current && (status === 'failed' || status === 'unknown')) setNotice('invoiceFailed');
      } else payment.current = null;
    } catch { if (alive.current) setError(true); }
    finally {
      window.clearTimeout(timeout);
      paying.current = false;
      if (alive.current) { setBusy(false); setRefreshCycle(value => value + 1); }
    }
  };
  return <section className="screen top-up-screen top-up-unified">
    <button className="screen-back" type="button" onClick={onBack}><FiArrowLeft /> {t('nav.back')}</button>
    <header className="top-up__heading"><h1>{t('topUp.methodsTitle')}</h1></header>
    <div className="top-up__layout">
      <section className="top-up__editor">
        <div className="top-up__methods" role="group" aria-label={t('topUp.method')}>
          <button className="top-up__method" type="button" disabled={busy} aria-pressed={method === 'stars'} onClick={() => setMethod('stars')}>
            <svg className="top-up__stars-mark" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path fill="#FFD43B" d="M12.38 1.45c.28-.64 1.19-.61 1.44.04l2.26 5.9 6.26.58c.7.07.98.94.45 1.4l-4.76 4.12 1.42 6.11c.16.68-.57 1.21-1.16.85l-5.38-3.25-5.34 3.3c-.59.37-1.33-.15-1.18-.83l.68-3.12 6.66-5.27-5.9 2.76-5.31-4.56c-.53-.46-.26-1.33.44-1.4l6.25-.65 3.17-6.02Z" />
          </svg><strong>Stars</strong>
          </button>
          <button className="top-up__method" type="button" disabled={busy} aria-pressed={method === 'card'} onClick={() => setMethod('card')}>
            <span aria-hidden="true">💳</span><strong>Tribute</strong>
          </button>
        </div>
        {method === 'stars' ? <>
          <label className="top-up__custom">
            <span>{t('topUp.amountTitle')}</span>
            <span className="top-up__amount-field"><svg className="top-up__stars-mark" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path fill="#FFD43B" d="M12.38 1.45c.28-.64 1.19-.61 1.44.04l2.26 5.9 6.26.58c.7.07.98.94.45 1.4l-4.76 4.12 1.42 6.11c.16.68-.57 1.21-1.16.85l-5.38-3.25-5.34 3.3c-.59.37-1.33-.15-1.18-.83l.68-3.12 6.66-5.27-5.9 2.76-5.31-4.56c-.53-.46-.26-1.33.44-1.4l6.25-.65 3.17-6.02Z" />
          </svg>
              <input type="text" inputMode="numeric" value={customSelected ? customAmount : selected ? String(selected.xtr) : ''}
                placeholder={t('topUp.amountPlaceholder')} disabled={busy || !custom}
                aria-invalid={customSelected && !customValid}
                onChange={event => { setCustomAmount(event.target.value); setSelectedId('custom'); setNotice(''); setError(false); }} />
            </span>
            {customSelected && customAmount !== '' && !customValid && <span className="top-up__amount-warning">
              {Number.isFinite(units) && units < (custom?.minStars || 50) ? <>{t('topUp.minimumWarning')}<svg className="top-up__stars-mark" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path fill="#FFD43B" d="M12.38 1.45c.28-.64 1.19-.61 1.44.04l2.26 5.9 6.26.58c.7.07.98.94.45 1.4l-4.76 4.12 1.42 6.11c.16.68-.57 1.21-1.16.85l-5.38-3.25-5.34 3.3c-.59.37-1.33-.15-1.18-.83l.68-3.12 6.66-5.27-5.9 2.76-5.31-4.56c-.53-.46-.26-1.33.44-1.4l6.25-.65 3.17-6.02Z" />
          </svg></> : t('topUp.invalidAmount')}
            </span>}
          </label>
          <div className="top-up__quick" role="group" aria-label={t('topUp.packages')}>
            {packs.map(pack => <button key={pack.id} type="button" disabled={busy} aria-pressed={selected?.id === pack.id}
              onClick={() => { setSelectedId(pack.id); setCustomAmount(String(pack.xtr)); setNotice(''); setError(false); }}>{formatNumber(pack.xtr)}</button>)}
          </div>
        </> : <div className="top-up__tribute-products" role="group" aria-label={t('topUp.packages')}>
          {packs.map(pack => <button key={pack.id} type="button" disabled={busy} aria-pressed={selected?.id === pack.id}
            onClick={() => setSelectedId(pack.id)}>
              {[500, 5000, 10000].includes(pack.units) && <small className="top-up__badge"><span aria-hidden="true">{({500:"🔥",5000:"👑",10000:"💎"}[pack.units])}</span> {t('topUp.' + ({500:'popular',5000:'bestValue',10000:'maximum'}[pack.units]))}</small>}
              <img className="top-up__gift-image" src={`/images/tribute/space_tribute_${pack.units}.png?v=20261104`} alt="" width="512" height="512" loading="lazy" />
              <strong>{formatNumber(pack.units)}</strong><small>Space Stars</small><span>{packagePrice(pack)}</span></button>)}
        </div>}
        {!packs.length && <p className="top-up__message">{t('topUp.noPackages')}</p>}
      </section>
      <aside className="top-up__summary">
        {method === 'stars' && custom && <p className="top-up__rate">{t('topUp.exchangeRate', { rate: formatNumber(custom.units / custom.xtr) })}</p>}
        <div className="top-up__receive"><span>{t('topUp.receiveLabel')}</span><strong>{selected ? formatNumber(selected.units) : '—'}</strong><small>Space Stars</small></div>
        <div className="top-up__total"><span>{t('topUp.total')}</span><strong>{selected ? packagePrice(selected) : '—'}</strong></div>
        <button type="button" className="ops-claim top-up__pay" disabled={busy || !selected || (method === 'stars' ? !wallet?.enabled : !cardAllowed)}
          onClick={method === 'stars' ? pay : payCard}>{t('topUp.pay')}</button>
        {method === 'card' ? <p className="top-up__message">{t(cardAllowed ? 'topUp.cardTrial' : 'topUp.ownerOnly')}</p>
          : !wallet?.enabled && <p className="top-up__message">{t(wallet?.paymentUnavailable ? 'topUp.' + wallet.paymentUnavailable : 'topUp.unavailable')}</p>}
        {(method === 'stars' ? notice : cardNotice) && <p className="top-up__message" role="status">{t('topUp.' + (method === 'stars' ? notice : cardNotice))}</p>}
        {error && <p className="top-up__message" role="alert">{t('topUp.failed')}</p>}
        {method === 'card' && <button type="button" className="case-detail__wallet top-up__refresh" onClick={load}><FiRefreshCw aria-hidden="true" />{t('topUp.refresh')}</button>}
      </aside>
    </div>
        {wallet?.available && wallet.history?.length > 0 && (
          <section className="top-up__history-panel">
            <h2>{t('topUp.history')}</h2>
            <ul className="top-up__history">
              {wallet.history.map(row => (
                <li key={row.id}><span>{t('topUp.' + row.kind)}<small>{formatDate(row.created_at)}</small></span>
                  <strong>{row.amount} Space Stars</strong></li>
              ))}
            </ul>
          </section>
        )}

  </section>;
}
