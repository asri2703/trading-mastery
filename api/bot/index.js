// Gold Hunter — Bot Handler (Vercel Edge Function)
// File: api/bot/index.js → route: /api/bot
// Handles:
//   1) Button clicks from channel @ordermasterylab
//      gh:confirm:<order_id> → mark processed, DM client receipt+install
//      gh:cancel:<order_id>  → mark cancelled
//      gh:details:<order_id> → show order details
//   2) DM messages to bot → auto-reply with knowledge base
//      /start, /menu, /install, free text → FAQ keyword match
//      Internal callbacks: install, menu, order_status, contact_support

export const config = { runtime: 'edge' };

// === KNOWLEDGE BASE FOR DM AUTO-REPLY ===
const KB_WELCOME = {
  en: {
    text:
      `👋 *Welcome to Gold Hunter Support!*\n\n` +
      `I'm here to help you with your *Trading Mastery* indicator.\n\n` +
      `*What can I help you with?*`,
    buttons: [
      [{ text: '📦 How to install indicator', callback_data: 'kb_install' }],
      [{ text: '🧾 My order status', callback_data: 'kb_order_status' }],
      [{ text: '💬 Contact human support', callback_data: 'kb_contact' }],
      [{ text: '🧾 Manage Invoices', url: 'https://gh-landing-bay.vercel.app/?portal=open' }],
    ],
  },
};

const KB_MENU = {
  en: {
    text: `📋 *MAIN MENU*\n\nHow can I help you today?`,
    buttons: [
      [{ text: '📦 How to install indicator', callback_data: 'kb_install' }],
      [{ text: '🧾 My order status', callback_data: 'kb_order_status' }],
      [{ text: '💬 Contact human support', callback_data: 'kb_contact' }],
    ],
  },
};

const KB_INSTALL = {
  en: {
    text:
      `*📦 HOW TO INSTALL TRADING MASTERY*\n\n` +
      `*Step 1* — Open TradingView\n` +
      `👉 https://www.tradingview.com/\n\n` +
      `*Step 2* — Add the indicator (Invite-only)\n` +
      `1. Click the *fx (Indicators)* button at top toolbar\n` +
      `2. Click *"Invite-only scripts"* tab\n` +
      `3. Search for *"Trading Mastery"* or *"TRADING-MASTERY"*\n` +
      `4. Click to add to chart\n\n` +
      `*Step 3* — Choose instrument & timeframe\n` +
      `• XAUUSD / BTCUSD / US30 / FX pairs\n` +
      `• Scalping → M15\n` +
      `• Intraday → H1\n` +
      `• Swing → H4\n\n` +
      `*Step 4* — Wait for signal\n` +
      `Trade only when score ≥ *5/7.0*\n\n` +
      `*Signal Score:*\n` +
      `0-2 = No trade\n` +
      `3-4 = Wait\n` +
      `5+ = Valid entry (with confirmation)\n\n` +
      `*📖 Full tutorial with screenshots:*\n` +
      `👉 ${TUTORIAL_URL}\n\n` +
      `Need more help? Type your question here or use the menu.`,
    buttons: [
      [
        { text: '📖 Full Tutorial', url: TUTORIAL_URL },
      ],
      [{ text: '🔙 Back to menu', callback_data: 'kb_menu' }],
    ],
  },
};

const KB_ORDER_STATUS = {
  en: {
    text:
      `*🧾 ORDER STATUS*\n\n` +
      `Your order is automatically tracked by our system.\n\n` +
      `*What to expect:*\n` +
      `✅ After payment → confirmation webhook fires\n` +
      `✅ Admin reviews order → clicks Confirm\n` +
      `✅ You receive receipt + install instructions in DM\n` +
      `✅ Access granted within minutes\n\n` +
      `*If you haven't received your access:*\n` +
      `1. Make sure you have started this bot (/start)\n` +
      `2. Wait 1-5 minutes after payment\n` +
      `3. Check your DM inbox\n\n` +
      `Still stuck? Click *Contact Support* below.`,
    buttons: [
      [{ text: '💬 Contact Support', callback_data: 'kb_contact' }],
      [{ text: '🔙 Back to menu', callback_data: 'kb_menu' }],
    ],
  },
};

const KB_CONTACT = {
  en: {
    text:
      `*💬 CONTACT HUMAN SUPPORT*\n\n` +
      `Our support team will assist you.\n\n` +
      `*Response time:* 1-24 hours\n` +
      `*Languages:* English, Bahasa Melayu\n\n` +
      `*Please include in your message:*\n` +
      `• Order ID (if applicable)\n` +
      `• TradingView username\n` +
      `• Issue description\n` +
      `• Screenshots (if any issue)\n\n` +
      `Type your message below and our team will respond.`,
    buttons: [[{ text: '🔙 Back to menu', callback_data: 'kb_menu' }]],
  },
};

const KB_FALLBACK = {
  en: {
    text:
      `🤔 *I didn't understand that.*\n\n` +
      `Try one of these options:`,
    buttons: [
      [{ text: '📦 How to install indicator', callback_data: 'kb_install' }],
      [{ text: '🧾 My order status', callback_data: 'kb_order_status' }],
      [{ text: '💬 Contact human support', callback_data: 'kb_contact' }],
      [{ text: '📋 Main menu', callback_data: 'kb_menu' }],
    ],
  },
};

// FAQ keyword matching for free text
function matchFaq(text) {
  if (!text) return null;
  const t = text.toLowerCase();
  // Higher priority patterns first
  const rules = [
    { keys: ['install', 'setup', 'add', 'how to', 'indicator', 'pine'], response: 'install' },
    { keys: ['status', 'order', 'paid', 'received', 'where', 'tracking', 'access'], response: 'order_status' },
    { keys: ['support', 'help', 'human', 'agent', 'contact', 'issue', 'problem', 'bug', 'error'], response: 'contact' },
    { keys: ['menu', 'home', 'start', 'main'], response: 'menu' },
    { keys: ['refund', 'cancel', 'money back'], response: 'contact' },
    { keys: ['price', 'cost', 'plan', 'pricing'], response: 'contact' },
  ];
  for (const r of rules) {
    for (const k of r.keys) {
      if (t.includes(k)) return r.response;
    }
  }
  return null;
}

const KB_MAP = {
  kb_install: KB_INSTALL,
  kb_menu: KB_MENU,
  kb_order_status: KB_ORDER_STATUS,
  kb_contact: KB_CONTACT,
};

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
const TUTORIAL_URL = 'https://telegra.ph/How-to-Install-Trading-Mastery-Indicator--Quick-Tutorial-08-29';

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
  `*💬 SUPPORT*\n` +
  `Got questions? DM @thegoldhunterbot — auto-reply will assist with installation.\n\n` +
  `Or join our signals community for live trades:\n` +
  `👉 https://t.me/masterysignalcommunity\n\n` +
  `*📖 FULL TUTORIAL*\n` +
  `Step-by-step guide with screenshots:\n` +
  `👉 ${TUTORIAL_URL}\n\n` +
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
    `Processed: ${formattedProcessed}\n` +
    (order.email ? `Stripe Receipt: ${order.email}\n` : `Stripe Receipt: (no email provided)\n`) +
    `\n` +
    `*👤 CUSTOMER*\n` +
    `TradingView: @${order.tv_username}\n` +
    `Telegram: @${order.telegram_username}\n\n` +
    `*📅 ACCESS*\n` +
    `Activated: ${formattedProcessed}\n` +
    `Expires: ${formattedExpires}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `Thank you for choosing Trading Mastery!\n` +
    (order.email
      ? `A Stripe receipt was sent to ${order.email} instantly.\n`
      : `Tip: Add your email next time to get instant Stripe receipts.\n`) +
    `Questions? DM @thegoldhunterbot`;
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

  const ghBotToken = process.env.GH_BOT_TOKEN;
  const ownerChatId = process.env.OWNER_CHAT_ID;

  // ===== ROUTE 1: DM MESSAGE → KNOWLEDGE BASE / SUPPORT FORWARD =====
  const dmMessage = body.message;
  if (dmMessage) {
    const chatId = dmMessage.chat?.id;
    const text = (dmMessage.text || '').trim();
    if (chatId && !String(chatId).startsWith('-')) {
      // Inline knowledge base handling (no separate function)
      let response = null;
      let enableSupportMode = false;
      let disableSupportMode = false;

      // Check if in support mode → forward to admin
      let inSupportMode = false;
      try {
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (supabaseUrl && supabaseKey) {
          const modeRes = await fetch(
            `${supabaseUrl}/rest/v1/gh_user_state?chat_id=eq.${chatId}&select=support_mode`,
            {
              headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
              },
            }
          );
          if (modeRes.ok) {
            const data = await modeRes.json();
            inSupportMode = Array.isArray(data) && data.length > 0 && data[0].support_mode === true;
          }
        }
      } catch (e) {
        console.error('getSupportMode error:', e.message);
      }

      // If in support mode + has text → forward to admin (UNLESS exit command)
      const isExitCommand = text === '/menu' || text === '/help' || text === '/exit' || text.startsWith('/menu@') || text.startsWith('/help@');
      if (inSupportMode && text && !isExitCommand) {
        const username = dmMessage.from?.username || dmMessage.from?.first_name || 'Unknown';
        const adminMsg =
          `📨 *Support Request*\n\n` +
          `From: @${username} (ID: ${chatId})\n` +
          `Time: ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Kuala_Lumpur' })}\n\n` +
          `*Message:*\n${text}`;
        try {
          await fetch(`https://api.telegram.org/bot${ghBotToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: ownerChatId, text: adminMsg, parse_mode: 'Markdown' }),
          });
          await fetch(`https://api.telegram.org/bot${ghBotToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: `✅ *Message sent to support*\n\nYour message has been forwarded to @asripapa. Reply within 1-24 hours.\n\n*Type /menu to exit support mode.*`,
              parse_mode: 'Markdown',
              reply_markup: { inline_keyboard: [[{ text: '🚪 Exit Support Mode', callback_data: 'kb_menu' }]] },
            }),
          });
        } catch (e) {
          console.error('Forward error:', e.message);
        }
        return new Response('ok', { status: 200 });
      }

      // Standard commands
      if (text === '/start' || text.startsWith('/start@')) {
        response = KB_WELCOME.en;
      } else if (text === '/menu' || text === '/help' || text.startsWith('/menu@') || text.startsWith('/help@')) {
        disableSupportMode = true;
        response = KB_MENU.en;
      } else if (text === '/install' || text.startsWith('/install@')) {
        response = KB_INSTALL.en;
      } else if (text === '/order' || text === '/status' || text.startsWith('/order@')) {
        response = KB_ORDER_STATUS.en;
      } else if (text === '/contact' || text === '/support' || text.startsWith('/contact@')) {
        enableSupportMode = true;
        response = KB_CONTACT.en;
      } else if (text) {
        const match = matchFaq(text);
        if (match === 'install') response = KB_INSTALL.en;
        else if (match === 'order_status') response = KB_ORDER_STATUS.en;
        else if (match === 'contact') {
          enableSupportMode = true;
          response = KB_CONTACT.en;
        } else if (match === 'menu') response = KB_MENU.en;
        else response = KB_FALLBACK.en;
      } else {
        response = KB_MENU.en;
      }

      // Update support mode if needed (also upserts telegram_username)
      if (enableSupportMode || disableSupportMode || dmMessage.from?.username) {
        try {
          const supabaseUrl = process.env.SUPABASE_URL;
          const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
          if (supabaseUrl && supabaseKey) {
            const tgUsername = dmMessage.from?.username
              ? String(dmMessage.from.username).toLowerCase()
              : null;

            // First check if record exists
            const checkRes = await fetch(
              `${supabaseUrl}/rest/v1/gh_user_state?chat_id=eq.${chatId}&select=chat_id`,
              {
                headers: {
                  'apikey': supabaseKey,
                  'Authorization': `Bearer ${supabaseKey}`,
                },
              }
            );
            const existing = await checkRes.json();
            if (Array.isArray(existing) && existing.length > 0) {
              // Update existing record
              await fetch(`${supabaseUrl}/rest/v1/gh_user_state?chat_id=eq.${chatId}`, {
                method: 'PATCH',
                headers: {
                  'apikey': supabaseKey,
                  'Authorization': `Bearer ${supabaseKey}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  support_mode: enableSupportMode || false,
                  telegram_username: tgUsername,
                  updated_at: new Date().toISOString(),
                }),
              });
            } else {
              // Insert new record
              await fetch(`${supabaseUrl}/rest/v1/gh_user_state`, {
                method: 'POST',
                headers: {
                  'apikey': supabaseKey,
                  'Authorization': `Bearer ${supabaseKey}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  chat_id: String(chatId),
                  support_mode: enableSupportMode || false,
                  telegram_username: tgUsername,
                  updated_at: new Date().toISOString(),
                }),
              });
            }
          }
        } catch (e) {
          console.error('setSupportMode error:', e.message);
        }
      }

      if (response) {
        await fetch(`https://api.telegram.org/bot${ghBotToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: response.text,
            parse_mode: 'Markdown',
            disable_web_page_preview: true,
            reply_markup: response.buttons ? { inline_keyboard: response.buttons } : undefined,
          }),
        });
      }
    }
    return new Response('ok', { status: 200 });
  }
// When user clicks "Contact Support" we put them in "support mode"
// Next text message they send will be forwarded to admin @asripapa
const SUPPORT_MODE_FILE = '/tmp/gh_bot_support_mode.json'; // not used in edge; use Supabase instead

// We use a simple KV via gh_user_state Supabase table — but since we want zero infra,
// we use a small JSON store in Vercel KV / Upstash or fallback to local cache.
// For now: use a global Map persisted via a Supabase key-value table.
// Simpler: track in Supabase subscribers table under telegram_chat_id.

// Per-user support mode (in-memory only for now; Supabase too much for this)
// Use Supabase to persist state
const setSupportMode = async (chatId, on) => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) return;
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/gh_user_state`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        chat_id: String(chatId),
        support_mode: on,
        updated_at: new Date().toISOString(),
      }),
    });
    if (!res.ok) {
      console.error('setSupportMode error:', res.status, await res.text());
    }
  } catch (e) {
    console.error('setSupportMode exception:', e.message);
  }
};

const getSupportMode = async (chatId) => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) return false;
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/gh_user_state?chat_id=eq.${chatId}&select=support_mode`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
      }
    );
    if (!res.ok) return false;
    const data = await res.json();
    return Array.isArray(data) && data.length > 0 && data[0].support_mode === true;
  } catch (e) {
    console.error('getSupportMode exception:', e.message);
    return false;
  }
};

// Handle DM messages
async function handleDM(dmMessage) {
  const chatId = dmMessage.chat?.id;
  const text = (dmMessage.text || '').trim();
  if (!chatId || String(chatId).startsWith('-')) {
    return { skip: true };
  }

  // Check if user is in support mode (forward to admin)
  const inSupportMode = await getSupportMode(chatId);

  if (inSupportMode && text) {
    // Forward message to admin @asripapa
    const username = dmMessage.from?.username || dmMessage.from?.first_name || 'Unknown';
    const adminMsg =
      `📨 *Support Request*\n\n` +
      `From: @${username} (ID: ${chatId})\n` +
      `Time: ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Kuala_Lumpur' })}\n\n` +
      `*Message:*\n${text}`;

    // Send to admin
    await fetch(`https://api.telegram.org/bot${ghBotToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: ownerChatId,
        text: adminMsg,
        parse_mode: 'Markdown',
      }),
    });

    // Acknowledge to user
    const ackText =
      `✅ *Message sent to support*\n\n` +
      `Your message has been forwarded to @asripapa. ` +
      `You'll get a reply here within 1-24 hours.\n\n` +
      `*Type anything else to send another message.*\n` +
      `*Type /menu to exit support mode.*`;
    await fetch(`https://api.telegram.org/bot${ghBotToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: ackText,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[{ text: '🚪 Exit Support Mode', callback_data: 'kb_menu' }]],
        },
      }),
    });
    return { skip: true };
  }

  // Exit support mode command
  if (text === '/menu' || text === '/exit') {
    await setSupportMode(chatId, false);
  }

  let response = null;
  // ... [rest of command handling]

  // Commands
  if (text === '/start' || text.startsWith('/start@')) {
    response = KB_WELCOME.en;
  } else if (text === '/menu' || text === '/help' || text.startsWith('/menu@') || text.startsWith('/help@')) {
    await setSupportMode(chatId, false);
    response = KB_MENU.en;
  } else if (text === '/install' || text.startsWith('/install@')) {
    response = KB_INSTALL.en;
  } else if (text === '/order' || text === '/status' || text.startsWith('/order@')) {
    response = KB_ORDER_STATUS.en;
  } else if (text === '/contact' || text === '/support' || text.startsWith('/contact@')) {
    // Enable support mode
    await setSupportMode(chatId, true);
    response = KB_CONTACT.en;
  } else if (text) {
    // FAQ keyword match
    const match = matchFaq(text);
    if (match === 'install') response = KB_INSTALL.en;
    else if (match === 'order_status') response = KB_ORDER_STATUS.en;
    else if (match === 'contact') {
      await setSupportMode(chatId, true);
      response = KB_CONTACT.en;
    }
    else if (match === 'menu') response = KB_MENU.en;
    else response = KB_FALLBACK.en;
  } else {
    // No text (e.g., sticker, photo) → show menu
    response = KB_MENU.en;
  }

  if (response) {
    await fetch(`https://api.telegram.org/bot${ghBotToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: response.text,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
        reply_markup: response.buttons ? { inline_keyboard: response.buttons } : undefined,
      }),
    });
  }
  return { skip: true };
}

  // ===== ROUTE 2: CALLBACK QUERY =====
  const callbackQuery = body.callback_query;
  if (!callbackQuery) {
    return new Response('ok', { status: 200 });
  }

  // Route knowledge base callbacks (from DM menu buttons)
  const data = callbackQuery.data || '';
  console.log('[KB-CALLBACK]', { data, from: callbackQuery.from?.username });
  if (data.startsWith('kb_')) {
    const cbId = callbackQuery.id;
    // KB sections are { en: { text, buttons } } — extract .en
    const kbSection = KB_MAP[data];
    const kbResp = (kbSection && kbSection.en) || KB_MENU.en;
    const cbChatId = callbackQuery.message?.chat?.id;
    console.log('[KB-CALLBACK] responding', { cbChatId, kbResp_text_length: kbResp.text?.length });

    if (cbId) {
      await fetch(`https://api.telegram.org/bot${ghBotToken}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_query_id: cbId }),
      });
    }
    if (cbChatId && kbResp && kbResp.text) {
      const msgPayload = {
        chat_id: cbChatId,
        text: kbResp.text,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      };
      if (kbResp.buttons) {
        msgPayload.reply_markup = { inline_keyboard: kbResp.buttons };
      }
      const sendRes = await fetch(`https://api.telegram.org/bot${ghBotToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(msgPayload),
      });
      const sendData = await sendRes.json();
      console.log('[KB-CALLBACK] sendMessage result', { ok: sendRes.ok, description: sendData.description, msg_id: sendData.result?.message_id });
    } else {
      console.log('[KB-CALLBACK] skip send', { cbChatId, hasResp: !!kbResp, hasText: !!(kbResp && kbResp.text) });
    }
    return new Response('ok', { status: 200 });
  }

  // Order management callbacks (gh:confirm, gh:cancel, gh:details)
  if (!data.startsWith('gh:')) {
    const cbId = callbackQuery.id;
    if (cbId) {
      await fetch(`https://api.telegram.org/bot${ghBotToken}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_query_id: cbId, text: 'Unknown action' }),
      });
    }
    return new Response('ok', { status: 200 });
  }

  // Extract common vars for order callbacks
  const callbackId = callbackQuery.id;
  const from = callbackQuery.from || {};
  const message = callbackQuery.message || {};
  const chatId = message.chat?.id;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // Parse action
  const parts = data.split(':');
  const subAction = parts[1]; // 'confirm' | 'cancel' | 'details'
  const orderId = parts.slice(2).join(':');

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
