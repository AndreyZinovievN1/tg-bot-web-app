import { t, tp } from './index.js';

/**
 * Сервер Mini App хранит и отдаёт часть текстов на русском языке
 * (тексты ошибок, названия и описания наград в истории открытий кейсов).
 * Чтобы не менять API бэкенда, переводим их на клиенте:
 *   - ошибки ищутся по словарю точных совпадений;
 *   - награды восстанавливаются по `type` + `payload` либо по шаблону заголовка.
 */

const serverErrorKeys = {
  'Слишком много попыток. Попробуй через минуту.': 'tooManyAttempts',
  'В таблице owner нет строки для сохранения пароля': 'ownerRowMissing',
  'Пароль админки не задан в таблице owner': 'adminPasswordMissing',
  '3 неверные попытки. Ввод заблокирован на 1 минуту.': 'threeAttemptsLocked',
  'Некорректный chat_id': 'invalidChatId',
  'Пользователь не найден': 'userNotFound',
  'Пользователь не найден в базе бота': 'userNotFoundDb',
  'Неизвестный тип кейса': 'unknownCaseType',
  'Некорректное количество': 'invalidQuantity',
  'Некорректный товар': 'invalidItem',
  'Товар не найден': 'itemNotFound',
  'Сначала купите предмет': 'buyFirst',
  'Этот тип предмета нельзя установить': 'itemNotEquippable',
  'Недостаточно астронов': 'notEnoughStarcoins',
  'Этот кейс пока нельзя купить за Telegram Stars': 'caseNotForSale',
  'Такого тарифа VIP нет': 'vipPlanUnknown',
  'Оплата картой пока не настроена': 'tributeDisabled',
  'Не передан orderId': 'orderIdMissing',
  'Недостаточно прав для payment relay': 'paymentRelayForbidden',
  'Неизвестная задача': 'unknownMission',
  'Задача пока не готова': 'missionNotReady',
  'Награда за эту задачу уже забрана': 'missionAlreadyClaimed',
  'PostgreSQL отклонил пароль. Проверь DB_USER/DB_PASSWORD или DATABASE_URL в .env Mini App.': 'dbPasswordRejected',
  'Mini App не смог подключиться к PostgreSQL. Проверь DB_HOST/DB_PORT и запущен ли Postgres.': 'dbUnreachable',
  'Не хватает служебных таблиц mini app. Выполни SQL для админки и кейсов на сервере.': 'dbTablesMissing',
  'Мини-приложению не хватает прав на таблицу vip_users для продления подписки.': 'dbVipPrivileges',
  'Ошибка сервера Mini App': 'internal',
  'Сессия админки истекла. Войди заново.': 'adminSessionExpired',
  'Откройте приложение внутри Telegram': 'openInTelegram',
  'Ошибка авторизации Telegram': 'telegramAuthFailed',
  'Некорректная статья': 'invalidDocArticle',
  'Статья не найдена': 'docArticleNotFound',
  'Укажи название статьи': 'docTitleRequired',
  'Некорректное направление': 'docInvalidDirection',
  'Статья слишком большая': 'docTooLarge',
  'Раздел доступен только владельцу бота': 'ownerOnly',
  'Задание не найдено': 'missionNotFound',
  'Задание с таким кодом уже существует': 'missionCodeExists',
  'Код задания: латиница, цифры и «_», 2–41 символ, начинается с буквы': 'missionCodeInvalid',
  'Неизвестное действие задания': 'missionActionUnknown',
  'Добавьте хотя бы одну цель: канал или чат, подписку на который проверяет бот': 'missionTargetsRequired',
  'Введи фигуру или код доступа': 'adminCredentialRequired',
  'Код доступа: 4 или 8 цифр': 'adminCodeFormat',
  'Фигура должна содержать минимум 4 разные точки': 'adminPatternShort',
  'Неверная фигура': 'adminPatternWrong',
  'Неверный код доступа': 'adminCodeWrong',
  'Фигура не настроена': 'adminPatternMissing',
  'Код доступа не настроен': 'adminCodeMissing',
  'Неизвестный способ входа': 'adminMethodUnknown',
  'Нельзя удалить единственный способ входа': 'adminLastMethod',
  'Владелец БД должен добавить колонку owner.mini_app_code_hash': 'adminCodeColumnMissing',
  'Владелец БД должен добавить колонку owner.mini_app_access_off': 'adminAccessOffColumnMissing',
  'Эндпоинт не найден': 'endpointNotFound',
  'Кейс не найден': 'caseNotFound',
  'Кейс с таким кодом уже существует': 'caseCodeExists',
  'Код кейса: латиница, цифры и «_», 2–41 символ, начинается с буквы': 'caseCodeInvalid',
  'Наполнение кейса: нужен хотя бы один приз с весом': 'caseContentsRequired',
  'Картинка кейса: нужен файл PNG': 'caseImageInvalid',
  'Картинка кейса слишком большая': 'caseImageTooBig',
  'Картинка кейса не найдена': 'caseImageMissing',
  'Неизвестный скин графика': 'caseSkinUnknown',
  'Неизвестный подарок кейса': 'caseGiftUnknown',
  'У скина графика не выбран предмет': 'caseSkinItemMissing',
  'Этот кейс закончился': 'caseEmpty',
  'Подарок не удалось выдать. Кейс не списан.': 'giftDeliveryFailed',
};

/** Перевод текста ошибки, пришедшей с сервера. Неизвестный текст остаётся как есть. */
export function localizeServerError(message) {
  const text = String(message || '').trim();

  if (!text) {
    return t('errors.requestFailed');
  }

  const key = serverErrorKeys[text];

  return key ? t(`errors.server.${key}`) : text;
}

/** Перевод награды кейса, пришедшей с сервера (`type` + `payload`). */
export function localizeReward(reward) {
  if (!reward || typeof reward !== 'object') {
    return reward;
  }

  const amount = Number(reward.payload?.amount ?? 0);
  const days = Number(reward.payload?.days ?? 0);

  if (reward.type === 'coins') {
    return { ...reward, title: tp('rewards.coinsTitle', amount, { amount }), description: t('rewards.coinsText') };
  }

  if (reward.type === 'starcoins') {
    return { ...reward, title: tp('rewards.starcoinsTitle', amount, { amount }), description: t('rewards.starcoinsText') };
  }

  if (reward.type === 'vip') {
    return { ...reward, title: tp('rewards.vipTitle', days, { days }), description: t('rewards.vipText') };
  }

  if (reward.type === 'shop_item') {
    return { ...reward, description: t('rewards.shopItemText') };
  }

  if (reward.type === 'gift') {
    return { ...reward, title: t('cases.giftTypes.bear'), description: t('rewards.giftText') };
  }

  return reward;
}

/**
 * Перевод заголовка награды из истории открытий
 * (`case_openings.reward_title` хранится на русском).
 */
export function localizeStoredRewardTitle(title) {
  const text = String(title || '').trim();

  if (!text) {
    return text;
  }

  const normalized = text.toLowerCase();
  const amountMatch = normalized.match(/^\+\s*([\d\s]+)\s*([a-zа-яёіїєґ]+)\.?$/);
  const vipMatch = normalized.match(/^vip\s+(?:на|for)\s+(\d+)\s*(?:дн|днів|дней|day|days)\.?$/);

  if (amountMatch) {
    const amount = Number(amountMatch[1].replaceAll(/\s+/g, ''));
    const unit = amountMatch[2];

    if (!Number.isNaN(amount)) {
      if (unit.startsWith('монет') || unit.startsWith('coin')) {
        return tp('rewards.coinsTitle', amount, { amount });
      }

      if (unit.startsWith('астрон') || unit.startsWith('astron')) {
        return tp('rewards.starcoinsTitle', amount, { amount });
      }
    }
  }

  if (vipMatch) {
    const days = Number(vipMatch[1]);

    return tp('rewards.vipTitle', days, { days });
  }

  if (normalized === 'мишка telegram' || normalized === 'ведмедик telegram') {
    return t('cases.giftTypes.bear');
  }

  return text;
}
