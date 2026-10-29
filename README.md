<div align="center">

# 🚀 Space Mini App

**A multi-screen Telegram Mini App for a gaming community: cases, shop, inventory, missions, VIP subscription and an admin panel in one interface.**

[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white)](https://vite.dev)
[![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)](https://expressjs.com)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-pg-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![Telegram](https://img.shields.io/badge/Telegram-Mini%20App-26A5E4?logo=telegram&logoColor=white)](https://core.telegram.org/bots/webapps)
[![ESLint](https://img.shields.io/badge/ESLint-9-4B32C3?logo=eslint&logoColor=white)](https://eslint.org)

</div>

## About

Space Mini App opens right inside Telegram and works as a player dashboard: open cases, buy skins, complete missions and extend VIP. The frontend is React with Vite, the backend is Express, the data lives in the bot PostgreSQL database, and payments go through Telegram Stars and Tribute.

The interface is built from screens with a shared bottom navigation, the theme and fonts switch with a single query parameter, and every string lives in three-language dictionaries.

## Features

| Section | What is inside |
| --- | --- |
| 🎁 Cases | capsule rack, detail page with contents and odds, opening from inventory and for Stars, opening log, real Telegram gift delivery |
| 🛍️ Shop | skins and items, purchases for coins and Telegram Stars, favourites, equipping |
| 🎒 Inventory | bought and won items, Telegram gifts, a shortcut to equipping |
| 🎯 Missions | daily and weekly tasks, XP, milestone track with reward cases, progress polled every 5 seconds |
| 💎 VIP | subscription for Telegram Stars for 30, 180 and 365 days, Tribute checkout |
| 📚 Docs | built-in articles with search and deep links from the bot |
| 🛠️ Admin panel | cases, missions, articles, users, maintenance mode, sign-in by pattern or code |
| 🌍 Languages | English, Russian, Ukrainian, auto-detected from Telegram |
| 🎨 Theming | palettes and fonts in a single file, switched with `?theme=` and `?type=` |

## Tech stack

| Layer | Stack |
| --- | --- |
| Frontend | React 19, Vite 7, react-icons, lottie-react, CSS variables |
| Backend | Node.js, Express 5, PostgreSQL (`pg`), Telegram Bot API |
| Tooling | ESLint 9, npm |

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Environment: copy the template and fill in BOT_TOKEN and database credentials
# Windows PowerShell:
Copy-Item .env.example .env
# macOS / Linux:
cp .env.example .env
```

Then run two processes in separate terminals:

```bash
npm run dev      # frontend on http://localhost:5173, /api is proxied to :3001
npm run dev:api  # API on http://localhost:3001
```

Build and run in production:

```bash
npm run build   # builds dist/
npm start       # Express serves dist/ and the API on PORT, 3001 by default
```

Requirements: Node.js 20 or newer (tested on 22) and PostgreSQL with the bot tables. If the app complains about `ALTER` permissions on startup, run `server/admin_setup.sql` once as the database owner.

## Environment variables

Every value is documented in `.env.example`. The main ones:

| Variable | Purpose |
| --- | --- |
| `BOT_TOKEN` | bot token, used to verify Telegram `initData` |
| `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_HOST`, `DB_PORT` | PostgreSQL connection, or use `DATABASE_URL` instead |
| `SKINS_DIR` | skins folder, served under `/skins` |
| `PORT` | API port, `3001` by default |
| `ALLOW_DEV_AUTH`, `DEV_CHAT_ID` | local sign-in outside Telegram, keep `false` in production |
| `ADMIN_BOOTSTRAP_CHAT_ID` | owner who sets the first pattern or code for the admin panel |
| `TELEGRAM_AUTH_MAX_AGE_SECONDS` | `initData` lifetime, `0` disables the age check |
| `GIFTS_API_URL` | gift catalogue and Lottie animations provided by the userbot |
| `CASE_GIFT_DELIVERY` | case reward delivery mode: `telegram` or `internal` |
| `TRIBUTE_API_KEY`, `TRIBUTE_VIP_LINK` | VIP payments through Tribute |
| `VITE_SUPPORT_URL` | support link inside the help block |

Secrets never reach the repository: `.env` and `.env.local` are listed in `.gitignore`.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Vite dev server with hot reload |
| `npm run dev:api` | API on Node.js, reads `.env` |
| `npm run build` | production build into `dist/` |
| `npm start` | Express server, serves `dist/` and the API |
| `npm run preview` | preview the production build locally |
| `npm run lint` | lint the code with ESLint |

## Project structure

```
iSpaceAppNewStyle/
├─ src/
│  ├─ api/            API client and the Telegram Web App hook
│  ├─ components/     UI: layout, shop, cases, admin, docs, profile, common
│  ├─ config/         navigation, features, case catalogue, missions, docs
│  ├─ hooks/          useTelegramWebApp
│  ├─ i18n/           translation core and the ru / uk / en dictionaries
│  ├─ screens/        cases, shop, inventory, missions, VIP, profile, admin
│  ├─ theme/          colour palettes and typography
│  └─ utils/          formatting, case art, deep links, helpers
├─ server/
│  ├─ index.js        Express: bootstrap, payments, shop, missions, admin
│  ├─ casesApi.js     cases and their prize pools
│  ├─ caseGifts.js    Telegram gift delivery
│  ├─ giftsApi.js     gift catalogue and Lottie animations
│  ├─ missionsApi.js  missions and reset cadences
│  ├─ docsApi.js      documentation articles
│  ├─ tributeApi.js   Tribute payments
│  └─ admin_setup.sql manual migration for owner permissions
├─ public/            skins, emoji, images
├─ index.html
└─ vite.config.js
```

## API

The client calls the API with `Authorization: tma <initData>` and the server verifies the signature with the bot token. Without valid `initData` everything except `/api/health` is closed.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/health` | API liveness probe |
| GET | `/api/bootstrap` | profile, balances, inventory, cases and missions on startup |
| POST | `/api/cases/open` | open a case |
| POST | `/api/cases/purchase-link` | Stars invoice for a case |
| GET | `/api/cases/:id/image` | case artwork |
| POST | `/api/shop/purchase` | buy an item |
| POST | `/api/shop/equip`, `/api/shop/favorite` | equip an item, toggle favourites |
| GET | `/api/missions` | missions and progress |
| POST | `/api/missions/claim` | claim a mission reward |
| POST | `/api/vip/purchase-link` | Stars invoice for the VIP subscription |
| POST | `/api/payments/sync`, `/api/payments/telegram/update` | payment synchronisation |
| POST | `/api/tribute/webhook` | Tribute webhook |
| GET | `/api/docs`, `/api/gifts` | documentation articles, gift catalogue |
| `*` | `/api/admin/*` | cases, missions, articles, users, access, maintenance |

## Security

- `initData` is verified with an HMAC built from `BOT_TOKEN`, and the age check is tuned with `TELEGRAM_AUTH_MAX_AGE_SECONDS`.
- Prices and subscription periods live on the server, so the Mini App cannot tamper with them.
- The admin panel is owner-only: sign-in uses a 3x3 pattern or a 4 or 8 digit code, with a one minute cooldown after three failures.
- Maintenance mode returns only the `maintenance` flag to ordinary players while the owner keeps working.

## Localisation

Three languages: `ru`, `uk` and `en`. The locale is resolved from the explicit choice in the app, then from the Telegram `language_code`, then from `users.lang` in the database, then from the browser. A new language is a copied dictionary plus one entry in the locale registry, details are in [DOCUMENTATION.md](DOCUMENTATION.md).

## Documentation

Deep technical notes on cases, missions, i18n, theming, the admin panel, gifts and payments live in [DOCUMENTATION.md](DOCUMENTATION.md).

---

<div align="center">

Built for Telegram Mini Apps with React + Vite + Express + PostgreSQL.

</div>
