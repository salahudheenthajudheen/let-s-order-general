# Let's Order — Voice-Enabled E-Commerce Platform

🛍 Telegram-first ordering platform with voice support, Sarvam AI, Supabase Edge Functions, and a React seller dashboard.

## Architecture

```
┌──────────────┐     ┌───────────────────┐     ┌──────────────┐
│   Telegram   │────→│  Supabase Edge    │────→│   Supabase   │
│   Bot API    │←────│  Functions (Deno) │←────│  PostgreSQL  │
└──────────────┘     └───────────────────┘     └──────┬───────┘
                              │                       │
                     ┌────────┴────────┐        Realtime │
                     │   Sarvam AI    │              │
                     │   STT / TTS    │     ┌────────┴───────┐
                     └─────────────────┘     │ React Dashboard│
                                             │  (Seller UI)   │
                                             └────────────────┘
```

## Quick Start

### 1. Set Environment Variables

Set these as Supabase secrets:
```bash
supabase secrets set TELEGRAM_BOT_TOKEN=your-token
supabase secrets set SARVAM_API_KEY=your-key
supabase secrets set RAZORPAY_KEY_ID=your-key
supabase secrets set RAZORPAY_KEY_SECRET=your-secret
```

### 2. Deploy Edge Functions

```bash
supabase functions deploy telegram-webhook --no-verify-jwt
supabase functions deploy match-seller --no-verify-jwt
supabase functions deploy generate-payment-link --no-verify-jwt
```

### 3. Set Telegram Webhook

```bash
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://psxtywfmohnvytrfedjs.supabase.co/functions/v1/telegram-webhook"}'
```

### 4. Run Dashboard

```bash
cd frontend
cp .env.example .env  # Update with your Supabase credentials
npm install
npm run dev
```

## Project Structure

```
├── supabase/functions/
│   ├── telegram-webhook/index.ts    # Main bot webhook
│   ├── match-seller/index.ts        # Seller matching
│   ├── generate-payment-link/index.ts # Razorpay integration
│   └── _shared/
│       ├── supabase.ts              # DB client
│       ├── telegram.ts              # Bot API helpers
│       └── sarvam.ts                # STT/TTS wrappers
├── frontend/
│   └── src/
│       ├── components/              # OrderCard, OrderList, StatusBadge
│       ├── pages/                   # Dashboard, Login
│       ├── lib/supabase.js          # Client + Realtime
│       └── App.jsx                  # Auth + routing
└── README.md
```

## Bot Commands

| Command | Description |
|---------|-------------|
| `/start` | Welcome + language selection |
| `/order` | Step-by-step order wizard |
| `/status` | Check order status |
| `/cancel` | Cancel pending order |
| `/help` | Show all commands |

## Supported Languages

Hindi, Tamil, Malayalam, Telugu, Kannada, Bengali, Marathi, Gujarati, Punjabi, English
