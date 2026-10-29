import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { I18nProvider } from './i18n/I18nProvider.jsx';
import { applyThemeColors } from './theme/colors.js';
import { applyThemeFonts } from './theme/fonts.js';
import './styles.css';

// Палитра и шрифты применяются до первого рендера, чтобы не было вспышки чужих цветов.
applyThemeColors();
applyThemeFonts();

createRoot(document.getElementById('root')).render(<StrictMode>
    <I18nProvider>
      {/* Страховка на весь UI: упавший экран показывает карточку вместо пустого WebView. */}
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </I18nProvider>
  </StrictMode>);
