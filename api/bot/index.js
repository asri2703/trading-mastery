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

// Install instructions for TradingView invite-only access
const INSTALL_INSTRUCTIONS = (tvUsername, planName, planDuration) =>
  `🎉 *Welcome to Trading Mastery!*\n\n` +
  `Your ${planName} is now ACTIVE (${planDuration}).\n\n` +
  `━━━━━━━━━━━━━━━━━━━━\n\n` +
  `*📦 WHAT YOU GET*\n\n` +
  `✅ Trading Mastery indicator (invite-only access)\n` +
  `✅ Entry, SL, TP1, TP2 auto-display\n` +
  `✅ Signal Score 0-7 (only trade ≥5/7.0)\n` +
  `✅ Multi-timeframe support\n` +
  `✅ All instruments (XAUUSD, BTCUSD, US30, FX, etc.)\n\n` +
  `━━━━━━━━━━━━━━━━━━━━\n\n` +
  `*🔓 HOW TO ADD TO TRADINGVIEW*\n\n` +
  `*Step 1 — Your TradingView username*\n` +
  `Username *@${tvUsername}* has been added to our invite-only Pine Script list.\n\n` +
  `*Step 2 — Open TradingView*\n` +
  `👉 https://www.tradingview.com/\n\n` +
  `*Step 3 — Add the indicator*\n` +
  `1. Click the *fx (Indicators)* button at top toolbar\n` +
  `2. Click *"Invite-only scripts"* tab\n` +
  `3. Search for *"Trading Mastery"* or *"TRADING-MASTERY"*\n` +
  `4. Click the indicator to add to your chart\n\n` +
  `*Step 4 — Pick instrument & timeframe*\n` +
  `• XAUUSD / BTCUSD / US30 / FX pairs\n` +
  `• Scalping → M15 | Intraday → H1 | Swing → H4\n\n` +
  `*Step 5 — Wait for signal*\n` +
  `When dashboard confirms *score ≥5/7.0*, follow:\n` +
  `• *Entry* — open position\n` +
  `• *SL* — set stop loss\n` +
  `• *TP1* — close 50%\n` +
  `• *TP2* — close remaining\n\n` +
  `━━━━━━━━━━━━━━━━━━━━\n\n` +
  `*📊 WATCH LIVE SIGNALS*\n` +
  `Join our Mastery Signal community:\n` +
  `👉 https://t.me/masterysignalcommunity\n\n` +
  `*💬 SUPPORT*\n` +
  `Reply here or DM @masterysignalbot for any issues.\n\n` +
  `Happy trading! 🚀`;

// Generate structured receipt as text
const RECEIPT_TEXT = (order, planDisplay, planDuration, processedAt, expiresAt) => {
  const createdAt = new Date(order.created_at).toLocaleString('en-US', { timeZone: 'Asia/Kuala_Lumpur' });
  const paidAt = order.paid_at ? new Date(order.paid_at).toLocaleString('en-US', { timeZone: 'Asia/Kuala_Lumpur' }) : 'N/A';
  const formattedProcessed = new Date(processedAt).toLocaleString('en-US', { timeZone: 'Asia/Kuala_Lumpur' });
  const formattedExpires = new Date(expiresAt).toLocaleString('en-US', { timeZone: 'Asia/Kuala_Lumpur' });
  const orderShort = order.id.substring(0, 8).toUpperCase();

  return `🧾 *RECEIPT — TRADING MASTERY*\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `Order ID: #${orderShort}\n` +
    `Status: ✅ PAID & ACTIVATED\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `*📦 PLAN*\n` +
    `${planDisplay}\n` +
    `Duration: ${planDuration}\n\n` +
    `*💰 PAYMENT*\n` +
    `Amount: $${order.amount_usd} USD\n` +
    `Order Date: ${createdAt}\n` +
    `Paid: ${paidAt}\n` +
    `Processed: ${formattedProcessed}\n\n` +
    `*👤 CUSTOMER*\n` +
    `TradingView: @${order.tv_username}\n` +
    `Telegram: @${order.telegram_username}\n\n` +
    `*📅 ACCESS*\n` +
    `Activated: ${formattedProcessed}\n` +
    `Expires: ${formattedExpires}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `Thank you for choosing Trading Mastery!\n` +
    `Questions? DM @masterysignalbot`;
};

const TUTORIAL_TEXT = INSTALL_INSTRUCTIONS;

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

    // DM client: 1) Receipt 2) Install instructions
    const planDuration = durationDays + ' days';
    const receiptText = RECEIPT_TEXT(order, planDisplay, planDuration, now, expiresAt);
    const installText = INSTALL_INSTRUCTIONS(order.tv_username, planDisplay, planDuration);

    let clientMsgId = null;

    // Send receipt first
    const receiptRes = await fetch(`https://api.telegram.org/bot${ghBotToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: `@${order.telegram_username}`,
        text: receiptText,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      }),
    });

    if (receiptRes.ok) {
      const receiptData = await receiptRes.json();
      clientMsgId = receiptData.result?.message_id;
    }

    // Small delay then send install instructions
    await new Promise(r => setTimeout(r, 500));

    const installRes = await fetch(`https://api.telegram.org/bot${ghBotToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: `@${order.telegram_username}`,
        text: installText,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      }),
    });

    let installMsgId = null;
    let clientDMSuccess = false;
    if (installRes.ok) {
      const installData = await installRes.json();
      installMsgId = installData.result?.message_id;
      clientDMSuccess = true;
      if (!clientMsgId) clientMsgId = installMsgId;
    } else {
      // DM failed — notify owner so they can manually message client
      const errBody = await installRes.text();
      console.error(`Client DM failed for ${order.telegram_username}:`, errBody);
      if (process.env.OWNER_CHAT_ID) {
        await fetch(`https://api.telegram.org/bot${ghBotToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: process.env.OWNER_CHAT_ID,
            text: `⚠️ *Client DM Failed*\n\nOrder: #${orderShort}\nTV: @${order.tv_username}\nTelegram: @${order.telegram_username}\n\nUser has not started @thegoldhunterbot yet. Please:\n1. Confirm they @start-ed the bot\n2. Manually send them the install instructions\n\nError: ${errBody.substring(0, 200)}`,
            parse_mode: 'Markdown',
          }),
        });
      }
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
