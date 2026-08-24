# Gold Hunter — Landing Page Content Draft (English)

> All copy is final-ready. Images are PLACEHOLDERS — replace with real assets later.
> Brand: Gold Hunter (GH). Product: TradingView Pine Script indicator (access granted via username, not file).
> Payment: Stripe, one-time, USD. Delivery: manual grant within 24h.

---

## 1. HERO SECTION

**Eyebrow:** XAUUSD SIGNALS FOR TRADINGVIEW
**Headline:** Gold Hunter — Automated XAUUSD Signals, Granted to Your TradingView
**Subhead:** No files. No install. We add your username and you get BUY/SELL signals with auto TP/SL levels straight to Telegram. Lifetime access. One-time payment.
**Primary CTA:** [ View Plans ]
**Secondary CTA:** [ See Live Performance ]

*Placeholder image: GH logo top-left, hero background = gold/dark gradient*

---

## 2. WHAT IS GOLD HUNTER

**Title:** What is Gold Hunter?

Gold Hunter is a TradingView indicator built for one thing: trading XAUUSD (Gold) with clarity.

Instead of sending you a script file, we grant Gold Hunter directly to your TradingView username. The moment a signal fires, you get a BUY or SELL alert with entry, take-profit (TP1/TP2/TP3) and stop-loss (SL) levels — plus a chart screenshot — delivered to your Telegram.

No repainting. No guessing. Just clean, tracked signals.

---

## 3. HOW IT WORKS

**Title:** How It Works — 3 Steps

**Step 1 — Purchase**
Choose your plan and pay once. No subscription, no recurring fee.

**Step 2 — Fill The Form**
After checkout, enter your TradingView username and contact. That's all we need.

**Step 3 — Get Access**
We grant Gold Hunter to your username within 24 hours. Signals start flowing to your Telegram.

*Icon ideas: 1) Credit card  2) Form/clipboard  3) TradingView logo*

---

## 4. LIVE SIGNAL PREVIEW

**Title:** A Real Signal Looks Like This

[PLACEHOLDER: render gh_chart_poster.html — BUY XAUUSD example with chart screenshot]

Caption: "Example signal from the Gold Hunter channel — entry, TP levels, SL, and chart, sent to Telegram the moment it fires."

---

## 5. PERFORMANCE PROOF

**Title:** Tracked Results, Not Promises

[PLACEHOLDER: render gh_performance_poster.html — win rate + pips]

Caption: "Actual signals tracked by Gold Hunter. Past performance is not indicative of future results."

*Note: pull real numbers from GH state (currently 55 closed, +pips). Update poster before launch.*

---

## 6. FEATURES

**Title:** What You Get

- ✅ XAUUSD focused — Gold only, no noise
- ✅ Auto BUY/SELL with TP1 / TP2 / TP3 + SL levels
- ✅ Multi-timeframe — scalping & intraday setups
- ✅ Telegram alerts with chart screenshot
- ✅ Lifetime TradingView access — granted to your username
- ✅ One-time payment — no subscription, no expiry

---

## 7. PLANS / PRICING

**Title:** Choose Your Plan

All plans: one-time payment, lifetime TradingView access, Telegram signals included.

### Plan A — Indicator Only
**$50**
- Gold Hunter indicator (lifetime, granted to your TV username)
- Telegram signal channel access
- Install-free — we add your username

[ Buy $50 ]

### Plan B — Indicator + Coaching
**$250**
- Everything in Plan A
- 1× Indicator coaching session (how to read & use Gold Hunter signals)

[ Buy $250 ]

### Plan C — Full Package
**$500**
- Everything in Plan B
- + Basic trading coaching (risk, entries, trading psychology)

[ Buy $500 ]

*Footer note: Prices in USD. One-time payment. No hidden fees.*

---

## 8. PURCHASE FORM (post-checkout)

**Title:** Almost There — Tell Us Your Username

Plan: [auto-filled from clicked Buy button]

- TradingView Username * (required)
- Telegram or Email * (for access confirmation)
- [ Pay $X ] → Stripe Checkout

Note: "After payment, we grant Gold Hunter to this username within 24 hours and send your Telegram invite."

*Validation: username required, contact required. Plan pre-selected.*

---

## 9. DELIVERY

**Title:** What Happens After You Pay

1. Payment confirmed via Stripe
2. You submitted your TradingView username + contact
3. Within 24 hours, we grant Gold Hunter to your username
4. You receive a Telegram invite + confirmation message
5. Signals start flowing — lifetime, no file needed

---

## 10. FAQ

**Q: Do I need a TradingView Premium plan?**
A: No. Gold Hunter works on the free TradingView plan.

**Q: How do I receive signals?**
A: After access is granted, you get invited to the Gold Hunter Telegram channel where every signal posts automatically.

**Q: Is this really lifetime?**
A: Yes. One-time payment = forever access granted to your TradingView username. No expiry.

**Q: What if I entered the wrong username?**
A: Contact us via Telegram and we'll update it before granting.

**Q: Do you offer refunds?**
A: Gold Hunter is a digital access product granted to your account. All sales are final.

**Q: I'm in India — can I pay?**
A: Yes. Stripe accepts Indian cards, UPI, and Google Pay.

---

## 11. CONTACT

**Title:** Questions? Talk to Us First

- Telegram: @[YOUR_TELEGRAM]
- Email: [YOUR_EMAIL]

We usually reply within a few hours.

---

## 12. FOOTER

Gold Hunter · © 2026 · For educational purposes only. Trading involves risk.
[Link: Mastery Signal] (optional)

---

## TECHNICAL NOTES (for build)

- Stripe: 3 Price IDs (plan_a $50, plan_b $250, plan_c $500), one-time mode
- Supabase table `gh_orders`: id, plan, tv_username, contact, stripe_session, status, created_at
- Stripe webhook → Edge Function / server → insert order + notify Telegram bot (@masterycommunity bot, DM to owner, NOT group post)
- Telegram notify format:
  "🚨 NEW GH SALE
   Plan: B ($250)
   TV Username: @xxx
   Contact: @yyy / yyy@mail
   Payment: confirmed"
- Hosting: Vercel (preview) → Cloudflare + new domain (live)
- GitHub repo: gh-landing (preview deploy on push)
