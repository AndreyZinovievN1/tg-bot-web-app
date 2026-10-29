/**
 * Стартовый набор статей документации.
 *
 * Используется при инициализации схемы: если таблица `doc_articles` пуста, статьи
 * создаются автоматически, чтобы раздел не встречал пользователя пустым экраном.
 * Наполнение идемпотентно выполняется при каждом старте API: отсутствующие
 * статьи и языковые версии добавляются, а уже существующий (в том числе
 * админский) текст не перезаписывается — см. `ensureDocsSchema` в server/docsApi.js.
 * Переменная `DOCS_SEED=refresh` дополнительно обновляет существующие версии,
 * `DOCS_SEED=false` отключает наполнение полностью.
 *
 * Каждая статья — карточка с иконкой, темой оформления, разделом справки и
 * языковыми версиями (ru/uk/en). Тексты намеренно короткие: это справка, а не
 * учебник. Здесь же собраны примеры всех типов блоков (плашки, шаги, метрики,
 * спойлер, прогресс, кнопка-ссылка), чтобы в админке было с чего начать.
 *
 * Статьи без украинской версии показывают, как работает откат на доступный язык.
 */

const commonArticles = [
  {
    icon: '🚀',
    theme: 'nebula',
    status: 'published',
    topic: 'common',
    translations: {
      ru: {
        title: 'Как пользоваться Space',
        summary: 'Короткий тур по Mini App: кейсы, маркет, склад, миссии и профиль.',
        blocks: [
          {
            type: 'text',
            size: 'lg',
            align: 'left',
            text: 'Space — это Mini App с кейсами, маркетом, складом, миссиями и профилем. Всё, что вы получаете в боте, автоматически отображается здесь.\n\nРазделы собраны в нижнем меню — переключаться между ними можно одним касанием.',
          },
          {
            type: 'badges',
            items: [
              { text: '🎁 Кейсы', tone: 'accent' },
              { text: '🛍 Маркет', tone: 'accent-2' },
              { text: '🎒 Склад', tone: 'success' },
              { text: '🎯 Миссии', tone: 'warn' },
            ],
          },
          { type: 'heading', level: 2, align: 'left', text: 'С чего начать' },
          {
            type: 'list',
            style: 'number',
            items: [
              'Откройте раздел **Кейсы** и заберите доступные лут-боксы.',
              'Загляните в **Маркет**: за астроны можно купить титулы, смайлики и оформление.',
              'Соберите ежедневные **Миссии** — за них дают опыт и подарочные кейсы.',
              'Проверьте **Профиль**: там таймеры, отношения и выбранный стиль.',
            ],
          },
          {
            type: 'callout',
            tone: 'tip',
            title: 'Совет',
            text: 'Нажмите на глобус в шапке или в разделе «Профиль», чтобы сменить язык интерфейса — перевод применится сразу, без перезагрузки.',
          },
          {
            type: 'spoiler',
            title: 'Бот и приложение — это один аккаунт?',
            text: 'Да. Награды, покупки, VIP и брак хранятся в базе бота, поэтому всё, что вы получили в чате, сразу видно в приложении — и наоборот.',
          },
        ],
      },
      uk: {
        title: 'Як користуватися Space',
        summary: 'Короткий тур Mini App: кейси, маркет, склад, місії та профіль.',
        blocks: [
          {
            type: 'text',
            size: 'lg',
            align: 'left',
            text: 'Space — це Mini App з кейсами, маркетом, складом, місіями та профілем. Усе, що ви отримуєте в боті, автоматично показується тут.\n\nРозділи зібрані в нижньому меню — перемикатися між ними можна одним дотиком.',
          },
          {
            type: 'badges',
            items: [
              { text: '🎁 Кейси', tone: 'accent' },
              { text: '🛍 Маркет', tone: 'accent-2' },
              { text: '🎒 Склад', tone: 'success' },
              { text: '🎯 Місії', tone: 'warn' },
            ],
          },
          { type: 'heading', level: 2, align: 'left', text: 'З чого почати' },
          {
            type: 'list',
            style: 'number',
            items: [
              'Відкрий розділ **Кейси** та забери доступні лут-бокси.',
              'Завітай у **Маркет**: за астрони можна купити титули, смайли та оформлення.',
              'Збери щоденні **Місії** — за них дають досвід і подарункові кейси.',
              'Перевір **Профіль**: там таймери, стосунки та обраний стиль.',
            ],
          },
          {
            type: 'callout',
            tone: 'tip',
            title: 'Порада',
            text: 'Натисни на глобус у шапці або в розділі «Профіль», щоб змінити мову інтерфейсу — переклад застосується одразу, без перезавантаження.',
          },
          {
            type: 'spoiler',
            title: 'Бот і додаток — це один акаунт?',
            text: 'Так. Нагороди, покупки, VIP і шлюб зберігаються в базі бота, тому все, що ти отримав у чаті, одразу видно в додатку — і навпаки.',
          },
        ],
      },
      en: {
        title: 'How to use Space',
        summary: 'A quick tour of the Mini App: cases, market, inventory, missions and profile.',
        blocks: [
          {
            type: 'text',
            size: 'lg',
            align: 'left',
            text: 'Space is a Mini App with cases, market, inventory, missions and profile. Everything you get in the bot shows up here automatically.\n\nAll sections live in the bottom menu — switch between them with a single tap.',
          },
          {
            type: 'badges',
            items: [
              { text: '🎁 Cases', tone: 'accent' },
              { text: '🛍 Market', tone: 'accent-2' },
              { text: '🎒 Inventory', tone: 'success' },
              { text: '🎯 Missions', tone: 'warn' },
            ],
          },
          { type: 'heading', level: 2, align: 'left', text: 'Where to start' },
          {
            type: 'list',
            style: 'number',
            items: [
              'Open **Cases** and grab the loot boxes you already own.',
              'Check the **Market**: buy titles, emojis and profile styles with astrones.',
              'Complete daily **Missions** for experience and bonus cases.',
              'Visit your **Profile** for timers, relationships and the active style.',
            ],
          },
          {
            type: 'callout',
            tone: 'tip',
            title: 'Tip',
            text: 'Tap the globe in the header or in the “Profile” section to change the interface language — it applies instantly, without a reload.',
          },
          {
            type: 'spoiler',
            title: 'Are the bot and the app one account?',
            text: 'Yes. Rewards, purchases, VIP and marriage live in the bot database, so anything you get in a chat appears in the app right away — and vice versa.',
          },
        ],
      },

    },
  },

  {
    icon: '➕',
    theme: 'aurora',
    status: 'published',
    topic: 'common',
    translations: {
      ru: {
        title: 'Как добавить Space в чат',
        summary: 'Пошагово: добавить бота в группу, выдать права и включить функции.',
        blocks: [
          {
            type: 'text',
            size: 'md',
            align: 'left',
            text: 'Space работает в группах и супергруппах. По умолчанию все функции выключены — их нужно включить в панели настроек.',
          },
          {
            type: 'badges',
            items: [
              { text: 'Группы', tone: 'accent' },
              { text: 'Супергруппы', tone: 'accent' },
              { text: 'Темы (топики)', tone: 'success' },
            ],
          },
          { type: 'heading', level: 2, align: 'left', text: 'Пошаговая инструкция' },
          {
            type: 'steps',
            items: [
              {
                title: 'Откройте бота',
                text: 'Нажмите на @iSpaceRobot в поиске Telegram или перейдите по кнопке внизу статьи.',
              },
              {
                title: 'Добавьте в чат',
                text: 'Кнопка «Добавить в группу» → выберите чат → подтвердите добавление.',
              },
              {
                title: 'Выдайте права',
                text: 'Обязательно: **удаление сообщений** и **пригласительные ссылки**. Для модерации — **блокировка пользователей**.',
              },
              {
                title: 'Включите функции',
                text: 'Отправьте в чате `!космос` и нажмите «⚙️» — включите нужные блоки: антиспам, приветствия, игры.',
              },
            ],
          },
          {
            type: 'callout',
            tone: 'warn',
            title: 'Важно',
            text: 'Без права «Удаление сообщений» бот не сможет модерировать: команды будут отвечать ошибкой, а фильтры не сработают.',
          },
          {
            type: 'spoiler',
            title: 'Бот молчит в чате — что проверить?',
            text: '1. Бот администратор чата.\n2. Права «Удаление сообщений» выданы.\n3. Функции включены: `!космос` → «⚙️» → нужный блок.\n4. Чат не в чёрном списке бота.',
          },
          { type: 'divider', style: 'stars' },
          {
            type: 'link',
            text: 'Открыть @iSpaceRobot в Telegram',
            href: 'https://t.me/iSpaceRobot',
            icon: '🚀',
            tone: 'accent',
          },
        ],
      },
      uk: {
        title: 'Як додати Space у чат',
        summary: 'Покроково: додати бота в групу, видати права та увімкнути функції.',
        blocks: [
          {
            type: 'text',
            size: 'md',
            align: 'left',
            text: 'Space працює в групах і супергрупах. За замовчуванням усі функції вимкнені — їх потрібно увімкнути в панелі налаштувань.',
          },
          {
            type: 'badges',
            items: [
              { text: 'Групи', tone: 'accent' },
              { text: 'Супергрупи', tone: 'accent' },
              { text: 'Теми (топіки)', tone: 'success' },
            ],
          },
          { type: 'heading', level: 2, align: 'left', text: 'Покрокова інструкція' },
          {
            type: 'steps',
            items: [
              { title: 'Відкрий бота', text: 'Натисни на @iSpaceRobot у пошуку Telegram або перейди за кнопкою внизу статті.' },
              { title: 'Додай у чат', text: 'Кнопка «Додати до групи» → вибери чат → підтверди додавання.' },
              { title: 'Видай права', text: 'Обов’язково: **видалення повідомлень** і **запрошувальні посилання**. Для модерації — **блокування користувачів**.' },
              { title: 'Увімкни функції', text: 'Надішли в чаті `!космос` і натисни «⚙️» — увімкни потрібні блоки: антиспам, привітання, ігри.' },
            ],
          },
          {
            type: 'callout',
            tone: 'warn',
            title: 'Важливо',
            text: 'Без права «Видалення повідомлень» бот не зможе модерувати: команди відповідатимуть помилкою, а фільтри не спрацюють.',
          },
          {
            type: 'spoiler',
            title: 'Бот мовчить у чаті — що перевірити?',
            text: '1. Бот адміністратор чату.\n2. Права «Видалення повідомлень» видані.\n3. Функції увімкнено: `!космос` → «⚙️» → потрібний блок.\n4. Чат не в чорному списку бота.',
          },
          { type: 'divider', style: 'stars' },
          {
            type: 'link',
            text: 'Відкрити @iSpaceRobot у Telegram',
            href: 'https://t.me/iSpaceRobot',
            icon: '🚀',
            tone: 'accent',
          },
        ],
      },
      en: {
        title: 'How to add Space to a chat',
        summary: 'Step by step: add the bot to a group, grant rights and enable features.',
        blocks: [
          {
            type: 'text',
            size: 'md',
            align: 'left',
            text: 'Space works in groups and supergroups. All features are disabled by default — enable them in the settings panel.',
          },
          {
            type: 'badges',
            items: [
              { text: 'Groups', tone: 'accent' },
              { text: 'Supergroups', tone: 'accent' },
              { text: 'Topics', tone: 'success' },
            ],
          },
          { type: 'heading', level: 2, align: 'left', text: 'Step-by-step guide' },
          {
            type: 'steps',
            items: [
              { title: 'Open the bot', text: 'Tap @iSpaceRobot in Telegram search or use the button at the bottom of this article.' },
              { title: 'Add it to a chat', text: 'Tap “Add to group” → pick the chat → confirm.' },
              { title: 'Grant rights', text: 'Required: **delete messages** and **invite links**. For moderation: **ban users**.' },
              { title: 'Enable features', text: 'Send `!космос` in the chat and tap “⚙️” — turn on the blocks you need: antispam, greetings, games.' },
            ],
          },
          {
            type: 'callout',
            tone: 'warn',
            title: 'Important',
            text: 'Without the “Delete messages” right the bot cannot moderate: commands will answer with an error and filters will not work.',
          },
          {
            type: 'spoiler',
            title: 'The bot is silent in the chat — what to check?',
            text: '1. The bot is a chat admin.\n2. The “Delete messages” right is granted.\n3. Features are enabled: `!космос` → “⚙️” → the block you need.\n4. The chat is not in the bot blacklist.',
          },
          { type: 'divider', style: 'stars' },
          {
            type: 'link',
            text: 'Open @iSpaceRobot in Telegram',
            href: 'https://t.me/iSpaceRobot',
            icon: '🚀',
            tone: 'accent',
          },
        ],
      },

    },
  },

  {
    icon: '🪐',
    theme: 'ocean',
    status: 'published',
    topic: 'common',
    translations: {
      ru: {
        title: 'Экономика Space: монеты, астроны и банан',
        summary: 'Чем отличаются валюты и что можно купить за каждую.',
        blocks: [
          {
            type: 'text',
            size: 'md',
            align: 'left',
            text: 'В Space три ресурса: **монеты** для игр, **астроны** для покупок и **банан** для рейтинга. Это разные вещи — не путайте их при обмене.',
          },
          {
            type: 'stats',
            items: [
              { icon: '🪙', label: 'Монеты', value: 'Игры' },
              { icon: '🪐', label: 'Астроны', value: 'Маркет' },
              { icon: '🍌', label: 'Банан', value: 'Рейтинг' },
            ],
          },
          { type: 'heading', level: 2, align: 'left', text: 'Где получить и куда потратить' },
          {
            type: 'table',
            head: ['Ресурс', 'Где получить', 'Куда потратить'],
            rows: [
              ['Монеты 🪙', 'Рулетка, мешок удачи, кейсы', 'Ставки, дуэли, подарки друзьям'],
              ['Астроны 🪐', 'Кейсы, миссии, покупка за звёзды Telegram', 'Маркет, VIP, обмен на монеты'],
              ['Банан 🍌', 'Команда `!банан` раз в 8 часов', 'Верхние строчки «Топ банан»'],
              ['Кейсы 🎁', 'Миссии и покупка за звёзды Telegram', 'Открытие наград'],
            ],
          },
          { type: 'heading', level: 2, align: 'left', text: 'Передача валюты' },
          {
            type: 'list',
            style: 'bullet',
            items: [
              'Команда `!передать` — ответьте на сообщение или укажите ID/юзернейм.',
              'Дальше выберите валюту: монеты или астроны.',
              'Сумма ограничена — минимум и максимум показаны в подсказке бота.',
            ],
          },
          {
            type: 'callout',
            tone: 'tip',
            title: 'Совет',
            text: 'Астроны — самая универсальная валюта: их можно обменять на монеты в разделе «Донат», а вот обратный обмен бот не делает.',
          },
        ],
      },
      uk: {
        title: 'Економіка Space: монети, астрони та банан',
        summary: 'Чим відрізняються валюти й що можна купити за кожну.',
        blocks: [
          {
            type: 'text',
            size: 'md',
            align: 'left',
            text: 'У Space три ресурси: **монети** для ігор, **астрони** для покупок і **банан** для рейтингу. Це різні речі — не плутай їх під час обміну.',
          },
          {
            type: 'stats',
            items: [
              { icon: '🪙', label: 'Монети', value: 'Ігри' },
              { icon: '🪐', label: 'Астрони', value: 'Маркет' },
              { icon: '🍌', label: 'Банан', value: 'Рейтинг' },
            ],
          },
          { type: 'heading', level: 2, align: 'left', text: 'Де отримати й куди витратити' },
          {
            type: 'table',
            head: ['Ресурс', 'Де отримати', 'Куди витратити'],
            rows: [
              ['Монети 🪙', 'Рулетка, мішок удачі, кейси', 'Ставки, дуелі, подарунки друзям'],
              ['Астрони 🪐', 'Кейси, місії, купівля за зірки Telegram', 'Маркет, VIP, обмін на монети'],
              ['Банан 🍌', 'Команда `!банан` раз на 8 годин', 'Верхні рядки «Топ банан»'],
              ['Кейси 🎁', 'Місії та купівля за зірки Telegram', 'Відкриття нагород'],
            ],
          },
          { type: 'heading', level: 2, align: 'left', text: 'Передача валюти' },
          {
            type: 'list',
            style: 'bullet',
            items: [
              'Команда `!передать` — дай відповідь на повідомлення або вкажи ID/юзернейм.',
              'Далі вибери валюту: монети або астрони.',
              'Сума обмежена — мінімум і максимум показані в підказці бота.',
            ],
          },
          {
            type: 'callout',
            tone: 'tip',
            title: 'Порада',
            text: 'Астрони — найуніверсальніша валюта: їх можна обміняти на монети в розділі «Донат», а от зворотного обміну бот не робить.',
          },
        ],
      },
      en: {
        title: 'Space economy: coins, astrones and the banana',
        summary: 'How the currencies differ and what each of them buys.',
        blocks: [
          {
            type: 'text',
            size: 'md',
            align: 'left',
            text: 'Space has three resources: **coins** for games, **astrones** for purchases and the **banana** for the leaderboard. They are different things — do not mix them up when trading.',
          },
          {
            type: 'stats',
            items: [
              { icon: '🪙', label: 'Coins', value: 'Games' },
              { icon: '🪐', label: 'Astrones', value: 'Market' },
              { icon: '🍌', label: 'Banana', value: 'Rating' },
            ],
          },
          { type: 'heading', level: 2, align: 'left', text: 'Where to get them and what to spend them on' },
          {
            type: 'table',
            head: ['Resource', 'Where to get it', 'What to spend it on'],
            rows: [
              ['Coins 🪙', 'Roulette, lucky bag, cases', 'Bets, duels, gifts to friends'],
              ['Astrones 🪐', 'Cases, missions, Telegram star top-up', 'Market, VIP, exchange for coins'],
              ['Banana 🍌', 'The `!банан` command every 8 hours', 'Top lines of the banana leaderboard'],
              ['Cases 🎁', 'Missions and Telegram star purchases', 'Opening rewards'],
            ],
          },
          { type: 'heading', level: 2, align: 'left', text: 'Sending currency' },
          {
            type: 'list',
            style: 'bullet',
            items: [
              'Use `!передать` — reply to a message or specify an ID/username.',
              'Then pick the currency: coins or astrones.',
              'The amount is limited — the minimum and maximum are shown in the bot hint.',
            ],
          },
          {
            type: 'callout',
            tone: 'tip',
            title: 'Tip',
            text: 'Astrones are the most universal currency: they can be exchanged for coins in the “Donate” section, but the reverse exchange is not available.',
          },
        ],
      },

    },
  },

  {
    icon: '🌐',
    theme: 'mint',
    status: 'published',
    topic: 'common',
    translations: {
      ru: {
        title: 'Язык интерфейса и оформление',
        summary: 'Как сменить язык приложения и что именно переводится.',
        blocks: [
          {
            type: 'text',
            size: 'md',
            align: 'left',
            text: 'Приложение и бот поддерживают три языка: русский, украинский и английский. Переключение мгновенное — перезагружать ничего не нужно.',
          },
          {
            type: 'badges',
            items: [
              { text: '🇷🇺 Русский', tone: 'accent' },
              { text: '🇺🇦 Українська', tone: 'success' },
              { text: '🇬🇧 English', tone: 'accent-2' },
            ],
          },
          { type: 'heading', level: 2, align: 'left', text: 'Как сменить язык' },
          {
            type: 'steps',
            items: [
              { title: 'Через шапку', text: 'Нажмите на кнопку с глобусом в верхней части экрана.' },
              { title: 'Через профиль', text: 'Раздел «Профиль» → панель «Язык» → выберите нужный.' },
            ],
          },
          { type: 'heading', level: 2, align: 'left', text: 'Что переводится' },
          {
            type: 'list',
            style: 'check',
            items: [
              'Интерфейс приложения: меню, кнопки, подписи.',
              'Статьи документации и частые вопросы.',
              'Названия кейсов, наград и предметов маркета.',
            ],
          },
          {
            type: 'callout',
            tone: 'info',
            title: 'В чатах',
            text: 'Язык сообщений бота в группе настраивается отдельно: панель `!космос` → «🌐 Языки».',
          },
          {
            type: 'spoiler',
            title: 'Если у статьи нет версии на моём языке',
            text: 'Приложение покажет ближайший доступный перевод и подсветит пометку «перевод». Чипы языков в читалке помогут переключиться одним касанием.',
          },
        ],
      },
      uk: {
        title: 'Мова інтерфейсу та оформлення',
        summary: 'Як змінити мову додатка і що саме перекладається.',
        blocks: [
          {
            type: 'text',
            size: 'md',
            align: 'left',
            text: 'Додаток і бот підтримують три мови: російську, українську та англійську. Перемикання миттєве — перезавантажувати нічого не потрібно.',
          },
          {
            type: 'badges',
            items: [
              { text: '🇷🇺 Русский', tone: 'accent' },
              { text: '🇺🇦 Українська', tone: 'success' },
              { text: '🇬🇧 English', tone: 'accent-2' },
            ],
          },
          { type: 'heading', level: 2, align: 'left', text: 'Як змінити мову' },
          {
            type: 'steps',
            items: [
              { title: 'Через шапку', text: 'Натисни кнопку з глобусом у верхній частині екрана.' },
              { title: 'Через профіль', text: 'Розділ «Профіль» → панель «Мова» → вибери потрібну.' },
            ],
          },
          { type: 'heading', level: 2, align: 'left', text: 'Що перекладається' },
          {
            type: 'list',
            style: 'check',
            items: [
              'Інтерфейс додатка: меню, кнопки, підписи.',
              'Статті документації та часті питання.',
              'Назви кейсів, нагород і предметів маркету.',
            ],
          },
          {
            type: 'callout',
            tone: 'info',
            title: 'У чатах',
            text: 'Мова повідомлень бота в групі налаштовується окремо: панель `!космос` → «🌐 Мови».',
          },
          {
            type: 'spoiler',
            title: 'Якщо у статті немає версії моєю мовою',
            text: 'Додаток покаже найближчий доступний переклад і підсвітить позначку «переклад». Чипи мов у читалці допоможуть перемкнутися одним дотиком.',
          },
        ],
      },
      en: {
        title: 'Interface language and appearance',
        summary: 'How to switch the app language and what exactly gets translated.',
        blocks: [
          {
            type: 'text',
            size: 'md',
            align: 'left',
            text: 'The app and the bot support three languages: Russian, Ukrainian and English. Switching is instant — no reload required.',
          },
          {
            type: 'badges',
            items: [
              { text: '🇷🇺 Русский', tone: 'accent' },
              { text: '🇺🇦 Українська', tone: 'success' },
              { text: '🇬🇧 English', tone: 'accent-2' },
            ],
          },
          { type: 'heading', level: 2, align: 'left', text: 'How to change the language' },
          {
            type: 'steps',
            items: [
              { title: 'From the header', text: 'Tap the globe button at the top of the screen.' },
              { title: 'From the profile', text: 'The “Profile” section → the “Language” panel → pick one.' },
            ],
          },
          { type: 'heading', level: 2, align: 'left', text: 'What gets translated' },
          {
            type: 'list',
            style: 'check',
            items: [
              'The app interface: menus, buttons, labels.',
              'Documentation articles and frequent questions.',
              'Names of cases, rewards and market items.',
            ],
          },
          {
            type: 'callout',
            tone: 'info',
            title: 'In chats',
            text: 'The bot message language in a group is configured separately: panel `!космос` → “🌐 Languages”.',
          },
          {
            type: 'spoiler',
            title: 'What if an article has no version in my language',
            text: 'The app shows the closest available translation and marks it as a fallback. The language chips in the reader let you switch with one tap.',
          },
        ],
      },

    },
  },

  {
    icon: '🛡',
    theme: 'graphite',
    status: 'published',
    topic: 'common',
    translations: {
      ru: {
        title: 'Модерация: антиспам и фильтры чата',
        summary: 'Что умеет Space в группе и как включить защиту от спама.',
        blocks: [
          {
            type: 'text',
            size: 'md',
            align: 'left',
            text: 'Модерация включается в панели настроек: отправьте в чате `!космос` и нажмите «⚙️». Каждый фильтр переключается отдельно, по умолчанию выключены все.',
          },
          { type: 'heading', level: 2, align: 'left', text: 'Фильтры чата' },
          {
            type: 'table',
            head: ['Фильтр', 'Что делает', 'Наказание'],
            rows: [
              ['🛡 Антиспам', 'Удаляет повторы, флуд и спам-сообщения', 'Бан'],
              ['🔗 Ссылки', 'Удаляет внешние ссылки', 'Мут 5 минут'],
              ['🔍 Гиперссылки', 'Удаляет скрытые ссылки', 'Мут 5 минут'],
              ['🖲 Кнопки', 'Удаляет ссылки в кнопках', 'Мут 5 минут'],
              ['📢 Пересылки', 'Удаляет пересылы из каналов', 'Мут 5 минут'],
              ['🌀 @Юзеры', 'Удаляет упоминания каналов, групп и ботов', 'Мут 10 минут'],
              ['👤 Каналы', 'Удаляет сообщения от имени канала', 'Блокирует режим'],
              ['🤖 Боты', 'Банит новых ботов в чате', 'Мут 10 минут добавившему'],
              ['👳 Арабский', 'Удаляет арабские символы и похожие имена', 'Бан'],
              ['🔧 Системные', 'Удаляет системные сообщения о входах и выходах', '—'],
            ],
          },
          { type: 'heading', level: 2, align: 'left', text: 'Ночной режим' },
          {
            type: 'steps',
            items: [
              { title: 'Откройте настройки', text: 'Панель `!космос` → «⚙️» → «🌒 Ночной режим».' },
              { title: 'Выберите время', text: 'Укажите «Начало» и «Конец», меняя стрелки, и подтвердите.' },
              { title: 'Настройте поведение', text: 'Переключатели решают, что бот делает ночью.' },
            ],
          },
          {
            type: 'list',
            style: 'bullet',
            items: [
              'Удалять сообщения участников (кроме администраторов).',
              'Удалять все сообщения подряд.',
              'Удалять только медиа.',
              'Присылать уведомление в начале и в конце ночного режима.',
            ],
          },
          {
            type: 'callout',
            tone: 'warn',
            title: 'Важно',
            text: 'Модерация требует права «Блокировка пользователей»: без него бот видит нарушения, но не может выдавать наказания.',
          },
          {
            type: 'spoiler',
            title: 'Где посмотреть журнал наказаний?',
            text: 'Подключите «Канал Событий»: туда пишутся входы и выходы, автоматические наказания, изменения настроек и роли. Настраивается в панели `!космос` → «⚙️».',
          },
        ],
      },
      uk: {
        title: 'Модерація: антиспам і фільтри чату',
        summary: 'Що вміє Space у групі та як увімкнути захист від спаму.',
        blocks: [
          {
            type: 'text',
            size: 'md',
            align: 'left',
            text: 'Модерація вмикається в панелі налаштувань: надішли в чаті `!космос` і натисни «⚙️». Кожен фільтр перемикається окремо, за замовчуванням вимкнені всі.',
          },
          { type: 'heading', level: 2, align: 'left', text: 'Фільтри чату' },
          {
            type: 'table',
            head: ['Фільтр', 'Що робить', 'Покарання'],
            rows: [
              ['🛡 Антиспам', 'Видаляє повтори, флуд і спам', 'Бан'],
              ['🔗 Посилання', 'Видаляє зовнішні посилання', 'Мут 5 хвилин'],
              ['🔍 Гіперпосилання', 'Видаляє приховані посилання', 'Мут 5 хвилин'],
              ['🖲 Кнопки', 'Видаляє посилання в кнопках', 'Мут 5 хвилин'],
              ['📢 Пересилання', 'Видаляє пересилання з каналів', 'Мут 5 хвилин'],
              ['🌀 @Юзери', 'Видаляє згадки каналів, груп і ботів', 'Мут 10 хвилин'],
              ['👤 Канали', 'Видаляє повідомлення від імені каналу', 'Блокує режим'],
              ['🤖 Боти', 'Банить нових ботів', 'Мут 10 хвилин тому, хто додав'],
              ['👳 Арабська', 'Видаляє арабські символи та схожі імена', 'Бан'],
              ['🔧 Системні', 'Видаляє системні повідомлення про входи й виходи', '—'],
            ],
          },
          { type: 'heading', level: 2, align: 'left', text: 'Нічний режим' },
          {
            type: 'steps',
            items: [
              { title: 'Відкрий налаштування', text: 'Панель `!космос` → «⚙️» → «🌒 Нічний режим».' },
              { title: 'Вибери час', text: 'Вкажи «Початок» і «Кінець», змінюючи стрілки, та підтверди.' },
              { title: 'Налаштуй поведінку', text: 'Перемикачі вирішують, що бот робить уночі.' },
            ],
          },
          {
            type: 'list',
            style: 'bullet',
            items: [
              'Видаляти повідомлення учасників (крім адміністраторів).',
              'Видаляти всі повідомлення підряд.',
              'Видаляти лише медіа.',
              'Надсилати сповіщення на початку та в кінці нічного режиму.',
            ],
          },
          {
            type: 'callout',
            tone: 'warn',
            title: 'Важливо',
            text: 'Модерація потребує права «Блокування користувачів»: без нього бот бачить порушення, але не може видавати покарання.',
          },
          {
            type: 'spoiler',
            title: 'Де подивитися журнал покарань?',
            text: 'Підключи «Канал Подій»: туди пишуться входи й виходи, автоматичні покарання, зміни налаштувань і ролі. Налаштовується в панелі `!космос` → «⚙️».',
          },
        ],
      },
      en: {
        title: 'Moderation: antispam and chat filters',
        summary: 'What Space does in a group and how to enable spam protection.',
        blocks: [
          {
            type: 'text',
            size: 'md',
            align: 'left',
            text: 'Moderation is enabled in the settings panel: send `!космос` in the chat and tap “⚙️”. Every filter is toggled separately and all of them are off by default.',
          },
          { type: 'heading', level: 2, align: 'left', text: 'Chat filters' },
          {
            type: 'table',
            head: ['Filter', 'What it does', 'Punishment'],
            rows: [
              ['🛡 Antispam', 'Removes repeats, flooding and spam', 'Ban'],
              ['🔗 Links', 'Removes external links', 'Mute 5 minutes'],
              ['🔍 Hyperlinks', 'Removes hidden links', 'Mute 5 minutes'],
              ['🖲 Buttons', 'Removes links inside buttons', 'Mute 5 minutes'],
              ['📢 Forwards', 'Removes channel forwards', 'Mute 5 minutes'],
              ['🌀 @Users', 'Removes mentions of channels, groups and bots', 'Mute 10 minutes'],
              ['👤 Channels', 'Removes messages sent as a channel', 'Blocks the mode'],
              ['🤖 Bots', 'Bans new bots in the chat', 'Mute 10 minutes for the adder'],
              ['👳 Arabic', 'Removes Arabic characters and lookalike names', 'Ban'],
              ['🔧 System', 'Removes system join and leave messages', '—'],
            ],
          },
          { type: 'heading', level: 2, align: 'left', text: 'Night mode' },
          {
            type: 'steps',
            items: [
              { title: 'Open the settings', text: 'Panel `!космос` → “⚙️” → “🌒 Night mode”.' },
              { title: 'Pick the time', text: 'Set the start and end hours with the arrows and confirm.' },
              { title: 'Configure the behaviour', text: 'The toggles decide what the bot does at night.' },
            ],
          },
          {
            type: 'list',
            style: 'bullet',
            items: [
              'Delete member messages (admins excluded).',
              'Delete every message.',
              'Delete media only.',
              'Send notifications when the night mode starts and ends.',
            ],
          },
          {
            type: 'callout',
            tone: 'warn',
            title: 'Important',
            text: 'Moderation needs the “Ban users” right: without it the bot sees violations but cannot punish anyone.',
          },
          {
            type: 'spoiler',
            title: 'Where can I see the punishment log?',
            text: 'Connect an “Events channel”: joins and leaves, automatic punishments, setting and role changes are written there. Configure it in the panel `!космос` → “⚙️”.',
          },
        ],
      },

    },
  },
  {
    icon: '🎭',
    theme: 'candy',
    status: 'published',
    topic: 'common',
    translations: {
      ru: {
        title: 'Игры, RP-команды и рейтинги',
        summary: 'Рулетка, банан, дуэли, свадьбы и собственные команды чата.',
        blocks: [
          {
            type: 'text',
            size: 'md',
            align: 'left',
            text: 'Кроме модерации Space умеет развлекать: игры на монеты, собственные RP-команды, свадьбы и рейтинги.',
          },
          { type: 'heading', level: 2, align: 'left', text: 'Игры' },
          {
            type: 'badges',
            items: [
              { text: '🎰 !рулетка', tone: 'accent' },
              { text: '🍌 !банан', tone: 'success' },
              { text: '⚔️ !дуэль', tone: 'warn' },
              { text: '💰 Мешок удачи', tone: 'accent-2' },
            ],
          },
          {
            type: 'list',
            style: 'bullet',
            items: [
              '`!рулетка` — ставки монетами: точное число ×5, цвет и чёт/нечёт ×2, зеро ×10.',
              '`!банан` — растит банан на 1–3 см раз в 8 часов.',
              '`!дуэль` — звёздный бой один на один, ответом на сообщение соперника.',
              '**Мешок удачи** — случайные монеты, раз в 8 часов.',
            ],
          },
          { type: 'heading', level: 2, align: 'left', text: 'RP-команды и топы' },
          {
            type: 'list',
            style: 'bullet',
            items: [
              '`!рп` — локальные команды чата, `!грп` — глобальные команды бота.',
              '`+рп команда текст GIF_ID` — добавить локальную RP-команду.',
              '`Топ банан`, `Топ смс`, `Топ монет`, `Топ` — глобальные рейтинги.',
            ],
          },
          {
            type: 'callout',
            tone: 'info',
            title: 'Полезно знать',
            text: 'Глобальные RP-команды добавляют агенты звёзд. В текстах работает разметка, а `name1` и `name2` заменяются на участников, на которых ответили.',
          },
          {
            type: 'spoiler',
            title: 'Что такое «Шалости»?',
            text: 'Это блок 18+ и игр: RP 18+, свадьбы и рулетка. Каждый раздел включается отдельно: панель `!космос` → «😈 Шалости / 🎮 Игры».',
          },
        ],
      },
      uk: {
        title: 'Ігри, RP-команди та рейтинги',
        summary: 'Рулетка, банан, дуелі, весілля та власні команди чату.',
        blocks: [
          {
            type: 'text',
            size: 'md',
            align: 'left',
            text: 'Окрім модерації Space уміє розважати: ігри на монети, власні RP-команди, весілля та рейтинги.',
          },
          { type: 'heading', level: 2, align: 'left', text: 'Ігри' },
          {
            type: 'badges',
            items: [
              { text: '🎰 !рулетка', tone: 'accent' },
              { text: '🍌 !банан', tone: 'success' },
              { text: '⚔️ !дуель', tone: 'warn' },
              { text: '💰 Мішок удачі', tone: 'accent-2' },
            ],
          },
          {
            type: 'list',
            style: 'bullet',
            items: [
              '`!рулетка` — ставки монетами: точне число ×5, колір і пар/непар ×2, зеро ×10.',
              '`!банан` — вирощує банан на 1–3 см раз на 8 годин.',
              '`!дуель` — зоряний бій один на один, відповіддю на повідомлення суперника.',
              '**Мішок удачі** — випадкові монети, раз на 8 годин.',
            ],
          },
          { type: 'heading', level: 2, align: 'left', text: 'RP-команди та топи' },
          {
            type: 'list',
            style: 'bullet',
            items: [
              '`!рп` — локальні команди чату, `!грп` — глобальні команди бота.',
              '`+рп команда текст GIF_ID` — додати локальну RP-команду.',
              '`Топ банан`, `Топ смс`, `Топ монет`, `Топ` — глобальні рейтинги.',
            ],
          },
          {
            type: 'callout',
            tone: 'info',
            title: 'Корисно знати',
            text: 'Глобальні RP-команди додають агенти зірок. У текстах працює розмітка, а `name1` і `name2` замінюються на учасників, яким відповіли.',
          },
          {
            type: 'spoiler',
            title: 'Що таке «Пустощі»?',
            text: 'Це блок 18+ та ігор: RP 18+, весілля й рулетка. Кожен розділ вмикається окремо: панель `!космос` → «😈 Пустощі / 🎮 Ігри».',
          },
        ],
      },
      en: {
        title: 'Games, RP commands and leaderboards',
        summary: 'Roulette, the banana, duels, weddings and custom chat commands.',
        blocks: [
          {
            type: 'text',
            size: 'md',
            align: 'left',
            text: 'Besides moderation, Space knows how to entertain: coin games, custom RP commands, weddings and leaderboards.',
          },
          { type: 'heading', level: 2, align: 'left', text: 'Games' },
          {
            type: 'badges',
            items: [
              { text: '🎰 !рулетка', tone: 'accent' },
              { text: '🍌 !банан', tone: 'success' },
              { text: '⚔️ !дуэль', tone: 'warn' },
              { text: '💰 Lucky bag', tone: 'accent-2' },
            ],
          },
          {
            type: 'list',
            style: 'bullet',
            items: [
              '`!рулетка` — coin bets: exact number ×5, colour and even/odd ×2, zero ×10.',
              '`!банан` — grows the banana by 1–3 cm every 8 hours.',
              '`!дуэль` — a star duel one on one, as a reply to your opponent.',
              '**Lucky bag** — random coins, once every 8 hours.',
            ],
          },
          { type: 'heading', level: 2, align: 'left', text: 'RP commands and leaderboards' },
          {
            type: 'list',
            style: 'bullet',
            items: [
              '`!рп` — local chat commands, `!грп` — global bot commands.',
              '`+рп команда текст GIF_ID` — add a local RP command.',
              '`Топ банан`, `Топ смс`, `Топ монет`, `Топ` — global leaderboards.',
            ],
          },
          {
            type: 'callout',
            tone: 'info',
            title: 'Good to know',
            text: 'Global RP commands are added by star agents. The texts support markup, and `name1` / `name2` are replaced with the members you replied to.',
          },
          {
            type: 'spoiler',
            title: 'What is “Mischief”?',
            text: 'It is the 18+ and games block: 18+ RP, weddings and the roulette. Each part is enabled separately: panel `!космос` → “😈 Mischief / 🎮 Games”.',
          },
        ],
      },
    },
  },
]

const homeArticles = [
  {
    icon: '🏠',
    theme: 'ocean',
    status: 'published',
    topic: 'home',
    translations: {
      ru: {
        title: 'Главная: что показывает экран',
        summary: 'Кошелёк, статистика, рекомендации и подарки — одним взглядом.',
        blocks: [
          {
            type: 'text',
            size: 'md',
            align: 'left',
            text: 'Главный экран — это сводка вашего аккаунта. Здесь видно, что происходит с балансом и что стоит забрать прямо сейчас.',
          },
          {
            type: 'list',
            style: 'bullet',
            items: [
              '**Карточка профиля** — аватар, имя и время последней активности.',
              '**Кошелёк** — монеты, банан и астроны.',
              '**Плитки статистики** — сообщения, кейсы и предметы на складе.',
              '**Рекомендации** — предметы маркета, которых у вас ещё нет.',
            ],
          },
          { type: 'heading', level: 2, align: 'left', text: 'Быстрые действия' },
          {
            type: 'list',
            style: 'number',
            items: [
              '**Открыть маркет** — перейти к покупкам за астроны.',
              '**Купить за 🪐** — открыть предложения астронов.',
              '**Подарок** — забрать доступные подарки Telegram.',
            ],
          },
          {
            type: 'callout',
            tone: 'tip',
            title: 'Подсказка',
            text: 'Плитка «Кейсы» показывает, сколько лут-боксов сейчас ждёт открытия. Если там 0 — загляните в миссии: за них дают подарочные кейсы.',
          },
        ],
      },
      uk: {
        title: 'Головна: що показує екран',
        summary: 'Гаманець, статистика, рекомендації та подарунки — одним поглядом.',
        blocks: [
          {
            type: 'text',
            size: 'md',
            align: 'left',
            text: 'Головний екран — це зведення твого акаунта. Тут видно, що відбувається з балансом і що варто забрати просто зараз.',
          },
          {
            type: 'list',
            style: 'bullet',
            items: [
              '**Картка профілю** — аватар, ім’я та час останньої активності.',
              '**Гаманець** — монети, банан і астрони.',
              '**Плитки статистики** — повідомлення, кейси та предмети на складі.',
              '**Рекомендації** — предмети маркету, яких у тебе ще немає.',
            ],
          },
          { type: 'heading', level: 2, align: 'left', text: 'Швидкі дії' },
          {
            type: 'list',
            style: 'number',
            items: [
              '**Відкрити маркет** — перейти до покупок за астрони.',
              '**Купити за 🪐** — відкрити пропозиції астронів.',
              '**Подарунок** — забрати доступні подарунки Telegram.',
            ],
          },
          {
            type: 'callout',
            tone: 'tip',
            title: 'Підказка',
            text: 'Плитка «Кейси» показує, скільки лут-боксів чекає на відкриття. Якщо там 0 — зазирни в місії: за них дають подарункові кейси.',
          },
        ],
      },
      en: {
        title: 'Home: what the screen shows',
        summary: 'Wallet, stats, recommendations and gifts at a glance.',
        blocks: [
          {
            type: 'text',
            size: 'md',
            align: 'left',
            text: 'The home screen is a summary of your account. It shows how your balance is doing and what is worth claiming right now.',
          },
          {
            type: 'list',
            style: 'bullet',
            items: [
              '**Profile card** — avatar, name and last activity time.',
              '**Wallet** — coins, banana and astrones.',
              '**Stat tiles** — messages, cases and inventory items.',
              '**Recommendations** — market items you do not own yet.',
            ],
          },
          { type: 'heading', level: 2, align: 'left', text: 'Quick actions' },
          {
            type: 'list',
            style: 'number',
            items: [
              '**Open the market** — go shopping with astrones.',
              '**Buy for 🪐** — open the astrones offers.',
              '**Gift** — claim the available Telegram gifts.',
            ],
          },
          {
            type: 'callout',
            tone: 'tip',
            title: 'Hint',
            text: 'The “Cases” tile shows how many loot boxes are waiting to be opened. If it says 0, check the missions — they hand out bonus cases.',
          },
        ],
      },

    },
  },

]

const casesArticles = [
  {
    icon: '🎁',
    theme: 'sunset',
    status: 'published',
    topic: 'cases',
    translations: {
      ru: {
        title: 'Кейсы и награды',
        summary: 'Какие кейсы бывают, сколько они стоят и что из них падает.',
        blocks: [
          {
            type: 'text',
            size: 'md',
            align: 'left',
            text: 'Кейс открывается на сервере: рулетка лишь докручивается до уже готового результата, поэтому награда не зависит от анимации на экране.',
          },
          {
            type: 'table',
            head: ['Кейс', 'Цена в Stars', 'VIP'],
            rows: [
              ['Бомж кейс', '25', '1–2 дня'],
              ['Стандартный', '65', '2–4 дня'],
              ['Необычный', '120', '3–7 дней'],
              ['Premium', '240', '7–14 дней'],
            ],
          },
          {
            type: 'callout',
            tone: 'warn',
            title: 'Важно',
            text: 'Открытие кейса списывает его из баланса. Кейсы закончились? Их можно купить в маркете за звёзды Telegram.',
          },
          {
            type: 'list',
            style: 'check',
            items: [
              'Монеты и астроны начисляются мгновенно.',
              'Предметы попадают прямо на **Склад**.',
              'VIP продлевается в базе бота автоматически.',
            ],
          },
          { type: 'heading', level: 2, align: 'left', text: 'Шансы награды' },
          {
            type: 'list',
            style: 'bullet',
            items: [
              'Монеты — самая частая награда (больше половины исходов).',
              'Астроны — вторая по частоте: примерно каждый четвёртый кейс.',
              'Предметы и VIP выпадают реже, подарки Telegram — редкость.',
            ],
          },
          { type: 'heading', level: 2, align: 'left', text: 'Как открыть кейс' },
          {
            type: 'steps',
            items: [
              { title: 'Выберите кейс', text: 'В разделе «Кейсы» видны доступные лут-боксы и их цена в звёздах.' },
              { title: 'Оплатите звёздами', text: 'Если кейса нет в наличии, покупка откроет счёт Telegram — после оплаты он появится в списке.' },
              { title: 'Крутите рулетку', text: 'Нажмите «Открыть»: сервер уже выбрал награду, рулетка докрутится до неё.' },
              { title: 'Заберите награду', text: 'Монеты и астроны приходят сразу, предметы — на склад, VIP продлевается автоматически.' },
            ],
          },
          {
            type: 'quote',
            text: 'Рулетка выглядит эффектно, но результат честный: сервер выбирает награду по весам.',
            author: 'Команда Space',
          },
        ],
      },
      uk: {
        title: 'Кейси та нагороди',
        summary: 'Які кейси бувають, скільки вони коштують і що з них випадає.',
        blocks: [
          {
            type: 'text',
            size: 'md',
            align: 'left',
            text: 'Кейс відкривається на сервері: рулетка лише докручується до вже готового результату, тому нагорода не залежить від анімації на екрані.',
          },
          {
            type: 'table',
            head: ['Кейс', 'Ціна в Stars', 'VIP'],
            rows: [
              ['Бомж кейс', '25', '1–2 дні'],
              ['Стандартний', '65', '2–4 дні'],
              ['Незвичайний', '120', '3–7 днів'],
              ['Premium', '240', '7–14 днів'],
            ],
          },
          {
            type: 'callout',
            tone: 'warn',
            title: 'Важливо',
            text: 'Відкриття кейса списує його з балансу. Кейси закінчилися? Їх можна купити в маркеті за зірки Telegram.',
          },
          {
            type: 'list',
            style: 'check',
            items: [
              'Монети та астрони нараховуються миттєво.',
              'Предмети потрапляють прямо на **Склад**.',
              'VIP продовжується в базі бота автоматично.',
            ],
          },
          { type: 'heading', level: 2, align: 'left', text: 'Шанси нагороди' },
          {
            type: 'list',
            style: 'bullet',
            items: [
              'Монети — найчастіша нагорода (понад половина випадків).',
              'Астрони — друга за частотою: приблизно кожен четвертий кейс.',
              'Предмети та VIP випадають рідше, подарунки Telegram — рідкість.',
            ],
          },
          { type: 'heading', level: 2, align: 'left', text: 'Як відкрити кейс' },
          {
            type: 'steps',
            items: [
              { title: 'Вибери кейс', text: 'У розділі «Кейси» видно доступні лут-бокси та їхню ціну в зірках.' },
              { title: 'Оплати зірками', text: 'Якщо кейса немає в наявності, покупка відкриє рахунок Telegram — після оплати він з’явиться у списку.' },
              { title: 'Крути рулетку', text: 'Натисни «Відкрити»: сервер уже вибрав нагороду, рулетка докрутиться до неї.' },
              { title: 'Забери нагороду', text: 'Монети й астрони приходять одразу, предмети — на склад, VIP продовжується автоматично.' },
            ],
          },
          {
            type: 'quote',
            text: 'Рулетка виглядає ефектно, але результат чесний: сервер вибирає нагороду за вагами.',
            author: 'Команда Space',
          },
        ],
      },
      en: {
        title: 'Cases and rewards',
        summary: 'Which cases exist, what they cost and what drops from them.',
        blocks: [
          {
            type: 'text',
            size: 'md',
            align: 'left',
            text: 'A case is opened on the server: the wheel only spins to the result that was already chosen, so the reward never depends on the animation.',
          },
          {
            type: 'table',
            head: ['Case', 'Price in Stars', 'VIP'],
            rows: [
              ['Homeless case', '25', '1–2 days'],
              ['Standard case', '65', '2–4 days'],
              ['Unusual case', '120', '3–7 days'],
              ['Premium case', '240', '7–14 days'],
            ],
          },
          {
            type: 'callout',
            tone: 'warn',
            title: 'Important',
            text: 'Opening a case removes it from your balance. Out of cases? Buy more in the market with Telegram Stars.',
          },
          {
            type: 'list',
            style: 'check',
            items: [
              'Coins and astrones are credited instantly.',
              'Items go straight to your **Inventory**.',
              'VIP is extended directly in the bot database.',
            ],
          },
          { type: 'heading', level: 2, align: 'left', text: 'Reward chances' },
          {
            type: 'list',
            style: 'bullet',
            items: [
              'Coins are the most common reward (more than half of the outcomes).',
              'Astrones come second: roughly every fourth case.',
              'Items and VIP drop less often, Telegram gifts are rare.',
            ],
          },
          { type: 'heading', level: 2, align: 'left', text: 'How to open a case' },
          {
            type: 'steps',
            items: [
              { title: 'Pick a case', text: 'The “Cases” section lists the loot boxes you own and their star price.' },
              { title: 'Pay with stars', text: 'If you have no case left, the purchase opens a Telegram invoice — the case appears after payment.' },
              { title: 'Spin the wheel', text: 'Tap “Open”: the server already picked the reward and the wheel spins to it.' },
              { title: 'Claim the reward', text: 'Coins and astrones arrive instantly, items go to the inventory, VIP is extended automatically.' },
            ],
          },
          {
            type: 'quote',
            text: 'The wheel looks flashy, but the result is fair: the server picks the reward by weight.',
            author: 'Space team',
          },
        ],
      },

    },
  },

  {
    icon: '⭐',
    theme: 'gold',
    status: 'published',
    topic: 'cases',
    translations: {
      ru: {
        title: 'Как купить кейс за Telegram Stars',
        summary: 'Оплата звёздами, начисление кейса и что делать, если платёж завис.',
        blocks: [
          {
            type: 'text',
            size: 'md',
            align: 'left',
            text: 'Кейсы покупаются за звёзды Telegram прямо в приложении. Счёт открывает Telegram, а начисление приходит в бота автоматически после оплаты.',
          },
          {
            type: 'table',
            head: ['Кейс', 'Цена', 'Коротко о содержимом'],
            rows: [
              ['Бомж кейс', '25 ⭐', 'Базовые монеты и астроны, редкий VIP'],
              ['Стандартный', '65 ⭐', 'Больше монет и астронов, шанс предмета'],
              ['Необычный', '120 ⭐', 'Повышенный шанс предметов и VIP'],
              ['Premium', '240 ⭐', 'Лучшие шансы на предметы, VIP и подарки'],
            ],
          },
          { type: 'heading', level: 2, align: 'left', text: 'Покупка по шагам' },
          {
            type: 'steps',
            items: [
              { title: 'Откройте «Кейсы»', text: 'В нижнем меню выберите раздел с лут-боксами.' },
              { title: 'Нажмите «Открыть»', text: 'Бот отправит счёт Telegram на оплату — подтвердите платёж в платёжном окне.' },
              { title: 'Обновите экран', text: 'Кейс появится в списке через пару секунд после подтверждения оплаты.' },
            ],
          },
          {
            type: 'callout',
            tone: 'tip',
            title: 'Совет',
            text: 'Покупать выгоднее большими кейсами: в Premium выше шанс предметов и VIP, чем в Бомж кейсе.',
          },
          {
            type: 'callout',
            tone: 'warn',
            title: 'Важно',
            text: 'Оплата считается завершённой только после подтверждения Telegram. Если вы закрыли окно оплаты, звёзды не списываются.',
          },
          { type: 'divider', style: 'glow' },
          {
            type: 'link',
            text: 'Открыть раздел «Кейсы»',
            href: 'https://t.me/iSpaceRobot',
            icon: '🎁',
            tone: 'warn',
          },
        ],
      },
      uk: {
        title: 'Як купити кейс за Telegram Stars',
        summary: 'Оплата зірками, нарахування кейса і що робити, якщо платіж завис.',
        blocks: [
          {
            type: 'text',
            size: 'md',
            align: 'left',
            text: 'Кейси купуються за зірки Telegram прямо в додатку. Рахунок відкриває Telegram, а нарахування приходить у бота автоматично після оплати.',
          },
          {
            type: 'table',
            head: ['Кейс', 'Ціна', 'Коротко про вміст'],
            rows: [
              ['Бомж кейс', '25 ⭐', 'Базові монети й астрони, рідкісний VIP'],
              ['Стандартний', '65 ⭐', 'Більше монет і астронів, шанс предмета'],
              ['Незвичайний', '120 ⭐', 'Підвищений шанс предметів і VIP'],
              ['Premium', '240 ⭐', 'Найкращі шанси на предмети, VIP і подарунки'],
            ],
          },
          { type: 'heading', level: 2, align: 'left', text: 'Покупка крок за кроком' },
          {
            type: 'steps',
            items: [
              { title: 'Відкрий «Кейси»', text: 'У нижньому меню вибери розділ із лут-боксами.' },
              { title: 'Натисни «Відкрити»', text: 'Бот надішле рахунок Telegram — підтверди платіж у вікні оплати.' },
              { title: 'Онови екран', text: 'Кейс з’явиться у списку за кілька секунд після підтвердження оплати.' },
            ],
          },
          {
            type: 'callout',
            tone: 'tip',
            title: 'Порада',
            text: 'Купувати вигідніше великими кейсами: у Premium вищий шанс предметів і VIP, ніж у Бомж кейсі.',
          },
          {
            type: 'callout',
            tone: 'warn',
            title: 'Важливо',
            text: 'Оплата вважається завершеною лише після підтвердження Telegram. Якщо ти закрив вікно оплати, зірки не списуються.',
          },
          { type: 'divider', style: 'glow' },
          {
            type: 'link',
            text: 'Відкрити розділ «Кейси»',
            href: 'https://t.me/iSpaceRobot',
            icon: '🎁',
            tone: 'warn',
          },
        ],
      },
      en: {
        title: 'How to buy a case with Telegram Stars',
        summary: 'Paying with stars, getting the case and what to do if the payment hangs.',
        blocks: [
          {
            type: 'text',
            size: 'md',
            align: 'left',
            text: 'Cases are bought with Telegram stars right inside the app. Telegram opens the invoice and the case is credited to the bot automatically after payment.',
          },
          {
            type: 'table',
            head: ['Case', 'Price', 'Content in short'],
            rows: [
              ['Homeless case', '25 ⭐', 'Basic coins and astrones, rare VIP'],
              ['Standard case', '65 ⭐', 'More coins and astrones, a chance of an item'],
              ['Unusual case', '120 ⭐', 'Higher chance of items and VIP'],
              ['Premium case', '240 ⭐', 'Best odds for items, VIP and gifts'],
            ],
          },
          { type: 'heading', level: 2, align: 'left', text: 'Buying step by step' },
          {
            type: 'steps',
            items: [
              { title: 'Open “Cases”', text: 'Pick the loot box section in the bottom menu.' },
              { title: 'Tap “Open”', text: 'The bot sends a Telegram invoice — confirm the payment in the payment sheet.' },
              { title: 'Refresh the screen', text: 'The case appears in the list a couple of seconds after the payment is confirmed.' },
            ],
          },
          {
            type: 'callout',
            tone: 'tip',
            title: 'Tip',
            text: 'Bigger cases are better value: Premium has higher odds for items and VIP than the Homeless case.',
          },
          {
            type: 'callout',
            tone: 'warn',
            title: 'Important',
            text: 'A payment counts only after Telegram confirms it. If you close the payment sheet, no stars are charged.',
          },
          { type: 'divider', style: 'glow' },
          {
            type: 'link',
            text: 'Open the “Cases” section',
            href: 'https://t.me/iSpaceRobot',
            icon: '🎁',
            tone: 'warn',
          },
        ],
      },

    },
  },

]

const shopArticles = [
  {
    icon: '🛍',
    theme: 'ocean',
    status: 'published',
    topic: 'shop',
    translations: {
      ru: {
        title: 'Маркет, склад и стиль',
        summary: 'Как покупать предметы за астроны и менять оформление профиля.',
        blocks: [
          {
            type: 'text',
            size: 'md',
            align: 'left',
            text: 'В маркете предметы продаются за астроны — внутреннюю валюту Space. Купленное навсегда остаётся в вашем складе.',
          },
          { type: 'heading', level: 2, align: 'left', text: 'Категории предметов' },
          {
            type: 'list',
            style: 'bullet',
            items: [
              '**Титулы** — подпись рядом с именем.',
              '**Смайлики** — премиальные эмодзи.',
              '**Ответы** — автоответы в чатах.',
              '**Приветствия** — фразы при входе в чат.',
              '**Кнопки** — оформление клавиатуры.',
              '**Графики** — оформление статистики.',
            ],
          },
          {
            type: 'callout',
            tone: 'info',
            title: 'Подсказка',
            text: 'Отмеченные избранным предметы всегда сверху — так проще сравнить варианты стиля.',
          },
          { type: 'heading', level: 2, align: 'left', text: 'Как надеть предмет' },
          {
            type: 'list',
            style: 'number',
            items: [
              'Купите предмет в маркете за астроны.',
              'Откройте **Склад** и найдите нужный предмет.',
              'Нажмите «Надеть» — стиль применится в боте и в профиле.',
            ],
          },
          {
            type: 'spoiler',
            title: 'Можно ли продать купленный предмет?',
            text: 'Нет, маркет не выкупает предметы обратно. Зато купленное не расходуется: снять предмет можно в любой момент, и он останется на складе.',
          },
        ],
      },
      uk: {
        title: 'Маркет, склад і стиль',
        summary: 'Як купувати предмети за астрони та змінювати оформлення профілю.',
        blocks: [
          {
            type: 'text',
            size: 'md',
            align: 'left',
            text: 'У маркеті предмети продаються за астрони — внутрішню валюту Space. Куплене назавжди залишається на твоєму складі.',
          },
          { type: 'heading', level: 2, align: 'left', text: 'Категорії предметів' },
          {
            type: 'list',
            style: 'bullet',
            items: [
              '**Титули** — підпис поруч з ім’ям.',
              '**Смайли** — преміальні емодзі.',
              '**Відповіді** — автовідповіді в чатах.',
              '**Привітання** — фрази при вході в чат.',
              '**Кнопки** — оформлення клавіатури.',
              '**Графіки** — оформлення статистики.',
            ],
          },
          {
            type: 'callout',
            tone: 'info',
            title: 'Підказка',
            text: 'Предмети, позначені обраними, завжди зверху — так простіше порівнювати варіанти стилю.',
          },
          { type: 'heading', level: 2, align: 'left', text: 'Як увімкнути предмет' },
          {
            type: 'list',
            style: 'number',
            items: [
              'Купи предмет у маркеті за астрони.',
              'Відкрий **Склад** і знайди потрібний предмет.',
              'Натисни «Увімкнути» — стиль застосується в боті та в профілі.',
            ],
          },
          {
            type: 'spoiler',
            title: 'Чи можна продати куплений предмет?',
            text: 'Ні, маркет не викуповує предмети назад. Натомість куплене не витрачається: зняти предмет можна будь-коли, і він залишиться на складі.',
          },
        ],
      },
      en: {
        title: 'Market, inventory and style',
        summary: 'How to buy items with astrones and change the look of your profile.',
        blocks: [
          {
            type: 'text',
            size: 'md',
            align: 'left',
            text: 'In the market, items are sold for astrones — the internal Space currency. Whatever you buy stays in your inventory forever.',
          },
          { type: 'heading', level: 2, align: 'left', text: 'Item categories' },
          {
            type: 'list',
            style: 'bullet',
            items: [
              '**Titles** — a caption next to your name.',
              '**Emojis** — premium emoji sets.',
              '**Replies** — auto replies in chats.',
              '**Greetings** — phrases when you join a chat.',
              '**Buttons** — keyboard styling.',
              '**Charts** — stats styling.',
            ],
          },
          {
            type: 'callout',
            tone: 'info',
            title: 'Hint',
            text: 'Favourites are always pinned on top, which makes comparing styles much easier.',
          },
          { type: 'heading', level: 2, align: 'left', text: 'How to equip an item' },
          {
            type: 'list',
            style: 'number',
            items: [
              'Buy the item in the market with astrones.',
              'Open your **Inventory** and find the item.',
              'Tap “Equip” — the style is applied in the bot and in the profile.',
            ],
          },
          {
            type: 'spoiler',
            title: 'Can I sell a purchased item?',
            text: 'No, the market does not buy items back. The good part: purchases are not consumed — you can unequip an item at any time and it stays in your inventory.',
          },
        ],
      },

    },
  },

  {
    icon: '👑',
    theme: 'gold',
    status: 'published',
    topic: 'shop',
    translations: {
      ru: {
        title: 'VIP: что даёт и как подключить',
        summary: 'Премиум-статус бота: личные RP-команды, скрытие профиля и другие бонусы.',
        blocks: [
          {
            type: 'text',
            size: 'md',
            align: 'left',
            text: 'VIP — премиум-статус бота. Купить его можно в приложении, в разделе «VIP»: звёздами Telegram или картой. Срок продлевается поверх текущего.',
          },
          {
            type: 'badges',
            items: [
              { text: '1 месяц', tone: 'accent' },
              { text: '6 месяцев', tone: 'accent-2' },
              { text: '12 месяцев', tone: 'success' },
            ],
          },
          { type: 'heading', level: 2, align: 'left', text: 'Что даёт VIP' },
          {
            type: 'list',
            style: 'check',
            items: [
              'Личные RP-команды работают во всех чатах, где есть Space.',
              'Можно отключать рассылки в чатах.',
              'Можно скрывать элементы профиля.',
              'Разводы без ограничений и без платы.',
            ],
          },
          { type: 'heading', level: 2, align: 'left', text: 'Как подключить' },
          {
            type: 'steps',
            items: [
              { title: 'Откройте «Донат»', text: 'В боте: команда `/donate` или кнопка в меню.' },
              { title: 'Выберите срок', text: 'Доступны планы на 1, 6 и 12 месяцев.' },
              { title: 'Оплатите', text: 'Звёздами через счёт Telegram или картой на странице Tribute. VIP активируется сразу после оплаты.' },
            ],
          },
          {
            type: 'callout',
            tone: 'tip',
            title: 'Совет',
            text: 'Если VIP уже активен, новый срок добавится к текущей дате окончания — статус не сгорит.',
          },
          {
            type: 'spoiler',
            title: 'Что такое «Личные RP-команды»?',
            text: 'Это собственные команды с premium emoji, которые создаются в разделе `/business`. Без VIP они работают ограниченно, с VIP — во всех чатах, где присутствует Space.',
          },
        ],
      },
      uk: {
        title: 'VIP: що дає і як підключити',
        summary: 'Преміум-статус бота: особисті RP-команди, приховування профілю та інші бонуси.',
        blocks: [
          {
            type: 'text',
            size: 'md',
            align: 'left',
            text: 'VIP — преміум-статус бота. Купити його можна в застосунку, у розділі «VIP»: зірками Telegram або карткою. Термін продовжується поверх поточного.',
          },
          {
            type: 'badges',
            items: [
              { text: '1 місяць', tone: 'accent' },
              { text: '6 місяців', tone: 'accent-2' },
              { text: '12 місяців', tone: 'success' },
            ],
          },
          { type: 'heading', level: 2, align: 'left', text: 'Що дає VIP' },
          {
            type: 'list',
            style: 'check',
            items: [
              'Особисті RP-команди працюють у всіх чатах, де є Space.',
              'Можна вимикати розсилки в чатах.',
              'Можна приховувати елементи профілю.',
              'Розлучення без обмежень і без оплати.',
            ],
          },
          { type: 'heading', level: 2, align: 'left', text: 'Як підключити' },
          {
            type: 'steps',
            items: [
              { title: 'Відкрий «Донат»', text: 'У боті: команда `/donate` або кнопка в меню.' },
              { title: 'Вибери термін', text: 'Доступні плани на 1, 6 і 12 місяців.' },
              { title: 'Сплатіть', text: 'Зірками через рахунок Telegram або карткою на сторінці Tribute. VIP активується одразу після оплати.' },
            ],
          },
          {
            type: 'callout',
            tone: 'tip',
            title: 'Порада',
            text: 'Якщо VIP уже активний, новий термін додасться до поточної дати закінчення — статус не згорить.',
          },
          {
            type: 'spoiler',
            title: 'Що таке «Особисті RP-команди»?',
            text: 'Це власні команди з premium emoji, які створюються в розділі `/business`. Без VIP вони працюють обмежено, з VIP — у всіх чатах, де присутній Space.',
          },
        ],
      },
      en: {
        title: 'VIP: what it gives and how to get it',
        summary: 'The bot premium status: personal RP commands, hidden profile elements and more.',
        blocks: [
          {
            type: 'text',
            size: 'md',
            align: 'left',
            text: 'VIP is the bot premium status. Buy it in the app, in the “VIP” section: with Telegram stars or by card. The term extends on top of the current one.',
          },
          {
            type: 'badges',
            items: [
              { text: '1 month', tone: 'accent' },
              { text: '6 months', tone: 'accent-2' },
              { text: '12 months', tone: 'success' },
            ],
          },
          { type: 'heading', level: 2, align: 'left', text: 'What VIP gives you' },
          {
            type: 'list',
            style: 'check',
            items: [
              'Personal RP commands work in every Space chat.',
              'You can turn off broadcasts in chats.',
              'You can hide profile elements.',
              'Unlimited free divorces.',
            ],
          },
          { type: 'heading', level: 2, align: 'left', text: 'How to get it' },
          {
            type: 'steps',
            items: [
              { title: 'Open “Donate”', text: 'In the bot: the `/donate` command or the menu button.' },
              { title: 'Pick a term', text: 'Plans for 1, 6 and 12 months are available.' },
              { title: 'Pay', text: 'With Telegram stars via the invoice or by card on the Tribute page. VIP activates right after payment.' },
            ],
          },
          {
            type: 'callout',
            tone: 'tip',
            title: 'Tip',
            text: 'If VIP is already active, the new term is added to the current end date — nothing is lost.',
          },
          {
            type: 'spoiler',
            title: 'What are personal RP commands?',
            text: 'They are your own commands with premium emoji, created in the `/business` section. Without VIP they work in a limited way; with VIP they work in every chat where Space is present.',
          },
        ],
      },

    },
  },

]

const inventoryArticles = [
  {
    icon: '🎒',
    theme: 'nebula',
    status: 'published',
    topic: 'inventory',
    translations: {
      ru: {
        title: 'Склад: как пользоваться',
        summary: 'Где лежат купленные предметы, что такое «надеть» и «избранное».',
        blocks: [
          {
            type: 'text',
            size: 'md',
            align: 'left',
            text: 'Склад — это коллекция всего, что вы купили или получили из кейсов. Он открывается заметным блоком внизу профиля.',
          },
          {
            type: 'stats',
            items: [
              { icon: '👕', label: 'Оформление', value: 'стиль профиля' },
              { icon: '⭐', label: 'Избранное', value: 'быстрый доступ' },
              { icon: '✅', label: 'Активно', value: 'работает сейчас' },
            ],
          },
          { type: 'heading', level: 2, align: 'left', text: 'Как надеть предмет' },
          {
            type: 'steps',
            items: [
              { title: 'Откройте склад', text: 'Нажмите блок «Склад» внизу профиля.' },
              { title: 'Найдите предмет', text: 'Фильтры по категории и поиск помогут не листать всю коллекцию.' },
              { title: 'Откройте предмет', text: 'Нажмите на слот: откроется карточка с кнопками «Надеть» и «В избранное».' },
              { title: 'Нажмите «Надеть»', text: 'Слот подсветится зелёным и появится галочка — оформление заработает в профиле и в чатах, где есть Space.' },
            ],
          },
          { type: 'heading', level: 2, align: 'left', text: 'Избранное и активное' },
          {
            type: 'list',
            style: 'bullet',
            items: [
              '**Избранное** — закладка: такой предмет всегда наверху списка.',
              '**Активное** — предмет, который уже работает в боте и профиле.',
              'Снять предмет можно в любой момент — он останется на складе.',
            ],
          },
          {
            type: 'callout',
            tone: 'info',
            title: 'Полезно знать',
            text: 'Купленное не расходуется: оплата в маркете разовая, а предмет остаётся в коллекции навсегда.',
          },
          {
            type: 'spoiler',
            title: 'Надел титул, но в чате его не видно',
            text: 'Проверьте, что функции чата включены (панель `!космос` → «⚙️») и у бота есть права администратора. Оформление показывается там, где Space может действовать.',
          },
        ],
      },
      uk: {
        title: 'Склад: як користуватися',
        summary: 'Де лежать куплені предмети, що таке «увімкнути» та «обране».',
        blocks: [
          {
            type: 'text',
            size: 'md',
            align: 'left',
            text: 'Склад — це колекція всього, що ти купив або отримав з кейсів. Він відкривається помітним блоком унизу профілю.',
          },
          {
            type: 'stats',
            items: [
              { icon: '👕', label: 'Оформлення', value: 'стиль профілю' },
              { icon: '⭐', label: 'Обране', value: 'швидкий доступ' },
              { icon: '✅', label: 'Активно', value: 'працює зараз' },
            ],
          },
          { type: 'heading', level: 2, align: 'left', text: 'Як увімкнути предмет' },
          {
            type: 'steps',
            items: [
              { title: 'Відкрий склад', text: 'Натисни блок «Склад» унизу профілю.' },
              { title: 'Знайди предмет', text: 'Фільтри за категорією та пошук допоможуть не гортати всю колекцію.' },
              { title: 'Відкрий предмет', text: 'Натисни на слот: відкриється картка з кнопками «Вдягнути» та «В обране».' },
              { title: 'Натисни «Вдягнути»', text: 'Слот підсвітиться зеленим і з’явиться галочка — оформлення запрацює в профілі та в чатах, де є Space.' },
            ],
          },
          { type: 'heading', level: 2, align: 'left', text: 'Обране та активне' },
          {
            type: 'list',
            style: 'bullet',
            items: [
              '**Обране** — закладка: такий предмет завжди зверху списку.',
              '**Активне** — предмет, який уже працює в боті та профілі.',
              'Зняти предмет можна будь-коли — він залишиться на складі.',
            ],
          },
          {
            type: 'callout',
            tone: 'info',
            title: 'Корисно знати',
            text: 'Куплене не витрачається: оплата в маркеті разова, а предмет залишається в колекції назавжди.',
          },
          {
            type: 'spoiler',
            title: 'Увімкнув титул, але в чаті його не видно',
            text: 'Перевір, що функції чату увімкнено (панель `!космос` → «⚙️») і в бота є права адміністратора. Оформлення показується там, де Space може діяти.',
          },
        ],
      },
      en: {
        title: 'Inventory: how to use it',
        summary: 'Where purchased items live, what “equip” and “favourites” mean.',
        blocks: [
          {
            type: 'text',
            size: 'md',
            align: 'left',
            text: 'The inventory is the collection of everything you bought or got from cases. It opens from the prominent block at the bottom of your profile.',
          },
          {
            type: 'stats',
            items: [
              { icon: '👕', label: 'Style', value: 'profile look' },
              { icon: '⭐', label: 'Favourites', value: 'quick access' },
              { icon: '✅', label: 'Active', value: 'working now' },
            ],
          },
          { type: 'heading', level: 2, align: 'left', text: 'How to equip an item' },
          {
            type: 'steps',
            items: [
              { title: 'Open the inventory', text: 'Tap the “Inventory” block at the bottom of your profile.' },
              { title: 'Find the item', text: 'Category filters and search save you from scrolling the whole collection.' },
              { title: 'Open the item', text: 'Tap the slot: the card opens with “Equip” and “Favourites” buttons.' },
              { title: 'Tap “Equip”', text: 'The slot turns green and gets a check mark — the style works in your profile and in chats where Space is present.' },
            ],
          },
          { type: 'heading', level: 2, align: 'left', text: 'Favourites and active items' },
          {
            type: 'list',
            style: 'bullet',
            items: [
              '**Favourites** — a bookmark: such items are always on top of the list.',
              '**Active** — the item that already works in the bot and the profile.',
              'You can unequip an item at any time — it stays in your inventory.',
            ],
          },
          {
            type: 'callout',
            tone: 'info',
            title: 'Good to know',
            text: 'Purchases are not consumed: a market payment is one-off and the item stays in your collection forever.',
          },
          {
            type: 'spoiler',
            title: 'I equipped a title but it is not visible in a chat',
            text: 'Make sure the chat features are enabled (panel `!космос` → “⚙️”) and the bot has admin rights. Styles show up where Space is allowed to act.',
          },
        ],
      },

    },
  },

]

const missionsArticles = [
  {
    icon: '🎯',
    theme: 'mint',
    status: 'published',
    topic: 'missions',
    translations: {
      ru: {
        title: 'Миссии, опыт и подарочные кейсы',
        summary: 'Шесть заданий дня, две недельные миссии и вехи с подарочными кейсами.',
        blocks: [
          {
            type: 'text',
            size: 'md',
            align: 'left',
            text: 'Миссии — способ получать опыт и подарочные кейсы. Семь заданий дня привязаны к простым действиям в боте и Space App, а два недельных задания сразу выдают кейс. За идеальный день можно собрать 1000 XP и забрать четыре кейса.',
          },
          {
            type: 'progress',
            label: 'Задания дня выполнены',
            value: 5,
            max: 7,
            tone: 'success',
          },
          { type: 'heading', level: 2, align: 'left', text: 'Задания дня' },
          {
            type: 'table',
            head: ['Миссия', 'Что нужно сделать', 'Награда'],
            rows: [
              ['Первая активность', 'Написать хотя бы одно сообщение в чате со Space', '100 XP'],
              ['Вездесущий', 'Проявиться в двух разных чатах со Space', '100 XP'],
              ['Активный день', 'Отправить 25 сообщений за день', '180 XP'],
              ['Банановый ритуал', 'Увеличить банан командой `!банан`', '140 XP'],
              ['Мешок удачи', 'Забрать мешок в меню `!рулетка`', '140 XP'],
              ['Ставка в рулетке', 'Сделать ставку в `!рулетка` — от 1000 монет', '140 XP'],
              ['Вскрытие кейса', 'Открыть любой кейс в Space App', '200 XP'],
            ],
          },
          { type: 'heading', level: 2, align: 'left', text: 'Вехи дня: XP превращается в кейсы' },
          {
            type: 'list',
            style: 'check',
            items: [
              '250 XP — подарочный Бомж кейс.',
              '500 XP — ещё два Бомж кейса.',
              '750 XP — подарочный Стандартный кейс.',
              '1000 XP — подарочный Необычный кейс: нужны все задания дня.',
            ],
          },
          { type: 'heading', level: 2, align: 'left', text: 'Недельные миссии' },
          {
            type: 'list',
            style: 'bullet',
            items: [
              '**Марафон недели** — 250 сообщений с понедельника по воскресенье: кейс Необычный.',
              '**Дисциплина** — активность в 5 разных днях из 7: кейс Стандартный.',
            ],
          },
          {
            type: 'callout',
            tone: 'tip',
            title: 'Совет',
            text: 'Кнопка «Забрать» появляется, когда задание выполнено. Награду нужно забрать вручную — забери все до сброса.',
          },
          {
            type: 'callout',
            tone: 'info',
            title: 'Когда сбрасывается',
            text: 'Задания дня и вехи сбрасываются в 00:00 по Москве. Недельные миссии — в понедельник в 00:00 по Москве.',
          },
          {
            type: 'spoiler',
            title: 'Почему миссия не засчиталась?',
            text: 'Действие должно быть выполнено сегодня по московскому времени: вчерашний банан, вчерашняя ставка или вчерашний кейс сегодня не считаются.',
          },
        ],
      },
      uk: {
        title: 'Місії, досвід і подарункові кейси',
        summary: 'Шість завдань дня, дві тижневі місії та віхи з подарунковими кейсами.',
        blocks: [
          {
            type: 'text',
            size: 'md',
            align: 'left',
            text: 'Місії — спосіб отримувати досвід і подарункові кейси. Сім завдань дня прив’язані до простих дій у боті та Space App, а два тижневі завдання одразу видають кейс. За ідеальний день можна зібрати 1000 XP і забрати чотири кейси.',
          },
          {
            type: 'progress',
            label: 'Завдання дня виконано',
            value: 5,
            max: 7,
            tone: 'success',
          },
          { type: 'heading', level: 2, align: 'left', text: 'Завдання дня' },
          {
            type: 'table',
            head: ['Місія', 'Що потрібно зробити', 'Нагорода'],
            rows: [
              ['Перша активність', 'Написати хоча б одне повідомлення в чаті зі Space', '100 XP'],
              ['Всюдисущий', 'Засвітитися у двох різних чатах зі Space', '100 XP'],
              ['Активний день', 'Надіслати 25 повідомлень за день', '180 XP'],
              ['Банановий ритуал', 'Збільшити банан командою `!банан`', '140 XP'],
              ['Мішок удачі', 'Забрати мішок у меню `!рулетка`', '140 XP'],
              ['Ставка в рулетці', 'Зробити ставку в `!рулетка` — від 1000 монет', '140 XP'],
              ['Розкриття кейса', 'Відкрити будь-який кейс у Space App', '200 XP'],
            ],
          },
          { type: 'heading', level: 2, align: 'left', text: 'Віхи дня: XP перетворюється на кейси' },
          {
            type: 'list',
            style: 'check',
            items: [
              '250 XP — подарунковий Бомж кейс.',
              '500 XP — ще два Бомж кейси.',
              '750 XP — подарунковий Стандартний кейс.',
              '1000 XP — подарунковий Незвичайний кейс: потрібні всі завдання дня.',
            ],
          },
          { type: 'heading', level: 2, align: 'left', text: 'Тижневі місії' },
          {
            type: 'list',
            style: 'bullet',
            items: [
              '**Марафон тижня** — 250 повідомлень з понеділка по неділю: кейс Незвичайний.',
              '**Дисципліна** — активність у 5 різних днях із 7: кейс Стандартний.',
            ],
          },
          {
            type: 'callout',
            tone: 'tip',
            title: 'Порада',
            text: 'Кнопка «Отримати» з’являється, коли завдання виконано. Нагороду потрібно забрати вручну — забери все до скидання.',
          },
          {
            type: 'callout',
            tone: 'info',
            title: 'Коли скидається',
            text: 'Завдання дня та віхи скидаються о 00:00 за Москвою. Тижневі місії — у понеділок о 00:00 за Москвою.',
          },
          {
            type: 'spoiler',
            title: 'Чому місія не зарахувалася?',
            text: 'Дію має бути виконано сьогодні за московським часом: учорашній банан, учорашня ставка або вчорашній кейс сьогодні не рахуються.',
          },
        ],
      },
      en: {
        title: 'Missions, experience and bonus cases',
        summary: 'Six daily tasks, two weekly missions and milestones with bonus cases.',
        blocks: [
          {
            type: 'text',
            size: 'md',
            align: 'left',
            text: 'Missions are the way to earn experience and bonus cases. Seven daily tasks are tied to simple actions in the bot and Space App, while two weekly missions hand out a case right away. A perfect day brings 1000 XP and four cases.',
          },
          {
            type: 'progress',
            label: 'Daily tasks completed',
            value: 5,
            max: 7,
            tone: 'success',
          },
          { type: 'heading', level: 2, align: 'left', text: 'Daily tasks' },
          {
            type: 'table',
            head: ['Mission', 'What to do', 'Reward'],
            rows: [
              ['First activity', 'Send at least one message in a chat with Space', '100 XP'],
              ['Omnipresent', 'Show up in two different chats with Space', '100 XP'],
              ['Active day', 'Send 25 messages during the day', '180 XP'],
              ['Banana ritual', 'Grow the banana with `!банан`', '140 XP'],
              ['Lucky bag', 'Collect the bag in the `!рулетка` menu', '140 XP'],
              ['Roulette bet', 'Place a bet in `!рулетка` — from 1000 coins', '140 XP'],
              ['Case cracking', 'Open any case in Space App', '200 XP'],
            ],
          },
          { type: 'heading', level: 2, align: 'left', text: 'Daily milestones: XP turns into cases' },
          {
            type: 'list',
            style: 'check',
            items: [
              '250 XP — a bonus Homeless case.',
              '500 XP — two more Homeless cases.',
              '750 XP — a bonus Standard case.',
              '1000 XP — a bonus Unusual case: every daily task is required.',
            ],
          },
          { type: 'heading', level: 2, align: 'left', text: 'Weekly missions' },
          {
            type: 'list',
            style: 'bullet',
            items: [
              '**Week marathon** — 250 messages from Monday to Sunday: an Unusual case.',
              '**Discipline** — activity on 5 different days out of 7: a Standard case.',
            ],
          },
          {
            type: 'callout',
            tone: 'tip',
            title: 'Tip',
            text: 'The “Claim” button appears once a task is done. Rewards must be claimed manually — grab them all before the reset.',
          },
          {
            type: 'callout',
            tone: 'info',
            title: 'When it resets',
            text: 'Daily tasks and milestones reset at 00:00 MSK. Weekly missions reset on Monday at 00:00 MSK.',
          },
          {
            type: 'spoiler',
            title: 'Why was my mission not counted?',
            text: 'The action must be done today, Moscow time: yesterday’s banana, bet or opened case does not count today.',
          },
        ],
      },

    },
  },

]

const profileArticles = [
  {
    icon: '👤',
    theme: 'cyber',
    status: 'published',
    topic: 'profile',
    translations: {
      ru: {
        title: 'Профиль: таймеры, связь и стиль',
        summary: 'Что показывает профиль и как читать его блоки.',
        blocks: [
          {
            type: 'text',
            size: 'md',
            align: 'left',
            text: 'Профиль — центр управления аккаунтом. Здесь собраны баланс, таймеры, отношения и оформление.',
          },
          {
            type: 'list',
            style: 'bullet',
            items: [
              '**Шапка** — аватар, имя, статус активности и кнопка справки.',
              '**Плитки** — сообщения, кейсы к открытию и предметы на складе.',
              '**Кошелёк** — монеты, банан и астроны.',
              '**Таймеры** — когда снова доступны банан, мешок и рулетка.',
              '**Связь** — брак, партнёр и сколько вы вместе.',
              '**Оформление** — надетые предметы.',
            ],
          },
          {
            type: 'callout',
            tone: 'tip',
            title: 'Совет',
            text: 'Таймеры обновляются в реальном времени: держите экран открытым, чтобы увидеть, когда функция снова станет доступна.',
          },
          { type: 'heading', level: 2, align: 'left', text: 'Нижние блоки профиля' },
          {
            type: 'list',
            style: 'number',
            items: [
              '**Склад** — единственный вход в коллекцию предметов, со счётчиком.',
              '**Админ-панель** — видна только администраторам бота.',
            ],
          },
          {
            type: 'spoiler',
            title: 'Что такое «Связь»?',
            text: 'Это ваш брак в боте: партнёр и дата свадьбы. Заключить брак можно командой `!свадьба` в чате, развестись — командой `!развод`.',
          },
        ],
      },
      uk: {
        title: 'Профіль: таймери, стосунки та стиль',
        summary: 'Що показує профіль і як читати його блоки.',
        blocks: [
          {
            type: 'text',
            size: 'md',
            align: 'left',
            text: 'Профіль — центр керування акаунтом. Тут зібрані баланс, таймери, стосунки та оформлення.',
          },
          {
            type: 'list',
            style: 'bullet',
            items: [
              '**Шапка** — аватар, ім’я, статус активності та кнопка довідки.',
              '**Плитки** — повідомлення, кейси до відкриття та предмети на складі.',
              '**Гаманець** — монети, банан і астрони.',
              '**Таймери** — коли знову доступні банан, мішок і рулетка.',
              '**Стосунки** — шлюб, партнер і скільки ви разом.',
              '**Оформлення** — увімкнені предмети.',
            ],
          },
          {
            type: 'callout',
            tone: 'tip',
            title: 'Порада',
            text: 'Таймери оновлюються в реальному часі: тримай екран відкритим, щоб побачити, коли функція знову стане доступною.',
          },
          { type: 'heading', level: 2, align: 'left', text: 'Нижні блоки профілю' },
          {
            type: 'list',
            style: 'number',
            items: [
              '**Склад** — єдиний вхід до колекції предметів, із лічильником.',
              '**Адмін-панель** — видно лише адміністраторам бота.',
            ],
          },
          {
            type: 'spoiler',
            title: 'Що таке «Стосунки»?',
            text: 'Це твій шлюб у боті: партнер і дата весілля. Укласти шлюб можна командою `!свадьба` у чаті, розлучитися — командою `!развод`.',
          },
        ],
      },
      en: {
        title: 'Profile: timers, relationships and style',
        summary: 'What the profile shows and how to read its blocks.',
        blocks: [
          {
            type: 'text',
            size: 'md',
            align: 'left',
            text: 'The profile is the control centre of your account. It gathers your balance, timers, relationships and style.',
          },
          {
            type: 'list',
            style: 'bullet',
            items: [
              '**Header** — avatar, name, activity status and the help button.',
              '**Tiles** — messages, cases to open and inventory items.',
              '**Wallet** — coins, banana and astrones.',
              '**Timers** — when the banana, bag and roulette are available again.',
              '**Relationship** — marriage, partner and how long you have been together.',
              '**Style** — the items you have equipped.',
            ],
          },
          {
            type: 'callout',
            tone: 'tip',
            title: 'Tip',
            text: 'Timers update in real time: keep the screen open to see when a feature becomes available again.',
          },
          { type: 'heading', level: 2, align: 'left', text: 'Bottom blocks of the profile' },
          {
            type: 'list',
            style: 'number',
            items: [
              '**Inventory** — the only entrance to your item collection, with a counter.',
              '**Admin panel** — visible to bot administrators only.',
            ],
          },
          {
            type: 'spoiler',
            title: 'What is the “Relationship” block?',
            text: 'It is your marriage in the bot: the partner and the wedding date. You can marry with the `!свадьба` command in a chat and divorce with `!развод`.',
          },
        ],
      },

    },
  },

]

/** Частые вопросы: каждая статья — один вопрос, ответ раскрывается в блоке помощи. */
const faqArticles = [
  {
    icon: '➕',
    theme: 'aurora',
    status: 'published',
    topic: 'common',
    isFaq: true,
    translations: {
      ru: {
        title: 'Как добавить бота в чат?',
        summary: 'Три шага для администратора группы.',
        blocks: [
          {
            type: 'text',
            size: 'md',
            align: 'left',
            text: 'Нажмите на **@iSpaceRobot**, откройте профиль бота и выберите «Добавить в группу» — останется указать чат и подтвердить добавление.',
          },
          {
            type: 'callout',
            tone: 'warn',
            title: 'Не забудьте',
            text: 'Выдайте боту права администратора: «Удаление сообщений» и «Пригласительные ссылки». Потом включите функции командой `!космос` → «⚙️».',
          },
          {
            type: 'link',
            text: 'Открыть @iSpaceRobot',
            href: 'https://t.me/iSpaceRobot',
            icon: '🚀',
            tone: 'accent',
          },
        ],
      },
      uk: {
        title: 'Як додати бота в чат?',
        summary: 'Три кроки для адміністратора групи.',
        blocks: [
          {
            type: 'text',
            size: 'md',
            align: 'left',
            text: 'Натисни на **@iSpaceRobot**, відкрий профіль бота та вибери «Додати до групи» — залишиться вказати чат і підтвердити додавання.',
          },
          {
            type: 'callout',
            tone: 'warn',
            title: 'Не забудь',
            text: 'Видай боту права адміністратора: «Видалення повідомлень» і «Запрошувальні посилання». Потім увімкни функції командою `!космос` → «⚙️».',
          },
          {
            type: 'link',
            text: 'Відкрити @iSpaceRobot',
            href: 'https://t.me/iSpaceRobot',
            icon: '🚀',
            tone: 'accent',
          },
        ],
      },
      en: {
        title: 'How do I add the bot to a chat?',
        summary: 'Three steps for a group admin.',
        blocks: [
          {
            type: 'text',
            size: 'md',
            align: 'left',
            text: 'Tap **@iSpaceRobot**, open the bot profile and choose “Add to group” — then pick the chat and confirm.',
          },
          {
            type: 'callout',
            tone: 'warn',
            title: 'Do not forget',
            text: 'Grant the bot admin rights: “Delete messages” and “Invite links”. Then enable the features with `!космос` → “⚙️”.',
          },
          {
            type: 'link',
            text: 'Open @iSpaceRobot',
            href: 'https://t.me/iSpaceRobot',
            icon: '🚀',
            tone: 'accent',
          },
        ],
      },
    },
  },
  {
    icon: '📱',
    theme: 'nebula',
    status: 'published',
    topic: 'common',
    isFaq: true,
    translations: {
      ru: {
        title: 'Как открыть мини-приложение?',
        summary: 'Из личных сообщений бота — в одно касание.',
        blocks: [
          {
            type: 'text',
            size: 'md',
            align: 'left',
            text: 'Откройте личные сообщения с ботом и нажмите кнопку **«Открыть Space App»** — или отправьте команду `/bot`. Приложение откроется прямо внутри Telegram.',
          },
          {
            type: 'callout',
            tone: 'tip',
            title: 'Совет',
            text: 'Закрепите бота в списке чатов: тогда приложение всегда будет под рукой.',
          },
        ],
      },
      uk: {
        title: 'Як відкрити міні-додаток?',
        summary: 'З особистих повідомлень бота — одним дотиком.',
        blocks: [
          {
            type: 'text',
            size: 'md',
            align: 'left',
            text: 'Відкрий особисті повідомлення з ботом і натисни кнопку **«Відкрити Space App»** — або надішли команду `/bot`. Додаток відкриється прямо в Telegram.',
          },
          {
            type: 'callout',
            tone: 'tip',
            title: 'Порада',
            text: 'Закріпи бота у списку чатів — тоді додаток завжди буде під рукою.',
          },
        ],
      },
      en: {
        title: 'How do I open the Mini App?',
        summary: 'From the bot chat — in a single tap.',
        blocks: [
          {
            type: 'text',
            size: 'md',
            align: 'left',
            text: 'Open the private chat with the bot and tap **“Open Space App”** — or send the `/bot` command. The app opens right inside Telegram.',
          },
          {
            type: 'callout',
            tone: 'tip',
            title: 'Tip',
            text: 'Pin the bot in your chat list so the app is always one tap away.',
          },
        ],
      },
    },
  },

  {
    icon: '🔇',
    theme: 'graphite',
    status: 'published',
    topic: 'common',
    isFaq: true,
    translations: {
      ru: {
        title: 'Бот не отвечает в чате — что делать?',
        summary: 'Чаще всего функции просто выключены.',
        blocks: [
          {
            type: 'text',
            size: 'md',
            align: 'left',
            text: 'В новых чатах Space по умолчанию ничего не делает: функции включаются вручную администратором.',
          },
          {
            type: 'list',
            style: 'check',
            items: [
              'Бот добавлен в чат и назначен администратором.',
              'Выдано право «Удаление сообщений».',
              'Функции включены: `!космос` → «⚙️» → нужный блок.',
              'Чат не находится в чёрном списке бота.',
            ],
          },
          {
            type: 'callout',
            tone: 'info',
            title: 'Проверка',
            text: 'Команда `/id` покажет ID чата. Если бот не отвечает даже на неё — не хватает прав администратора.',
          },
        ],
      },
      uk: {
        title: 'Бот не відповідає в чаті — що робити?',
        summary: 'Найчастіше функції просто вимкнені.',
        blocks: [
          {
            type: 'text',
            size: 'md',
            align: 'left',
            text: 'У нових чатах Space за замовчуванням нічого не робить: функції вмикає адміністратор вручну.',
          },
          {
            type: 'list',
            style: 'check',
            items: [
              'Бот доданий у чат і призначений адміністратором.',
              'Видано право «Видалення повідомлень».',
              'Функції увімкнено: `!космос` → «⚙️» → потрібний блок.',
              'Чат не в чорному списку бота.',
            ],
          },
          {
            type: 'callout',
            tone: 'info',
            title: 'Перевірка',
            text: 'Команда `/id` покаже ID чату. Якщо бот не відповідає навіть на неї — бракує прав адміністратора.',
          },
        ],
      },
      en: {
        title: 'The bot does not reply in a chat — what now?',
        summary: 'Most often the features are simply disabled.',
        blocks: [
          {
            type: 'text',
            size: 'md',
            align: 'left',
            text: 'In new chats Space does nothing by default: an admin enables the features manually.',
          },
          {
            type: 'list',
            style: 'check',
            items: [
              'The bot is added to the chat and promoted to admin.',
              'The “Delete messages” right is granted.',
              'Features are enabled: `!космос` → “⚙️” → the block you need.',
              'The chat is not in the bot blacklist.',
            ],
          },
          {
            type: 'callout',
            tone: 'info',
            title: 'Check',
            text: 'The `/id` command shows the chat ID. If the bot does not answer even that, admin rights are missing.',
          },
        ],
      },
    },
  },

  {
    icon: '🪐',
    theme: 'ocean',
    status: 'published',
    topic: 'common',
    isFaq: true,
    translations: {
      ru: {
        title: 'Как получить астроны?',
        summary: 'Кейсы, миссии и звёзды Telegram.',
        blocks: [
          {
            type: 'text',
            size: 'md',
            align: 'left',
            text: 'Астроны — премиум-валюта Space. Есть три основных способа их получить:',
          },
          {
            type: 'list',
            style: 'number',
            items: [
              'Открывайте **кейсы** — астроны выпадают примерно в каждом четвёртом.',
              'Забирайте **ежедневные миссии** — за них дают XP и подарочные кейсы.',
              'Покупайте за **звёзды Telegram** в разделе «Донат».',
            ],
          },
          {
            type: 'callout',
            tone: 'info',
            title: 'Обмен',
            text: 'Астроны можно обменять на монеты в разделе «Донат». Обратный обмен бот не делает.',
          },
        ],
      },
      uk: {
        title: 'Як отримати астрони?',
        summary: 'Кейси, місії та зірки Telegram.',
        blocks: [
          {
            type: 'text',
            size: 'md',
            align: 'left',
            text: 'Астрони — преміум-валюта Space. Є три основні способи їх отримати:',
          },
          {
            type: 'list',
            style: 'number',
            items: [
              'Відкривай **кейси** — астрони випадають приблизно у кожному четвертому.',
              'Забирай **щоденні місії** — за них дають XP і подарункові кейси.',
              'Купуй за **зірки Telegram** у розділі «Донат».',
            ],
          },
          {
            type: 'callout',
            tone: 'info',
            title: 'Обмін',
            text: 'Астрони можна обміняти на монети в розділі «Донат». Зворотного обміну бот не робить.',
          },
        ],
      },
      en: {
        title: 'How do I get astrones?',
        summary: 'Cases, missions and Telegram stars.',
        blocks: [
          {
            type: 'text',
            size: 'md',
            align: 'left',
            text: 'Astrones are the premium currency of Space. There are three main ways to get them:',
          },
          {
            type: 'list',
            style: 'number',
            items: [
              'Open **cases** — astrones drop in roughly every fourth one.',
              'Claim daily **missions** — they give XP and bonus cases.',
              'Buy them with **Telegram stars** in the “Donate” section.',
            ],
          },
          {
            type: 'callout',
            tone: 'info',
            title: 'Exchange',
            text: 'Astrones can be exchanged for coins in the “Donate” section. The reverse exchange is not available.',
          },
        ],
      },
    },
  },

  {
    icon: '🎒',
    theme: 'nebula',
    status: 'published',
    topic: 'inventory',
    isFaq: true,
    translations: {
      ru: {
        title: 'Где искать купленные предметы?',
        summary: 'Всё лежит на складе в профиле.',
        blocks: [
          {
            type: 'text',
            size: 'md',
            align: 'left',
            text: 'Всё купленное лежит на **Складе** — это блок внизу профиля со счётчиком предметов. Чтобы применить предмет, откройте склад и нажмите «Надеть».',
          },
          {
            type: 'callout',
            tone: 'warn',
            title: 'Полезно знать',
            text: 'Предметы не расходуются: даже если вы сняли оформление, оно останется на складе и его можно надеть снова.',
          },
        ],
      },
      uk: {
        title: 'Де шукати куплені предмети?',
        summary: 'Усе лежить на складі в профілі.',
        blocks: [
          {
            type: 'text',
            size: 'md',
            align: 'left',
            text: 'Усе куплене лежить на **Складі** — це блок унизу профілю з лічильником предметів. Щоб застосувати предмет, відкрий склад і натисни «Увімкнути».',
          },
          {
            type: 'callout',
            tone: 'warn',
            title: 'Корисно знати',
            text: 'Предмети не витрачаються: навіть якщо ти зняв оформлення, воно залишиться на складі його можна увімкнути знову.',
          },
        ],
      },
      en: {
        title: 'Where are my purchased items?',
        summary: 'Everything lives in the inventory in your profile.',
        blocks: [
          {
            type: 'text',
            size: 'md',
            align: 'left',
            text: 'Everything you buy lives in the **Inventory** — the block at the bottom of your profile with an item counter. To apply an item, open the inventory and tap “Equip”.',
          },
          {
            type: 'callout',
            tone: 'warn',
            title: 'Good to know',
            text: 'Items are not consumed: even if you unequip a style, it stays in your inventory and can be equipped again.',
          },
        ],
      },
    },
  },

  {
    icon: '🎁',
    theme: 'sunset',
    status: 'published',
    topic: 'cases',
    isFaq: true,
    translations: {
      ru: {
        title: 'Почему не пришёл подарок из кейса?',
        summary: 'Что проверить по порядку.',
        blocks: [
          {
            type: 'text',
            size: 'md',
            align: 'left',
            text: 'Сначала проверьте баланс: монеты и астроны начисляются сразу, а **предметы** попадают на склад.',
          },
          {
            type: 'list',
            style: 'bullet',
            items: [
              'Обновите экран — начисление иногда синхронизируется пару секунд.',
              'Проверьте **Склад**: возможно, выпал именно предмет.',
              'Посмотрите **Историю открытий** — там видно, что именно выпало.',
              'Если награды нет — напишите в поддержку и укажите время открытия кейса.',
            ],
          },
          {
            type: 'callout',
            tone: 'info',
            title: 'Полезно знать',
            text: 'Кейс списывается только вместе с выдачей награды: если сервер не успел наградить, кейс остаётся у вас.',
          },
        ],
      },
      uk: {
        title: 'Чому не прийшов подарунок з кейса?',
        summary: 'Що перевірити по черзі.',
        blocks: [
          {
            type: 'text',
            size: 'md',
            align: 'left',
            text: 'Спочатку перевір баланс: монети та астрони нараховуються одразу, а **предмети** потрапляють на склад.',
          },
          {
            type: 'list',
            style: 'bullet',
            items: [
              'Онови екран — нарахування інколи синхронізується кілька секунд.',
              'Перевір **Склад**: можливо, випав саме предмет.',
              'Подивись **Історію відкриттів** — там видно, що саме випало.',
              'Якщо нагороди немає — напиши в підтримку та вкажи час відкриття кейса.',
            ],
          },
          {
            type: 'callout',
            tone: 'info',
            title: 'Корисно знати',
            text: 'Кейс списується лише разом із видачею нагороди: якщо сервер не встиг нагородити, кейс залишається в тебе.',
          },
        ],
      },
      en: {
        title: 'Why did the case reward not arrive?',
        summary: 'What to check, in order.',
        blocks: [
          {
            type: 'text',
            size: 'md',
            align: 'left',
            text: 'First check your balance: coins and astrones are credited instantly, while **items** go to the inventory.',
          },
          {
            type: 'list',
            style: 'bullet',
            items: [
              'Refresh the screen — crediting sometimes takes a couple of seconds.',
              'Check the **Inventory**: you may have received an item.',
              'Open the **opening history** — it shows exactly what you won.',
              'If the reward is still missing, contact support and mention when you opened the case.',
            ],
          },
          {
            type: 'callout',
            tone: 'info',
            title: 'Good to know',
            text: 'A case is consumed only together with its reward: if the server failed to grant it, the case stays with you.',
          },
        ],
      },
    },
  },

  {
    icon: '🌐',
    theme: 'candy',
    status: 'published',
    topic: 'profile',
    isFaq: true,
    translations: {
      ru: {
        title: 'Как поменять язык?',
        summary: 'Профиль → «Язык» или глобус в шапке.',
        blocks: [
          {
            type: 'text',
            size: 'md',
            align: 'left',
            text: 'Откройте раздел **Профиль** → панель «Язык» и выберите русский, украинский или английский. Либо нажмите кнопку с глобусом в шапке приложения.',
          },
          {
            type: 'callout',
            tone: 'tip',
            title: 'Совет',
            text: 'Язык применяется сразу — вместе с ним переключаются и статьи документации. Выбор сохраняется для следующих запусков.',
          },
        ],
      },
      uk: {
        title: 'Як змінити мову?',
        summary: 'Профіль → «Мова» або глобус у шапці.',
        blocks: [
          {
            type: 'text',
            size: 'md',
            align: 'left',
            text: 'Відкрий розділ **Профіль** → панель «Мова» та вибери російську, українську або англійську. Або натисни кнопку з глобусом у шапці додатка.',
          },
          {
            type: 'callout',
            tone: 'tip',
            title: 'Порада',
            text: 'Мова застосовується одразу — разом із нею перемикаються й статті документації. Вибір зберігається для наступних запусків.',
          },
        ],
      },
      en: {
        title: 'How do I change the language?',
        summary: 'Profile → “Language” or the globe in the header.',
        blocks: [
          {
            type: 'text',
            size: 'md',
            align: 'left',
            text: 'Open the **Profile** section → the “Language” panel and pick Russian, Ukrainian or English. Or tap the globe button in the app header.',
          },
          {
            type: 'callout',
            tone: 'tip',
            title: 'Tip',
            text: 'The language applies instantly, documentation included. Your choice is remembered for the next launches.',
          },
        ],
      },
    },
  },

  {
    icon: '💳',
    theme: 'mint',
    status: 'published',
    topic: 'common',
    isFaq: true,
    translations: {
      ru: {
        title: 'Как передать монеты или астроны?',
        summary: 'Команда «!передать» в чате.',
        blocks: [
          {
            type: 'text',
            size: 'md',
            align: 'left',
            text: 'Переводы делает команда `!передать`. Она работает в чате, где есть Space.',
          },
          {
            type: 'list',
            style: 'number',
            items: [
              'Ответьте командой `!передать` на сообщение игрока — или укажите ID/юзернейм.',
              'Выберите валюту: монеты или астроны.',
              'Введите сумму — бот покажет лимиты и попросит подтвердить перевод.',
            ],
          },
          {
            type: 'callout',
            tone: 'warn',
            title: 'Внимание',
            text: 'Проверьте получателя перед подтверждением: отменить перевод нельзя.',
          },
        ],
      },
      uk: {
        title: 'Як передати монети або астрони?',
        summary: 'Команда «!передать» у чаті.',
        blocks: [
          {
            type: 'text',
            size: 'md',
            align: 'left',
            text: 'Перекази робить команда `!передать`. Вона працює в чаті, де є Space.',
          },
          {
            type: 'list',
            style: 'number',
            items: [
              'Відповідай командою `!передать` на повідомлення гравця — або вкажи ID/юзернейм.',
              'Вибери валюту: монети або астрони.',
              'Введи суму — бот покаже ліміти та попросить підтвердити переказ.',
            ],
          },
          {
            type: 'callout',
            tone: 'warn',
            title: 'Увага',
            text: 'Перевір отримувача перед підтвердженням: скасувати переказ неможливо.',
          },
        ],
      },
      en: {
        title: 'How do I send coins or astrones?',
        summary: 'The “!передать” command in a chat.',
        blocks: [
          {
            type: 'text',
            size: 'md',
            align: 'left',
            text: 'Transfers are made with the `!передать` command. It works in a chat where Space is present.',
          },
          {
            type: 'list',
            style: 'number',
            items: [
              'Reply with `!передать` to the player message — or specify an ID/username.',
              'Pick the currency: coins or astrones.',
              'Enter the amount — the bot shows the limits and asks you to confirm.',
            ],
          },
          {
            type: 'callout',
            tone: 'warn',
            title: 'Careful',
            text: 'Double-check the recipient before confirming: transfers cannot be cancelled.',
          },
        ],
      },
    },
  },

  {
    icon: '🎰',
    theme: 'cyber',
    status: 'published',
    topic: 'missions',
    isFaq: true,
    translations: {
      ru: {
        title: 'Как играть в рулетку?',
        summary: 'Команда «!рулетка» и правила ставок.',
        blocks: [
          {
            type: 'text',
            size: 'md',
            align: 'left',
            text: 'Отправьте в чате `!рулетка` — откроется мини-рулетка с числами от 0 до 12. Игра работает, если админ включил её в настройках чата.',
          },
          {
            type: 'list',
            style: 'bullet',
            items: [
              '**Ставки** пишутся текстом: `1000 к` — на красное, `3000 1-6` — на диапазон, `5000 12` — на число.',
              '**Выплаты**: точное число ×5, цвет и чёт/нечёт ×2, зеро ×10.',
              'У каждого игрока свой стол — без активности он освобождается.',
            ],
          },
          {
            type: 'callout',
            tone: 'info',
            title: 'Нужно включить',
            text: 'Панель `!космос` → «😈 Шалости / 🎮 Игры» → «🎰 Рулетка».',
          },
        ],
      },
      uk: {
        title: 'Як грати в рулетку?',
        summary: 'Команда «!рулетка» і правила ставок.',
        blocks: [
          {
            type: 'text',
            size: 'md',
            align: 'left',
            text: 'Надішли в чаті `!рулетка` — відкриється міні-рулетка з числами від 0 до 12. Гра працює, якщо адмін увімкнув її в налаштуваннях чату.',
          },
          {
            type: 'list',
            style: 'bullet',
            items: [
              '**Ставки** пишуться текстом: `1000 к` — на червоне, `3000 1-6` — на діапазон, `5000 12` — на число.',
              '**Виплати**: точне число ×5, колір і пар/непар ×2, зеро ×10.',
              'У кожного гравця свій стіл — без активності він звільняється.',
            ],
          },
          {
            type: 'callout',
            tone: 'info',
            title: 'Потрібно увімкнути',
            text: 'Панель `!космос` → «😈 Пустощі / 🎮 Ігри» → «🎰 Рулетка».',
          },
        ],
      },
      en: {
        title: 'How do I play the roulette?',
        summary: 'The “!рулетка” command and the betting rules.',
        blocks: [
          {
            type: 'text',
            size: 'md',
            align: 'left',
            text: 'Send `!рулетка` in a chat — a mini roulette with numbers from 0 to 12 opens. The game works if an admin enabled it in the chat settings.',
          },
          {
            type: 'list',
            style: 'bullet',
            items: [
              '**Bets** are typed as text: `1000 к` for red, `3000 1-6` for a range, `5000 12` for a single number.',
              '**Payouts**: exact number ×5, colour and even/odd ×2, zero ×10.',
              'Every player gets a table — it is released when idle.',
            ],
          },
          {
            type: 'callout',
            tone: 'info',
            title: 'Must be enabled',
            text: 'Panel `!космос` → “😈 Mischief / 🎮 Games” → “🎰 Roulette”.',
          },
        ],
      },
    },
  },

  {
    icon: '👑',
    theme: 'gold',
    status: 'published',
    topic: 'shop',
    isFaq: true,
    translations: {
      ru: {
        title: 'Что даёт VIP?',
        summary: 'Премиум-статус бота и его бонусы.',
        blocks: [
          {
            type: 'text',
            size: 'md',
            align: 'left',
            text: 'VIP — премиум-статус, который покупается в приложении: звёздами Telegram или картой. Он открывает то, чего нет у обычных игроков.',
          },
          {
            type: 'list',
            style: 'check',
            items: [
              'Личные RP-команды работают во всех чатах Space.',
              'Можно отключить рассылки в чатах.',
              'Можно скрывать элементы профиля.',
              'Разводы без ограничений и без платы.',
            ],
          },
          {
            type: 'callout',
            tone: 'tip',
            title: 'Совет',
            text: 'Если VIP уже активен, новый срок добавится к текущей дате окончания — статус не сгорит.',
          },
        ],
      },
      uk: {
        title: 'Що дає VIP?',
        summary: 'Преміум-статус бота та його бонуси.',
        blocks: [
          {
            type: 'text',
            size: 'md',
            align: 'left',
            text: 'VIP — преміум-статус, який купується в застосунку: зірками Telegram або карткою. Він відкриває те, чого немає у звичайних гравців.',
          },
          {
            type: 'list',
            style: 'check',
            items: [
              'Особисті RP-команди працюють у всіх чатах Space.',
              'Можна вимкнути розсилки в чатах.',
              'Можна приховувати елементи профілю.',
              'Розлучення без обмежень і без оплати.',
            ],
          },
          {
            type: 'callout',
            tone: 'tip',
            title: 'Порада',
            text: 'Якщо VIP уже активний, новий термін додасться до поточної дати закінчення — статус не згорить.',
          },
        ],
      },
      en: {
        title: 'What does VIP give me?',
        summary: 'The bot premium status and its bonuses.',
        blocks: [
          {
            type: 'text',
            size: 'md',
            align: 'left',
            text: 'VIP is a premium status bought in the app: with Telegram stars or by card. It unlocks things regular players do not have.',
          },
          {
            type: 'list',
            style: 'check',
            items: [
              'Personal RP commands work in every Space chat.',
              'You can disable broadcasts in chats.',
              'You can hide profile elements.',
              'Unlimited free divorces.',
            ],
          },
          {
            type: 'callout',
            tone: 'tip',
            title: 'Tip',
            text: 'If VIP is already active, the new term is added to the current end date — nothing is lost.',
          },
        ],
      },
    },
  },

  {
    icon: '👮',
    theme: 'graphite',
    status: 'published',
    topic: 'common',
    isFaq: true,
    translations: {
      ru: {
        title: 'Как наказать нарушителя?',
        summary: 'Команды бана, кика и мута.',
        blocks: [
          {
            type: 'text',
            size: 'md',
            align: 'left',
            text: 'Ответьте командой на сообщение нарушителя: `!бан 2ч` — бан, `!кик` — исключение, `!мут 10м` — обеззвучивание. Снять мут — `!ремут`.',
          },
          {
            type: 'list',
            style: 'bullet',
            items: [
              'Длительность указывается после команды: `м` — минуты, `ч` — часы.',
              'Команды доступны модераторам чата и агентам звёзд.',
              'Автонаказания за спам и ссылки бот выдаёт сам, если фильтры включены.',
            ],
          },
          {
            type: 'callout',
            tone: 'warn',
            title: 'Внимание',
            text: 'Команда без ответа на сообщение не сработает: бот должен знать, к кому её применить.',
          },
        ],
      },
      uk: {
        title: 'Як покарати порушника?',
        summary: 'Команди бану, кіку та муту.',
        blocks: [
          {
            type: 'text',
            size: 'md',
            align: 'left',
            text: 'Дай відповідь командою на повідомлення порушника: `!бан 2ч` — бан, `!кик` — виключення, `!мут 10м` — обеззвучення. Зняти мут — `!ремут`.',
          },
          {
            type: 'list',
            style: 'bullet',
            items: [
              'Тривалість вказується після команди: `м` — хвилини, `ч` — години.',
              'Команди доступні модераторам чату та агентам зірок.',
              'Автопокарання за спам і посилання бот видає сам, якщо фільтри увімкнено.',
            ],
          },
          {
            type: 'callout',
            tone: 'warn',
            title: 'Увага',
            text: 'Команда без відповіді на повідомлення не спрацює: бот має знати, до кого її застосувати.',
          },
        ],
      },
      en: {
        title: 'How do I punish a rule breaker?',
        summary: 'The ban, kick and mute commands.',
        blocks: [
          {
            type: 'text',
            size: 'md',
            align: 'left',
            text: 'Reply to the offender message with a command: `!бан 2ч` to ban, `!кик` to kick, `!мут 10м` to mute. To unmute, use `!ремут`.',
          },
          {
            type: 'list',
            style: 'bullet',
            items: [
              'The duration goes after the command: `м` for minutes, `ч` for hours.',
              'The commands are available to chat moderators and star agents.',
              'Automatic punishments for spam and links are applied by the bot when filters are on.',
            ],
          },
          {
            type: 'callout',
            tone: 'warn',
            title: 'Careful',
            text: 'A command without a reply will not work: the bot must know who to punish.',
          },
        ],
      },
    },
  },
]

export const docsSeedArticles = [
  ...commonArticles,
  ...homeArticles,
  ...casesArticles,
  ...shopArticles,
  ...inventoryArticles,
  ...missionsArticles,
  ...profileArticles,
  ...faqArticles,
]

export default docsSeedArticles
