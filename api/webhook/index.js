// Gold Hunter — Stripe Webhook + Telegram Notify (Vercel Edge Function)
// File: api/webhook/index.js → route: /api/webhook
// Stripe calls this on checkout.session.completed.
// We: 1) verify HMAC sig, 2) mark paid in Supabase, 3) DM owner + post to channel with action buttons

export const config = { runtime: 'edge' };

// Plan display names
const PLAN_DISPLAY = {
  flex: 'Flex ($29 · 1 Month)',
  plus: 'Plus ($75 · 3 Months · $25/mo)',
  pro: 'Pro ($132 · 6 Months · $22/mo)',
};

const PLAN_EMOJI = {
  flex: '🥉',
  plus: '🥈',
  pro: '🥇',
};

// HMAC-SHA256 verification helper for Stripe signature
async function verifyStripeSignature(body, sigHeader, secret) {
  if (!sigHeader || !secret) return false;

  // Stripe sig format: t=timestamp,v1=signature[,v1=signature...]
  const parts = sigHeader.split(',').reduce((acc, p) => {
    const [k, v] = p.split('=');
    acc[k] = v;
    return acc;
  }, {});
  const timestamp = parts.t;
  const v1 = parts.v1;
  if (!timestamp || !v1) return false;

  // Construct signed payload
  const signedPayload = `${timestamp}.${body}`;

  // Compute HMAC-SHA256
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload));
  const expected = Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  // Constant-time compare (avoid timing attacks)
  if (expected.length !== v1.length) return false;
  let result = 0;
  for (let i = 0; i < expected.length; i++) {
    result |= expected.charCodeAt(i) ^ v1.charCodeAt(i);
  }
  return result === 0;
}

export default async function handler(req) {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const whSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const ghBotToken = process.env.GH_BOT_TOKEN;
  const ownerChatId = process.env.OWNER_CHAT_ID;
  const channelId = process.env.GH_CHANNEL_ID;

  if (!stripeKey || !whSecret || !supabaseUrl || !supabaseKey || !ghBotToken) {
    return new Response('server misconfigured', { status: 500 });
  }

  // Get raw body for HMAC verification
  const body = await req.text();
  const sig = req.headers.get('stripe-signature');

  // Verify HMAC signature
  const valid = await verifyStripeSignature(body, sig, whSecret);
  if (!valid) {
    console.error('Invalid Stripe signature');
    return new Response('invalid signature', { status: 400 });
  }

  let event;
  try {
    event = JSON.parse(body);
  } catch (e) {
    return new Response('invalid json', { status: 400 });
  }

  // Only process successful checkout
  if (event.type !== 'checkout.session.completed') {
    return new Response('ignored', { status: 200 });
  }

  const session = event.data.object;
  const meta = session.metadata || {};
  const orderId = meta.order_id;
  const plan = meta.plan;
  const tv = meta.tv_username;
  const telegram = meta.telegram;
  const durationDays = parseInt(meta.duration_days || '30', 10);

  if (!orderId || !plan || !tv || !telegram) {
    return new Response('missing metadata', { status: 400 });
  }

  // 1) Update order status → paid
  const patchRes = await fetch(`${supabaseUrl}/rest/v1/gh_orders?id=eq.${orderId}`, {
    method: 'PATCH',
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      status: 'paid',
      stripe_payment_intent: session.payment_intent,
      paid_at: new Date().toISOString(),
    }),
  });

  if (!patchRes.ok) {
    const err = await patchRes.text();
    console.error('Supabase update failed:', err);
    return new Response('db update failed', { status: 500 });
  }

  // 2) Log activity
  await fetch(`${supabaseUrl}/rest/v1/gh_activity`, {
    method: 'POST',
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      order_id: orderId,
      action: 'payment_received',
      actor: 'stripe_webhook',
      details: { session_id: session.id, payment_intent: session.payment_intent },
    }),
  });

  // 3) Build notification message
  const orderShort = orderId.substring(0, 8);
  const message =
    `${PLAN_EMOJI[plan] || '🆕'} NEW ORDER #${orderShort}\n` +
    `\n` +
    `Plan: ${PLAN_DISPLAY[plan] || plan}\n` +
    `Amount: $${(session.amount_total / 100).toFixed(2)} USD\n` +
    `\n` +
    `TradingView: @${tv}\n` +
    `Telegram: @${telegram}\n` +
    `\n` +
    `Order ID: ${orderId}\n` +
    `Status: ⏳ Paid (awaiting access grant)\n` +
    `\n` +
    `→ Grant Trading Mastery access to @${tv} on TradingView`;

  // 4) Send to Telegram channel with action buttons
  if (channelId) {
    const channelRes = await fetch(`https://api.telegram.org/bot${ghBotToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: channelId,
        text: message,
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Confirm', callback_data: `gh:confirm:${orderId}` },
              { text: '❌ Cancel', callback_data: `gh:cancel:${orderId}` },
            ],
            [{ text: '📋 Order Details', callback_data: `gh:details:${orderId}` }],
          ],
        },
      }),
    });

    if (channelRes.ok) {
      const channelData = await channelRes.json();
      const msgId = channelData.result?.message_id;
      if (msgId) {
        await fetch(`${supabaseUrl}/rest/v1/gh_orders?id=eq.${orderId}`, {
          method: 'PATCH',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ group_msg_id: msgId }),
        });
      }
    }
  }

  // 5) DM owner (private chat)
  if (ownerChatId) {
    const ownerRes = await fetch(`https://api.telegram.org/bot${ghBotToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: ownerChatId,
        text: '🔔 ' + message,
      }),
    });

    if (ownerRes.ok) {
      const ownerData = await ownerRes.json();
      const ownerMsgId = ownerData.result?.message_id;
      if (ownerMsgId) {
        await fetch(`${supabaseUrl}/rest/v1/gh_orders?id=eq.${orderId}`, {
          method: 'PATCH',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ owner_msg_id: ownerMsgId }),
        });
      }
    }
  }

  return new Response('ok', { status: 200 });
}
