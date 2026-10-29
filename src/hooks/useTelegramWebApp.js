import { useEffect, useState } from 'react'
import { themeHex } from '../theme/colors.js'

export function useTelegramWebApp() {
  const [state] = useState(readTelegramState)

  useEffect(() => {
    const webApp = window.Telegram?.WebApp

    if (!webApp) {
      return
    }

    webApp.ready()
    webApp.expand()
    // Шапка Telegram — в цвет фона приложения (цвета в src/theme/colors.js).
    webApp.setHeaderColor?.(themeHex('bg'))
    webApp.setBackgroundColor?.(themeHex('bg'))
  }, [])

  return state
}

function readTelegramState() {
  const webApp = window.Telegram?.WebApp

  return {
    initData: webApp?.initData || '',
    isTelegram: Boolean(webApp?.initData),
    user: webApp?.initDataUnsafe?.user || null,
  }
}
