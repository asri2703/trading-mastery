// Gold Hunter — Stripe Checkout (Vercel Edge Function)
// File: api/checkout/index.js  →  route: /api/checkout
// Called from the landing page form (plan + tv_username + contact).
// Creates a Stripe Checkout Session (one-time payment) and returns the URL.

export const config = { runtime: 'edge' };

const PLANS = {
  A: { price: 5000, name: 'Indicator Only' },      // $50.00
  B: { price: 25000, name: 'Indicator + Coaching' }, // $250.00
  C: { price: 50000, name: 'Full Package' },       // $500.00
};

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }
  const { plan, tv_username, contact } = await req.json();
  if (!PLANS[plan] || !tv_username || !contact) {
    return new Response(JSON.stringify({ error: 'missing fields' }), { status: 400 });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const origin = new URL(req.url).origin;

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
      amount_usd: PLANS[plan].price / 100,
      tv_username,
      contact,
      status: 'pending',
    }),
  });
  const [order] = await orderRes.json();

  // 2) Create Stripe Checkout Session (one-time)
  const sessionRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${stripeKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      mode: 'payment',
      'line_items[0][price_data][currency]': 'usd',
      'line_items[0][price_data][product_data][name]': `Gold Hunter — ${PLANS[plan].name}`,
      'line_items[0][price_data][unit_amount]': String(PLANS[plan].price),
      'line_items[0][quantity]': '1',
      'metadata[order_id]': order.id,
      'metadata[plan]': plan,
      'metadata[tv_username]': tv_username,
      'metadata[contact]': contact,
      'success_url': `${origin}/?paid=1&plan=${plan}`,
      'cancel_url': `${origin}/?canceled=1`,
    }),
  });
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

  return new Response(JSON.stringify({ url: session.url }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
