DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'owner'
  ) THEN
    ALTER TABLE owner ADD COLUMN IF NOT EXISTS mini_app_pattern_hash text;
    ALTER TABLE owner ADD COLUMN IF NOT EXISTS mini_app_code_hash text;
    -- «Вход без пароля»: когда true, админка пускает владельца бота без фигуры и кода.
    ALTER TABLE owner ADD COLUMN IF NOT EXISTS mini_app_access_off boolean NOT NULL DEFAULT false;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS case_balances (
  chat_id bigint PRIMARY KEY,
  homeless integer NOT NULL DEFAULT 0,
  standard integer NOT NULL DEFAULT 0,
  unusual integer NOT NULL DEFAULT 0,
  premium integer NOT NULL DEFAULT 0,
  spring integer NOT NULL DEFAULT 0,
  march_8th integer NOT NULL DEFAULT 0,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE case_balances ADD COLUMN IF NOT EXISTS homeless integer NOT NULL DEFAULT 0;
ALTER TABLE case_balances ADD COLUMN IF NOT EXISTS standard integer NOT NULL DEFAULT 0;
ALTER TABLE case_balances ADD COLUMN IF NOT EXISTS unusual integer NOT NULL DEFAULT 0;
ALTER TABLE case_balances ADD COLUMN IF NOT EXISTS premium integer NOT NULL DEFAULT 0;
ALTER TABLE case_balances ADD COLUMN IF NOT EXISTS spring integer NOT NULL DEFAULT 0;
ALTER TABLE case_balances ADD COLUMN IF NOT EXISTS march_8th integer NOT NULL DEFAULT 0;
ALTER TABLE case_balances ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS gift_balances (
  chat_id bigint NOT NULL,
  gift_code text NOT NULL,
  amount integer NOT NULL DEFAULT 0,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (chat_id, gift_code)
);

ALTER TABLE gift_balances ADD COLUMN IF NOT EXISTS amount integer NOT NULL DEFAULT 0;
ALTER TABLE gift_balances ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS case_openings (
  id serial PRIMARY KEY,
  chat_id bigint NOT NULL,
  case_type text NOT NULL,
  reward_type text NOT NULL,
  reward_code text,
  reward_title text NOT NULL,
  reward_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE case_openings ADD COLUMN IF NOT EXISTS reward_code text;
ALTER TABLE case_openings ADD COLUMN IF NOT EXISTS reward_payload jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE case_openings ADD COLUMN IF NOT EXISTS created_at timestamp with time zone NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS mission_progress (
  chat_id bigint PRIMARY KEY,
  xp integer NOT NULL DEFAULT 0,
  claimed_milestones jsonb NOT NULL DEFAULT '[]'::jsonb,
  claims jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE mission_progress
ADD COLUMN IF NOT EXISTS claimed_milestones jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'mission_progress'
      AND column_name = 'claimed_milestones'
      AND data_type <> 'jsonb'
  ) THEN
    ALTER TABLE mission_progress
    ALTER COLUMN claimed_milestones TYPE jsonb
    USING to_jsonb(claimed_milestones);
  END IF;
END $$;

ALTER TABLE mission_progress
ADD COLUMN IF NOT EXISTS claims jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE mission_progress
ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS star_case_orders (
  id text PRIMARY KEY,
  chat_id bigint NOT NULL,
  case_type text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  amount_stars integer NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  invoice_payload text NOT NULL UNIQUE,
  invoice_link text,
  telegram_payment_charge_id text,
  payment_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  paid_at timestamp with time zone,
  fulfilled_at timestamp with time zone,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE star_case_orders ADD COLUMN IF NOT EXISTS invoice_link text;
ALTER TABLE star_case_orders ADD COLUMN IF NOT EXISTS telegram_payment_charge_id text;
ALTER TABLE star_case_orders ADD COLUMN IF NOT EXISTS payment_payload jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE star_case_orders ADD COLUMN IF NOT EXISTS paid_at timestamp with time zone;
ALTER TABLE star_case_orders ADD COLUMN IF NOT EXISTS fulfilled_at timestamp with time zone;
ALTER TABLE star_case_orders ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_case_openings_chat_id ON case_openings (chat_id);
CREATE INDEX IF NOT EXISTS idx_case_openings_created_at ON case_openings (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_star_case_orders_chat_id ON star_case_orders (chat_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_star_case_orders_status ON star_case_orders (status, created_at DESC);

-- Заказы VIP-подписки за Telegram Stars (раздел «VIP» в Mini App).
-- Тарифы и цены живут в коде сервера (vipPlans в server/index.js), здесь только
-- заказы: оплата звёздами, а срок продлевается в общей таблице бота vip_users.
CREATE TABLE IF NOT EXISTS star_vip_orders (
  id text PRIMARY KEY,
  chat_id bigint NOT NULL,
  plan_id text NOT NULL,
  days integer NOT NULL,
  amount_stars integer NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  invoice_payload text NOT NULL UNIQUE,
  invoice_link text,
  telegram_payment_charge_id text,
  payment_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  paid_at timestamp with time zone,
  fulfilled_at timestamp with time zone,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE star_vip_orders ADD COLUMN IF NOT EXISTS invoice_link text;
ALTER TABLE star_vip_orders ADD COLUMN IF NOT EXISTS telegram_payment_charge_id text;
ALTER TABLE star_vip_orders ADD COLUMN IF NOT EXISTS payment_payload jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE star_vip_orders ADD COLUMN IF NOT EXISTS paid_at timestamp with time zone;
ALTER TABLE star_vip_orders ADD COLUMN IF NOT EXISTS fulfilled_at timestamp with time zone;
ALTER TABLE star_vip_orders ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_star_vip_orders_chat_id ON star_vip_orders (chat_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_star_vip_orders_status ON star_vip_orders (status, created_at DESC);

-- Оплата VIP дописывает дни в таблицу бота vip_users (общая база Space). Без
-- прав на неё заказ оплатится, но подписка не продлится — например:
-- GRANT SELECT, INSERT, UPDATE ON vip_users TO space_user;

-- Для первого входа укажи ADMIN_BOOTSTRAP_CHAT_ID в .env.
-- Способы входа в админку Mini App: owner.mini_app_pattern_hash (фигура) и
-- owner.mini_app_code_hash (числовой код из 4 или 8 цифр) — только хеши.
-- owner.mini_app_access_off — тумблер «вход без пароля»: при true админка пускает
-- владельца бота сразу, фигура и код не спрашиваются (хеши при этом сохраняются).

-- Первый нарисованный владельцем pattern сохранится в owner.mini_app_pattern_hash уже в хешированном виде.

-- ============================================================
-- Раздел «Документация» (Epic 2)
-- Те же таблицы сервер создаёт идемпотентно сам при старте
-- (server/docsApi.js, функция ensureDocsSchema), этот блок нужен
-- для ручного развёртывания от владельца БД.
-- ============================================================

CREATE TABLE IF NOT EXISTS doc_articles (
  id serial PRIMARY KEY,
  icon text NOT NULL DEFAULT '📘',
  theme text NOT NULL DEFAULT 'nebula',
  status text NOT NULL DEFAULT 'draft',
  topic text NOT NULL DEFAULT 'common',
  is_faq boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE doc_articles ADD COLUMN IF NOT EXISTS icon text NOT NULL DEFAULT '📘';
ALTER TABLE doc_articles ADD COLUMN IF NOT EXISTS theme text NOT NULL DEFAULT 'nebula';
ALTER TABLE doc_articles ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft';
ALTER TABLE doc_articles ADD COLUMN IF NOT EXISTS topic text NOT NULL DEFAULT 'common';
ALTER TABLE doc_articles ADD COLUMN IF NOT EXISTS is_faq boolean NOT NULL DEFAULT false;
ALTER TABLE doc_articles ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
ALTER TABLE doc_articles ADD COLUMN IF NOT EXISTS created_at timestamp with time zone NOT NULL DEFAULT now();
ALTER TABLE doc_articles ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS doc_translations (
  article_id integer NOT NULL REFERENCES doc_articles (id) ON DELETE CASCADE,
  locale text NOT NULL,
  title text NOT NULL DEFAULT '',
  summary text NOT NULL DEFAULT '',
  blocks jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (article_id, locale)
);

CREATE INDEX IF NOT EXISTS idx_doc_articles_status ON doc_articles (status, sort_order, id);
CREATE INDEX IF NOT EXISTS idx_doc_articles_topic ON doc_articles (topic, is_faq, sort_order);
CREATE INDEX IF NOT EXISTS idx_doc_translations_locale ON doc_translations (locale);

-- Права приложению (подставь имя роли из DB_USER):
-- GRANT SELECT, INSERT, UPDATE, DELETE ON doc_articles, doc_translations TO space_user;
-- GRANT USAGE, SELECT ON SEQUENCE doc_articles_id_seq TO space_user;


-- ============================================================
-- Раздел «Задания» (миссии)
-- Таблицу сервер создаёт идемпотентно сам при старте
-- (server/missionsApi.js, функция ensureMissionsSchema) и один раз
-- наполняет стартовым набором заданий — этот блок нужен для ручного
-- развёртывания от владельца БД.
-- Список ДЕЙСТВИЙ заданий остаётся в коде: сервер умеет считать прогресс
-- только по ним (см. missionActionCatalog в server/missionsApi.js).
-- ============================================================

CREATE TABLE IF NOT EXISTS mini_app_missions (
  id text PRIMARY KEY,
  kind text NOT NULL DEFAULT 'daily',
  action text NOT NULL,
  where_scope text NOT NULL DEFAULT 'bot',
  titles jsonb NOT NULL DEFAULT '{}'::jsonb,
  texts jsonb NOT NULL DEFAULT '{}'::jsonb,
  goal integer NOT NULL DEFAULT 1,
  xp integer NOT NULL DEFAULT 0,
  reward_case text,
  difficulty text NOT NULL DEFAULT 'normal',
  color text NOT NULL DEFAULT '#52a8ff',
  refresh_hours integer NOT NULL DEFAULT 24,
  repeatable boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE mini_app_missions ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'daily';
ALTER TABLE mini_app_missions ADD COLUMN IF NOT EXISTS action text;
ALTER TABLE mini_app_missions ADD COLUMN IF NOT EXISTS where_scope text NOT NULL DEFAULT 'bot';
ALTER TABLE mini_app_missions ADD COLUMN IF NOT EXISTS titles jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE mini_app_missions ADD COLUMN IF NOT EXISTS texts jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE mini_app_missions ADD COLUMN IF NOT EXISTS goal integer NOT NULL DEFAULT 1;
ALTER TABLE mini_app_missions ADD COLUMN IF NOT EXISTS xp integer NOT NULL DEFAULT 0;
ALTER TABLE mini_app_missions ADD COLUMN IF NOT EXISTS reward_case text;
ALTER TABLE mini_app_missions ADD COLUMN IF NOT EXISTS difficulty text NOT NULL DEFAULT 'normal';
ALTER TABLE mini_app_missions ADD COLUMN IF NOT EXISTS color text NOT NULL DEFAULT '#52a8ff';
ALTER TABLE mini_app_missions ADD COLUMN IF NOT EXISTS refresh_hours integer NOT NULL DEFAULT 24;
ALTER TABLE mini_app_missions ADD COLUMN IF NOT EXISTS repeatable boolean NOT NULL DEFAULT true;
ALTER TABLE mini_app_missions ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
ALTER TABLE mini_app_missions ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 100;
ALTER TABLE mini_app_missions ADD COLUMN IF NOT EXISTS created_at timestamp with time zone NOT NULL DEFAULT now();
ALTER TABLE mini_app_missions ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_mini_app_missions_active ON mini_app_missions (active, kind, sort_order);

-- Права приложению (подставь имя роли из DB_USER):
-- GRANT SELECT, INSERT, UPDATE, DELETE ON mini_app_missions TO space_user;


-- ============================================================
-- Раздел «Кейсы»
-- Таблицы сервер создаёт идемпотентно сам при старте
-- (server/casesApi.js, функция ensureCasesSchema) и один раз
-- наполняет стартовым набором из шести старых кейсов — этот блок
-- нужен для ручного развёртывания от владельца БД.
-- Балансы старых кейсов остались в колонках case_balances
-- (совместимость с ботом), а новые кейсы получают баланс строкой
-- в mini_app_case_balances.
-- ============================================================

CREATE TABLE IF NOT EXISTS mini_app_cases (
  id text PRIMARY KEY,
  titles jsonb NOT NULL DEFAULT '{}'::jsonb,
  texts jsonb NOT NULL DEFAULT '{}'::jsonb,
  accent text NOT NULL DEFAULT 'cyan',
  stars integer NOT NULL DEFAULT 0,
  image text,
  contents jsonb NOT NULL DEFAULT '[]'::jsonb,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  -- theme — цвета блока «Кейс дня» ({ mode, from, to, angle }); featured —
  -- выбран ли кейс в блок (только у одного кейса true).
  theme jsonb NOT NULL DEFAULT '{}'::jsonb,
  featured boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE mini_app_cases ADD COLUMN IF NOT EXISTS titles jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE mini_app_cases ADD COLUMN IF NOT EXISTS texts jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE mini_app_cases ADD COLUMN IF NOT EXISTS accent text NOT NULL DEFAULT 'cyan';
ALTER TABLE mini_app_cases ADD COLUMN IF NOT EXISTS stars integer NOT NULL DEFAULT 0;
ALTER TABLE mini_app_cases ADD COLUMN IF NOT EXISTS image text;
ALTER TABLE mini_app_cases ADD COLUMN IF NOT EXISTS contents jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE mini_app_cases ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
ALTER TABLE mini_app_cases ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 100;
ALTER TABLE mini_app_cases ADD COLUMN IF NOT EXISTS theme jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE mini_app_cases ADD COLUMN IF NOT EXISTS featured boolean NOT NULL DEFAULT false;
ALTER TABLE mini_app_cases ADD COLUMN IF NOT EXISTS created_at timestamp with time zone NOT NULL DEFAULT now();
ALTER TABLE mini_app_cases ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_mini_app_cases_active ON mini_app_cases (active, sort_order);

CREATE TABLE IF NOT EXISTS mini_app_case_balances (
  chat_id bigint NOT NULL,
  case_id text NOT NULL,
  amount integer NOT NULL DEFAULT 0,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (chat_id, case_id)
);

-- Права приложению (подставь имя роли из DB_USER):
-- GRANT SELECT, INSERT, UPDATE, DELETE ON mini_app_cases, mini_app_case_balances TO space_user;

-- ── VIP за реальные деньги (Tribute) ─────────────────────────────────────────
-- Журнал вебхуков Tribute. Приложение создаёт таблицу само (ensureTributeSchema),
-- но если у него нет прав CREATE — выполни этот блок от владельца БД.
-- Уникальный event_key защищает от двойного продления VIP при повторе вебхука.
CREATE TABLE IF NOT EXISTS tribute_events (
  id bigserial PRIMARY KEY,
  event_key text NOT NULL UNIQUE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  telegram_user_id bigint,
  subscription_id bigint,
  period_id bigint,
  period text,
  price bigint,
  amount bigint,
  currency text,
  expires_at timestamp with time zone,
  days integer NOT NULL DEFAULT 0,
  payload jsonb NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  processed_at timestamp with time zone
);

CREATE INDEX IF NOT EXISTS idx_tribute_events_user ON tribute_events (telegram_user_id, created_at DESC);

-- Права приложению (подставь имя роли из DB_USER):
-- GRANT SELECT, INSERT, UPDATE, DELETE ON tribute_events TO space_user;
-- GRANT USAGE, SELECT ON SEQUENCE tribute_events_id_seq TO space_user;

