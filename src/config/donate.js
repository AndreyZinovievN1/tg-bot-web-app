/**
 * Витрина валюты для экрана «Магазин».
 *
 * Пока это только визуальный макет: цены лежат здесь, сервер их не считает и
 * покупка не создаётся. Когда появится эндпоинт магазина, достаточно будет
 * заменить импорт на данные из bootstrap — разметка и стили останутся прежними.
 *
 * Поля пакета:
 * - `amount` — сколько валюты начислится;
 * - `stars`  — цена в звёздах Telegram;
 * - `rub`    — цена в рублях для оплаты картой / СБП (Tribute);
 * - `bonus`  — плашка выгоды в углу плитки (нет — плашки нет);
 * - `popular` — золотая рамка на рекомендуемом пакете.
 *
 * Астроны (`starcoins`) — премиальная валюта, монеты (`coins`) — рабочая:
 * поэтому у монет пакеты крупнее, а цена за единицу ниже.
 */
export const astronPacks = [
  { id: 'astron_100', amount: 100, stars: 59, rub: 129, bonus: '' },
  { id: 'astron_550', amount: 550, stars: 279, rub: 590, bonus: '+10%' },
  { id: 'astron_1200', amount: 1200, stars: 549, rub: 1190, bonus: '+20%', popular: true },
  { id: 'astron_3000', amount: 3000, stars: 1290, rub: 2790, bonus: '+40%' },
];

export const coinPacks = [
  { id: 'coins_1000', amount: 1000, stars: 19, rub: 39, bonus: '' },
  { id: 'coins_6000', amount: 6000, stars: 99, rub: 199, bonus: '+20%' },
  { id: 'coins_15000', amount: 15000, stars: 219, rub: 449, bonus: '+30%', popular: true },
  { id: 'coins_50000', amount: 50000, stars: 649, rub: 1290, bonus: '+50%' },
];

/**
 * Быстрые переходы по витрине: id секции на экране магазина + ключ подписи
 * в словарях (`shop.donate.jump*`). Порядок совпадает с порядком блоков.
 */
export const donateSections = [
  { id: 'shop-vip', labelKey: 'shop.donate.jumpVip' },
  { id: 'shop-astrons', labelKey: 'shop.donate.jumpAstrons' },
  { id: 'shop-coins', labelKey: 'shop.donate.jumpCoins' },
  { id: 'shop-skins', labelKey: 'shop.donate.jumpSkins' },
];
