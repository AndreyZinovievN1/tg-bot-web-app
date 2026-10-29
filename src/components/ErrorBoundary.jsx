import { Component, Fragment } from 'react';
import Card from './Card.jsx';
import { t } from '../i18n/index.js';

/**
 * Ловит ошибки рендера любого экрана. Без него исключение в компоненте
 * оставляет пользователя с пустым белым фоном внутри Telegram WebView: без
 * объяснения и без кнопок, закрыть Mini App можно только вручную.
 *
 * Единственный class-компонент в проекте: ошибку умеет перехватывать только пара
 * `getDerivedStateFromError` + `componentDidCatch`, у функций аналога нет.
 * Тексты берутся через `t` из ядра i18n, а не из контекста: если упал сам
 * провайдер языка, контекст уже недоступен.
 */
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, attempt: 0 };
    this.handleRetry = this.handleRetry.bind(this);
    this.handleReload = this.handleReload.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Полный стек остаётся в консоли WebView (нужен поддержке), а пользователь
    // видит только текст ошибки без стека.
    console.error('[ErrorBoundary]', error, info?.componentStack);
  }

  handleRetry() {
    // Новый ключ поддерева = полный remount: повторная отрисовка того же
    // сломанного состояния обычно просто воспроизводит ошибку.
    this.setState(current => ({ error: null, attempt: current.attempt + 1 }));
  }

  handleReload() {
    window.location.reload();
  }

  render() {
    const { error, attempt } = this.state;

    if (!error) {
      return <Fragment key={attempt}>{this.props.children}</Fragment>;
    }

    return (
      <section className="screen state-screen">
        <Card className="state-card">
          <h2>{t('errors.boundaryTitle')}</h2>
          <p>{t('errors.boundaryText')}</p>
          <pre className="state-details">{String(error?.message || error)}</pre>
          <div className="state-actions">
            <button className="btn btn-primary" type="button" onClick={this.handleRetry}>
              {t('errors.boundaryRetry')}
            </button>
            <button className="btn btn-ghost" type="button" onClick={this.handleReload}>
              {t('errors.boundaryReload')}
            </button>
          </div>
        </Card>
      </section>
    );
  }
}

export default ErrorBoundary;
