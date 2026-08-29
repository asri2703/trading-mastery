// Gold Hunter Signal Auto-Post
// File: api/gh-signal/index.js → route: /api/gh-signal
//
// Purpose: Receive TradingView webhook alerts (Pine Script JSON) and auto-post
//          to Telegram channel @getfreegoldsignal using bot @thegoldhunterbot.
//
// Flow: TradingView indicator → webhook → this endpoint → Telegram channel
//
// Boss runs this on a SEPARATE TradingView account (not the masterysignal one).
// No chart screenshots — simple text-based signal post in GH style.
//
// Pine Script alert message format (JSON):
//   {
//     "secret": "your_shared_secret",
//     "signal": "TRADING MASTERY GAMMA BUY",
//     "direction": "BUY",
//     "pair": "XAUUSD",
//     "timeframe": "5",
//     "score": "6.5",
//     "entry": "4383.50",
//     "sl": "4365.00",
//     "tp1": "4395.00",
//     "tp2": "4410.00",
//     "tp3": "4425.00",
//     "close": "",     // for CLOSE events: "tp1" | "tp2" | "tp3" | "sl"
//     "pips": ""       // for CLOSE events: realized pips
//   }

const https = require('https');

// Telegram bot config (loaded from Vercel env vars)
const TG_BOT_TOKEN = process.env.GH_BOT_TOKEN;
const TG_CHANNEL_ID = process.env.GH_CHANNEL_ID; // -1004466635373 (Gold Hunter channel)

// Webhook secret — boss sets this in Pine Script alert AND Vercel env
const WEBHOOK_SECRET = process.env.GH_SIGNAL_SECRET || 'trading-mastery-2026';

// State dedup (avoid duplicate posts if TV retries)
const DEDUP_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const recentSignals = new Map(); // key: signal hash → {ts, msg_id}

// ============ Helper: Build signal caption (GH style) ============

function buildSignalCaption(sig) {
  const direction = (sig.direction || '').toUpperCase();
  const pair = sig.pair || 'XAUUSD';
  const tf = sig.timeframe || '';
  const score = parseFloat(sig.score) || 0;
  const entry = parseFloat(sig.entry) || 0;
  const sl = parseFloat(sig.sl) || 0;
  const tp1 = parseFloat(sig.tp1) || 0;
  const tp2 = parseFloat(sig.tp2) || 0;
  const tp3 = parseFloat(sig.tp3) || 0;
  const signalLabel = sig.signal || 'SIGNAL';

  const dirEmoji = direction === 'BUY' ? '🟢' : direction === 'SELL' ? '🔴' : '⚪';
  const pairEmoji = pair.includes('XAU') || pair.includes('GOLD') ? '🥇' : '📊';

  // Calculate pips and R:R
  let pipSize = 0.1; // XAUUSD default
  if (pair.includes('JPY')) pipSize = 0.01;
  else if (pair.includes('XAU') || pair.includes('GOLD')) pipSize = 0.1;
  else if (pair.includes('USD') && !pair.includes('XAU')) pipSize = 0.0001;

  const slPips = direction === 'BUY'
    ? Math.round((entry - sl) / pipSize)
    : Math.round((sl - entry) / pipSize);
  const tp1Pips = direction === 'BUY'
    ? Math.round((tp1 - entry) / pipSize)
    : Math.round((entry - tp1) / pipSize);
  const tp2Pips = direction === 'BUY'
    ? Math.round((tp2 - entry) / pipSize)
    : Math.round((entry - tp2) / pipSize);
  const tp3Pips = tp3 ? (direction === 'BUY'
    ? Math.round((tp3 - entry) / pipSize)
    : Math.round((entry - tp3) / pipSize)) : 0;

  const rr = slPips > 0 ? (tp2Pips / slPips).toFixed(1) : 'N/A';

  // Calculate P/L for 3 lot sizes (XAUUSD standard: 0.01, 0.10, 1.00)
  // 0.01 lot = $0.10/pip, 0.10 lot = $1.00/pip, 1.00 lot = $10.00/pip
  const tp2Usd01 = (tp2Pips * 0.10).toFixed(2);
  const tp2Usd10 = (tp2Pips * 1.00).toFixed(2);
  const tp2Usd100 = (tp2Pips * 10.00).toFixed(2);

  // Time formatting (MYT)
  const now = new Date();
  const mytTime = now.toLocaleString('en-MY', {
    timeZone: 'Asia/Kuala_Lumpur',
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  let cap = '';
  cap += `🥇 *GOLD HUNTER SIGNAL* 🚨\n\n`;
  cap += `${dirEmoji} *${direction} ${signalLabel.replace('TRADING MASTERY ', '')}*\n`;
  cap += `${pairEmoji} ${pair}${tf ? ` · M${tf}` : ''}\n`;
  if (score > 0) cap += `💯 Score: ${score.toFixed(1)}/7.0\n`;
  cap += `\n`;

  cap += `🎯 *Entry:* \`${entry.toFixed(2)}\`\n`;
  cap += `🟢 *TP1:* \`${tp1.toFixed(2)}\` (+${tp1Pips}p)\n`;
  cap += `🟢 *TP2:* \`${tp2.toFixed(2)}\` (+${tp2Pips}p)\n`;
  if (tp3) cap += `🟢 *TP3:* \`${tp3.toFixed(2)}\` (+${tp3Pips}p)\n`;
  cap += `🔴 *SL:* \`${sl.toFixed(2)}\` (-${slPips}p)\n`;
  cap += `\n`;
  cap += `📈 *R:R:* 1:${rr}\n`;
  cap += `⏰ ${mytTime} MYT\n`;
  cap += `\n`;

  // Profit panel (3 lot sizes)
  cap += `💰 *Expected Profit (TP2):*\n`;
  cap += `   • 0.01 lot: $${tp2Usd01}\n`;
  cap += `   • 0.10 lot: $${tp2Usd10}\n`;
  cap += `   • 1.00 lot: $${tp2Usd100}\n`;
  cap += `\n`;

  cap += `⚠️ _Trading involves risk. Trade with discipline._\n\n`;
  cap += `━━━━━━━━━━━━━━━━━━\n`;
  cap += `📱 Join channel: https://t.me/getfreegoldsignal\n`;
  cap += `🤖 Bot support: @thegoldhunterbot`;

  return cap;
}

// ============ Helper: Build close notification caption ============

function buildCloseCaption(sig) {
  const direction = (sig.direction || '').toUpperCase();
  const pair = sig.pair || 'XAUUSD';
  const close = (sig.close || '').toLowerCase();
  const pips = parseFloat(sig.pips) || 0;
  const entry = parseFloat(sig.entry) || 0;
  const closePrice = parseFloat(sig.close_price) || 0;

  const closeEmojis = {
    tp1: '🎯',
    tp2: '🎯',
    tp3: '🎯',
    sl: '🛑',
  };
  const closeLabels = {
    tp1: 'TP1 HIT ✅',
    tp2: 'TP2 HIT ✅',
    tp3: 'TP3 HIT ✅',
    sl: 'SL HIT ❌',
  };

  const emoji = closeEmojis[close] || '📊';
  const label = closeLabels[close] || close.toUpperCase();

  const dirEmoji = direction === 'BUY' ? '🟢' : '🔴';
  const pairEmoji = pair.includes('XAU') || pair.includes('GOLD') ? '🥇' : '📊';

  // USD for 3 lot sizes
  const usd01 = (pips * 0.10).toFixed(2);
  const usd10 = (pips * 1.00).toFixed(2);
  const usd100 = (pips * 10.00).toFixed(2);

  let cap = '';
  cap += `🥇 *GOLD HUNTER — ${label}*\n\n`;
  cap += `${dirEmoji} *${direction} ${pair}*\n`;
  cap += `${emoji} Closed at: \`${closePrice.toFixed(2)}\`\n`;
  cap += `Entry: \`${entry.toFixed(2)}\`\n`;
  cap += `Pips: *${pips >= 0 ? '+' : ''}${pips.toFixed(1)}p*\n\n`;

  if (pips > 0) {
    cap += `💰 *Profit:*\n`;
    cap += `   • 0.01 lot: $${usd01}\n`;
    cap += `   • 0.10 lot: $${usd10}\n`;
    cap += `   • 1.00 lot: $${usd100}\n\n`;
  }

  cap += `⚠️ _Past performance ≠ future results._\n\n`;
  cap += `━━━━━━━━━━━━━━━━━━\n`;
  cap += `📱 Join channel: https://t.me/getfreegoldsignal`;

  return cap;
}

// ============ Helper: Hash signal for dedup ============

function hashSignal(sig) {
  const raw = [
    sig.direction || '',
    sig.pair || '',
    sig.entry || '',
    sig.sl || '',
    sig.tp1 || '',
    sig.tp2 || '',
    sig.timeframe || '',
    sig.score || '',
    sig.close || '', // for close events
  ].join('|');
  return require('crypto').createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

// ============ Helper: Post to Telegram ============

async function postToTelegram(text) {
  if (!TG_BOT_TOKEN || !TG_CHANNEL_ID) {
    throw new Error('Missing TG_BOT_TOKEN or TG_CHANNEL_ID env vars');
  }

  const url = `https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`;
  const body = JSON.stringify({
    chat_id: TG_CHANNEL_ID,
    text: text,
    parse_mode: 'Markdown',
    disable_web_page_preview: true,
  });

  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.ok) {
            resolve(result.result);
          } else {
            reject(new Error(`Telegram API error: ${result.description}`));
          }
        } catch (e) {
          reject(new Error(`Failed to parse Telegram response: ${e.message}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ============ Main handler ============

module.exports = async (req, res) => {
  // Only accept POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed', hint: 'POST only' });
  }

  try {
    // Parse body
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (e) {
        return res.status(400).json({ error: 'invalid_json', hint: 'Body must be JSON' });
      }
    }

    // Verify secret
    if (!body.secret || body.secret !== WEBHOOK_SECRET) {
      return res.status(401).json({ error: 'invalid_secret' });
    }

    // Validate required fields
    if (!body.direction || !body.entry) {
      return res.status(400).json({
        error: 'missing_fields',
        hint: 'direction and entry are required'
      });
    }

    // Dedup check
    const sigHash = hashSignal(body);
    const now = Date.now();
    const lastSeen = recentSignals.get(sigHash);
    if (lastSeen && (now - lastSeen.ts) < DEDUP_WINDOW_MS) {
      return res.status(200).json({
        ok: true,
        deduplicated: true,
        last_msg_id: lastSeen.msg_id,
        window_seconds: Math.round((DEDUP_WINDOW_MS - (now - lastSeen.ts)) / 1000),
      });
    }

    // Build caption (signal OR close)
    let caption;
    if (body.close) {
      caption = buildCloseCaption(body);
    } else {
      caption = buildSignalCaption(body);
    }

    // Post to Telegram
    const result = await postToTelegram(caption);
    const msgId = result.message_id;

    // Update dedup
    recentSignals.set(sigHash, { ts: now, msg_id: msgId });

    // Cleanup old entries (older than 10 min)
    for (const [k, v] of recentSignals.entries()) {
      if (now - v.ts > 10 * 60 * 1000) recentSignals.delete(k);
    }

    return res.status(200).json({
      ok: true,
      message_id: msgId,
      caption_length: caption.length,
      type: body.close ? 'close' : 'signal',
      pair: body.pair,
      direction: body.direction,
    });
  } catch (err) {
    console.error('[gh-signal error]', err);
    return res.status(500).json({
      error: 'internal',
      message: err.message,
    });
  }
};
