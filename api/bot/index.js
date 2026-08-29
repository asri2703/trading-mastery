// Gold Hunter — Bot Callback Handler (Vercel Edge Function)
// File: api/bot/index.js → route: /api/bot
// Handles button clicks from channel @ordermasterylab
// Patterns:
//   gh:confirm:<order_id> → mark order as processed, DM client tutorial
//   gh:cancel:<order_id>  → mark order as cancelled
//   gh:details:<order_id> → show order details

export const config = { runtime: 'edge' };

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

// Client tutorial - steps to add Trading Mastery indicator
const TUTORIAL_TEXT = (tvUsername, planName) =>
  `🎉 *Welcome to Trading Mastery!*\n\n` +
  `Your ${planName} is now active. Here's how to add the Trading Mastery indicator to your TradingView chart:\n\n` +
  `*Step 1*: Open TradingView\n` +
  `https://www.tradingview.com/\n\n` +
  `*Step 2*: Search for "TRADING MASTERY" in Indicators (top toolbar, fx icon)\n\n` +
  `*Step 3*: When you find the indicator, click the star ⭐ to add to favorites\n\n` +
  `*Step 4*: The indicator will appear on your chart automatically\n\n` +
  `*Step 5*: Pick your instrument (XAUUSD, BTCUSD, US30, etc.) and timeframe\n` +
  `• Scalping → M15\n` +
  `• Intraday → H1\n\n` +
  `*Step 6*: Wait for signal — entry, SL, TP1, TP2 will appear on chart with dashboard confirmations\n\n` +
  `*Signal Score*: Only enter if score is 5/7.0 or higher.\n\n` +
  `📊 Watch live signals in @masterysignalcommunity\n\n` +
  `Need help? Reply here.`;

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 });
  }

  let body;
  try {
    body = await req.json();
  } catch (e) {
    return new Response('bad json', { status: 400 });
  }

  const callbackQuery = body.callback_query;
  if (!callbackQuery) {
    return new Response('ok', { status: 200 });
  }

  const callbackId = callbackQuery.id;
  const data = callbackQuery.data || '';
  const from = callbackQuery.from || {};
  const message = callbackQuery.message || {};
  const chatId = message.chat?.id;

  const ghBotToken = process.env.GH_BOT_TOKEN;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!ghBotToken || !supabaseUrl || !supabaseKey) {
    return new Response('server misconfigured', { status: 500 });
  }

  // Parse action
  const parts = data.split(':');
  const action = parts[0]; // 'gh'
  const subAction = parts[1]; // 'confirm' | 'cancel' | 'details'
  const orderId = parts.slice(2).join(':'); // UUID might have colons but it's fine

  if (action !== 'gh' || !orderId) {
    // Answer callback to remove loading indicator
    await fetch(`https://api.telegram.org/bot${ghBotToken}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callbackId, text: 'Unknown action' }),
    });
    return new Response('ok', { status: 200 });
  }

  // Fetch order from Supabase
  const orderRes = await fetch(
    `${supabaseUrl}/rest/v1/gh_orders?id=eq.${orderId}&select=*`,
    {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
      },
    }
  );

  if (!orderRes.ok) {
    await fetch(`https://api.telegram.org/bot${ghBotToken}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callbackId, text: 'Order not found', show_alert: true }),
    });
    return new Response('order not found', { status: 404 });
  }

  const [order] = await orderRes.json();
  if (!order) {
    await fetch(`https://api.telegram.org/bot${ghBotToken}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callbackId, text: 'Order not found', show_alert: true }),
    });
    return new Response('order not found', { status: 404 });
  }

  const orderShort = orderId.substring(0, 8);
  const planEmoji = PLAN_EMOJI[order.plan] || '📦';
  const planDisplay = PLAN_DISPLAY[order.plan] || order.plan;

  // Handle each action
  if (subAction === 'details') {
    // Just show details as alert
    const detailText =
      `📋 *Order Details*\n\n` +
      `ID: #${orderShort}\n` +
      `Plan: ${planDisplay}\n` +
      `Amount: $${order.amount_usd}\n` +
      `TV: @${order.tv_username}\n` +
      `Telegram: @${order.telegram_username}\n` +
      `Status: ${order.status}\n` +
      `Created: ${new Date(order.created_at).toLocaleString('en-US', { timeZone: 'Asia/Kuala_Lumpur' })}\n` +
      (order.paid_at ? `Paid: ${new Date(order.paid_at).toLocaleString('en-US', { timeZone: 'Asia/Kuala_Lumpur' })}\n` : '') +
      (order.processed_at ? `Processed: ${new Date(order.processed_at).toLocaleString('en-US', { timeZone: 'Asia/Kuala_Lumpur' })}\n` : '');

    await fetch(`https://api.telegram.org/bot${ghBotToken}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callbackId, text: detailText, show_alert: true }),
    });
    return new Response('ok', { status: 200 });
  }

  if (subAction === 'confirm') {
    // Mark as processed, grant access, DM client
    const now = new Date().toISOString();

    // Update order status
    await fetch(`${supabaseUrl}/rest/v1/gh_orders?id=eq.${orderId}`, {
      method: 'PATCH',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'processed', processed_at: now }),
    });

    // Calculate expires_at
    const durationDays = { flex: 30, plus: 90, pro: 180 }[order.plan] || 30;
    const expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString();

    // Create gh_access entry (grant tracking)
    const accessRes = await fetch(`${supabaseUrl}/rest/v1/gh_access`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({
        order_id: orderId,
        telegram_username: order.telegram_username,
        tv_username: order.tv_username,
        plan: order.plan,
        granted_at: now,
        expires_at: expiresAt,
        active: true,
        notes: `Granted by @${from.username || from.id} via button click`,
      }),
    });

    // Log activity
    await fetch(`${supabaseUrl}/rest/v1/gh_activity`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        order_id: orderId,
        action: 'order_confirmed',
        actor: `telegram:${from.username || from.id}`,
        details: { message_id: message.message_id, expires_at: expiresAt },
      }),
    });

    // DM client with tutorial
    const clientText = TUTORIAL_TEXT(order.tv_username, planDisplay);
    const clientRes = await fetch(`https://api.telegram.org/bot${ghBotToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: `@${order.telegram_username}`,
        text: clientText,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      }),
    });

    let clientMsgId = null;
    if (clientRes.ok) {
      const clientData = await clientRes.json();
      clientMsgId = clientData.result?.message_id;
    }

    // Save client_msg_id
    if (clientMsgId) {
      await fetch(`${supabaseUrl}/rest/v1/gh_orders?id=eq.${orderId}`, {
        method: 'PATCH',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ client_msg_id: clientMsgId }),
      });
    }

    // Edit original channel message to remove buttons, show confirmed
    if (chatId && message.message_id) {
      const confirmedText =
        `${planEmoji} *ORDER #${orderShort} CONFIRMED* ✅\n\n` +
        `Plan: ${planDisplay}\n` +
        `TV: @${order.tv_username}\n` +
        `Telegram: @${order.telegram_username}\n` +
        `Granted: ${new Date(now).toLocaleString('en-US', { timeZone: 'Asia/Kuala_Lumpur' })}\n` +
        `Expires: ${new Date(expiresAt).toLocaleString('en-US', { timeZone: 'Asia/Kuala_Lumpur' })}\n\n` +
        `Client notified.`;

      await fetch(`https://api.telegram.org/bot${ghBotToken}/editMessageText`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          message_id: message.message_id,
          text: confirmedText,
          parse_mode: 'Markdown',
        }),
      });
    }

    // Answer callback
    await fetch(`https://api.telegram.org/bot${ghBotToken}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callbackId, text: '✅ Confirmed! Client notified.' }),
    });

    return new Response('ok', { status: 200 });
  }

  if (subAction === 'cancel') {
    // Mark as cancelled
    const now = new Date().toISOString();
    await fetch(`${supabaseUrl}/rest/v1/gh_orders?id=eq.${orderId}`, {
      method: 'PATCH',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        status: 'cancelled',
        cancelled_at: now,
        cancel_reason: `Cancelled by @${from.username || from.id}`,
      }),
    });

    // Log activity
    await fetch(`${supabaseUrl}/rest/v1/gh_activity`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        order_id: orderId,
        action: 'order_cancelled',
        actor: `telegram:${from.username || from.id}`,
        details: { message_id: message.message_id },
      }),
    });

    // Edit original message
    if (chatId && message.message_id) {
      const cancelledText =
        `${planEmoji} *ORDER #${orderShort} CANCELLED* ❌\n\n` +
        `Plan: ${planDisplay}\n` +
        `TV: @${order.tv_username}\n` +
        `Telegram: @${order.telegram_username}\n` +
        `Cancelled: ${new Date(now).toLocaleString('en-US', { timeZone: 'Asia/Kuala_Lumpur' })}\n` +
        `By: @${from.username || from.id}`;

      await fetch(`https://api.telegram.org/bot${ghBotToken}/editMessageText`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          message_id: message.message_id,
          text: cancelledText,
          parse_mode: 'Markdown',
        }),
      });
    }

    // Answer callback
    await fetch(`https://api.telegram.org/bot${ghBotToken}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callbackId, text: '❌ Order cancelled.' }),
    });

    return new Response('ok', { status: 200 });
  }

  // Unknown sub-action
  await fetch(`https://api.telegram.org/bot${ghBotToken}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackId, text: 'Unknown action' }),
  });

  return new Response('ok', { status: 200 });
}
