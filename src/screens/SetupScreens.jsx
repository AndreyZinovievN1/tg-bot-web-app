import Card from '../components/Card.jsx';
import { useTranslation } from '../i18n/I18nContext.js';

export function LoadingScreen() {
  const { t } = useTranslation();

  return (
    <section className="screen state-screen">
      <Card className="state-card">
        <div className="loader-orbit" />
        <h2>{t('setup.loadingTitle')}</h2>
        <p>{t('setup.loadingText')}</p>
      </Card>
    </section>
  );
}

export function SetupScreen({ error, onRetry }) {
  const { t } = useTranslation();

  return (
    <section className="screen state-screen">
      <Card className="state-card">
        <h2>{t('setup.serverTitle')}</h2>
        <p>{error}</p>
        <div className="setup-steps">
          <span>{t('setup.step1')}</span>
          <span>{t('setup.step2')}</span>
          <span>{t('setup.step3')}</span>
        </div>
        <button className="btn btn-primary" type="button" onClick={onRetry}>
          {t('setup.retry')}
        </button>
      </Card>
    </section>
  );
}

export function MissingUserScreen({ onRetry }) {
  const { t } = useTranslation();

  return (
    <section className="screen state-screen">
      <Card className="state-card">
        <h2>{t('setup.missingTitle')}</h2>
        <p>{t('setup.missingText')}</p>
        <button className="btn btn-primary" type="button" onClick={onRetry}>
          {t('setup.refresh')}
        </button>
      </Card>
    </section>
  );
}

/**
 * Режим «тех. работы»: сервер включает его владельцу бота, остальным вместо
 * данных приходит только флаг `maintenance`. Текст настраивается словарями
 * (`maintenance.*`), повторный запрос — кнопка «Проверить снова».
 */
export function MaintenanceScreen({ onRetry }) {
  const { t } = useTranslation();

  return (
    <section className="screen state-screen">
      <Card className="state-card">
        <div className="state-icon" aria-hidden="true">🛠️</div>
        <h2>{t('maintenance.title')}</h2>
        <p>{t('maintenance.text')}</p>
        <button className="btn btn-primary" type="button" onClick={onRetry}>
          {t('maintenance.refresh')}
        </button>
      </Card>
    </section>
  );
}

