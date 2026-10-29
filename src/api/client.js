import { getLocale } from '../i18n/index.js';
import { localizeServerError } from '../i18n/serverMessages.js';

export async function apiRequest(path, options = {}, initData = '') {
  const headers = {
    'Content-Type': 'application/json',
    // Текущий язык уходит на бэкенд: пригодится, если сервер начнёт
    // локализовать свои сообщения сам.
    'Accept-Language': getLocale(),
    ...(options.headers || {}),
  }

  if (initData) {
    headers.Authorization = `tma ${initData}`
  }

  const response = await fetch(path, {
    ...options,
    headers,
  })

  // Все успешные ответы API — JSON. Если пришёл HTML (SPA-фолбэк на опечатку
  // в адресе или страница-заглушка), молча вернуть пустой объект нельзя:
  // экран показал бы пустоту вместо понятной ошибки.
  const contentType = response.headers.get('content-type') || ''
  const isJson = contentType.includes('application/json')
  const payload = isJson ? await response.json().catch(() => ({})) : {}

  if (!response.ok) {
    const error = new Error(localizeServerError(payload.error))
    error.payload = payload
    error.status = response.status
    throw error
  }

  if (!isJson) {
    const error = new Error(localizeServerError(''))
    error.payload = payload
    error.status = response.status
    throw error
  }

  return payload
}

