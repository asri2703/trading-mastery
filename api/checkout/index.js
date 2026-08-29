// Gold Hunter — Stripe Checkout (Vercel Edge Function)
// File: api/checkout/index.js → route: /api/checkout
// Called from the landing page form (plan + tv_username + telegram).
// Creates a Stripe Checkout Session (one-time payment) and returns the URL.

export const config = { runtime: 'edge' };

// New plan mapping (Flex/Plus/Pro) — $29/$75/$132
const PLANS = {
  flex: { price: 2900, name: 'Flex — 1 Month Access', duration_days: 30 },
  plus: { price: 7500, name: 'Plus — 3 Months Access ($25/mo)', duration_days: 90 },
  pro: { price: 13200, name: 'Pro — 6 Months Access ($22/mo)', duration_days: 180 },
};

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  let body;
  try {
    body = await req.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: 'invalid json' }), { status: 400 });
  }

  const { plan, tv_username, telegram, email } = body;
  if (!PLANS[plan] || !tv_username || !telegram) {
    return new Response(JSON.stringify({ error: 'missing fields', required: ['plan', 'tv_username', 'telegram'] }), { status: 400 });
  }

  // Sanitize inputs
  const cleanTv = String(tv_username).trim().replace(/^@/, '').toLowerCase();
  const cleanTg = String(telegram).trim().replace(/^@/, '').toLowerCase();
  // Email is optional but recommended
  const cleanEmail = email ? String(email).trim().toLowerCase() : null;
  // Basic email validation
  if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return new Response(JSON.stringify({ error: 'invalid email format' }), { status: 400 });
  }
  if (!cleanTv || !cleanTg) {
    return new Response(JSON.stringify({ error: 'invalid username' }), { status: 400 });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const origin = new URL(req.url).origin;

  if (!stripeKey || !supabaseUrl || !supabaseKey) {
    return new Response(JSON.stringify({ error: 'server misconfigured' }), { status: 500 });
  }

  // 1) Create pending order in Supabase
  const orderRes = await fetch(`${supabaseUrl}/rest/v1/gh_orders`, {
    method: 'POST',
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify({
      plan,
      plan_name: PLANS[plan].name,
      amount_usd: PLANS[plan].price / 100,
      tv_username: cleanTv,
      telegram_username: cleanTg,
      email: cleanEmail,
      status: 'pending',
    }),
  });

  if (!orderRes.ok) {
    const err = await orderRes.text();
    return new Response(JSON.stringify({ error: 'order create failed', detail: err }), { status: 500 });
  }
  const [order] = await orderRes.json();

  // 2) Create Stripe Checkout Session (one-time payment, NOT subscription)
  const stripeParams = {
    mode: 'payment', // ONE-TIME payment, no recurring
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][product_data][name]': `Trading Mastery — ${PLANS[plan].name}`,
    'line_items[0][price_data][product_data][description]': `Indicator access for TradingView @${cleanTv} (${PLANS[plan].duration_days} days)`,
    'line_items[0][price_data][unit_amount]': String(PLANS[plan].price),
    'line_items[0][quantity]': '1',
    // Always create Stripe customer (needed for customer portal — invoice access)
    'customer_creation': 'always',
    // Session metadata (for webhook to identify order)
    'metadata[order_id]': order.id,
    'metadata[plan]': plan,
    'metadata[tv_username]': cleanTv,
    'metadata[telegram]': cleanTg,
    'metadata[duration_days]': String(PLANS[plan].duration_days),
    'success_url': `${origin}/?paid=1&order=${order.id}`,
    'cancel_url': `${origin}/?canceled=1&order=${order.id}`,
    'automatic_tax[enabled]': 'false',
  };
  // If email provided, pre-fill checkout + auto-send receipt
  if (cleanEmail) {
    stripeParams['customer_email'] = cleanEmail;
    stripeParams['payment_intent_data[receipt_email]'] = cleanEmail;
  }
  const sessionRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${stripeKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(stripeParams),
  });

  if (!sessionRes.ok) {
    const err = await sessionRes.text();
    return new Response(JSON.stringify({ error: 'stripe session failed', detail: err }), { status: 500 });
  }
  const session = await sessionRes.json();

  // 3) Save session id back to order
  await fetch(`${supabaseUrl}/rest/v1/gh_orders?id=eq.${order.id}`, {
    method: 'PATCH',
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ stripe_session_id: session.id }),
  });

  return new Response(JSON.stringify({ url: session.url, order_id: order.id }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
