# Trading Mastery — Gold Hunter Landing Page

Single-page selling site for the **Gold Hunter (GH)** TradingView indicator.

## Stack
- Static HTML/CSS landing page (`index.html`)
- Vercel Edge Functions for Stripe Checkout + Webhook
- Supabase for order tracking
- Telegram DM notify to owner on each sale

## Flow
1. Client clicks Buy → form (TradingView username + contact)
2. POST /api/checkout → Stripe Checkout (one-time, USD)
3. Pay → Stripe calls /api/webhook
4. Webhook marks order paid + DMs owner via @masterycommunity bot (private chat, NOT group)
5. Owner grants TradingView access manually, replies client

## Deploy Status
- ✅ Code ready, pushed to GitHub
- ✅ Vercel preview deploy (connect repo in Vercel dashboard)
- ⏸️ **Cloudflare: DEFERRED** — awak kat China, CF dashboard blocked. Guna Vercel-only (auto SSL + CDN). Point domain ke Vercel nameserver bila ready.
- ⏸️ Stripe keys: pending (awak kasi bila ready)
- ⏸️ Supabase: schema ready, project pending
- ⏸️ Telegram owner chat ID: pending

## Deploy Steps (Vercel-only, no Cloudflare)
1. Connect this GitHub repo in Vercel
2. Set env vars (see .env.example)
3. Deploy preview → review
4. Add real Stripe test keys → test card flow
5. Bila ok: add domain in Vercel → point DNS → live

## TODO before launch
- [ ] Replace placeholder images (logo, signal poster, performance poster)
- [ ] Add real Stripe keys (test → live)
- [ ] Create Supabase project + run supabase/schema.sql
- [ ] Verify Telegram owner chat id (DM, not group)
- [ ] Test full flow with Stripe test card
- [ ] Update performance poster with real GH numbers
- [ ] Point domain (Vercel nameserver, skip Cloudflare)
