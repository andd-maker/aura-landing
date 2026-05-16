# Aura Landing

Self-service onboarding-лендинг для Aura Access. Деплоится на **Cloudflare Pages**
(не свой nginx) — `git push` → автоматическая сборка → live за 30 секунд.

Backend (Flask `/api/onboarding/...`) живёт на 5.42, проксируется через
**Cloudflare Tunnel** (`*.trycloudflare.com`).

## Stack

- **Vite 7** + **React 19** + TypeScript.
- **TailwindCSS 4** через `@tailwindcss/vite`.
- **Lenis** — плавная прокрутка.
- **qrcode** — QR-код subscription URL.
- **lucide-react** — иконки.

## Setup

```bash
curl -fsSL https://bun.sh/install | bash  # один раз
cd aura-landing
bun install
cp .env.example .env  # отредактируй VITE_API_BASE
```

## Dev

```bash
bun run dev   # http://localhost:5173
```

## Build

```bash
bun run build   # → dist/
```

## Deploy

**Cloudflare Pages** делает это сам: connect Git-репо, при каждом `git push`
запускает `bun install && bun run build` и публикует. Локально ничего собирать
не надо — это для разработки.

## Environment

| Var | Назначение | Пример |
|---|---|---|
| `VITE_API_BASE` | URL backend API (Cloudflare Tunnel) | `https://api-aura.trycloudflare.com/api` |
| `VITE_YANDEX_CAPTCHA_SITE_KEY` | Public key Yandex SmartCaptcha (опционально) | `ysc1_xxx...` |

Если `VITE_API_BASE` пуст — используется относительный `/api` (для same-origin
через Cloudflare Pages Functions reverse proxy).

Если `VITE_YANDEX_CAPTCHA_SITE_KEY` пуст — `tryCaptchaToken()` возвращает `null`,
backend проходит без верификации (CAPTCHA_ENABLED=False feature-flag).

## Что переработано из Lovable preview

См. `CLAUDE_PITFALLS.md` §3.66-§3.68 для контекста. Удалено:
- TanStack Start (SSR-overkill для лендинга)
- @cloudflare/vite-plugin (нам не нужен Cloudflare Workers тут — у нас Cloudflare Pages)
- @lovable.dev/vite-tanstack-config (proprietary build wrapper)
- 30+ неиспользуемых Radix UI компонентов в `src/components/ui/`
- SSR error-page, wrangler.jsonc, src/server.ts, src/start.ts, routes/

Применено:
- `showDev = false` (Денис исправил в Lovable)
- `mockRequest` → `requestOnboarding` (реальный fetch с обработкой ошибок)
- `tryCaptchaToken()` — SmartCaptcha invisible раскомментирован
- Error UI banner — при API fail показывается human-readable сообщение
- `API_BASE` через env — фронт указывает на Cloudflare Tunnel URL

## Структура

```
aura-landing/
├── README.md
├── package.json
├── tsconfig.json
├── vite.config.ts
├── index.html              ← с smartcaptcha script
├── .env.example
├── public/
│   ├── favicon.png
│   ├── apple-touch-icon.png
│   └── video/
│       ├── karing-tutorial.mp4    ← инструкция по установке
│       └── karing-tutorial-poster.jpg
└── src/
    ├── env.d.ts
    ├── main.tsx               ← entry
    ├── styles.css             ← Tailwind + custom (grain, spotlight, magnetic)
    ├── assets/
    │   └── aura-logo.png
    ├── components/
    │   └── AuraLanding.tsx    ← главный компонент (~1180 строк)
    ├── hooks/
    │   ├── use-aura-effects.ts  ← reveal/scroll/lenis/live-users
    │   └── use-mobile.tsx
    └── data/
        └── testimonials.ts    ← список отзывов
```
