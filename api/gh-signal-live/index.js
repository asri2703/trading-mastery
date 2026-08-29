// Gold Hunter Signal — LIVE MODE (posts to @getfreegoldsignal channel)
// File: api/gh-signal-live/index.js → route: /api/gh-signal-live
//
// Purpose: Production signal posting to public channel.
// FILTER: Only M15, M30, H1 timeframes. Other timeframes rejected.
// DEDUP: 30-min window per (direction, entry, timeframe) tuple.
//
// Boss uses this URL after confirming test mode works:
//   https://tradingmastery.com.my/gh-signal-live
//
// Pine Script alert URL: https://tradingmastery.com.my/gh-signal-live

const https = require('https');

const TG_BOT_TOKEN = process.env.GH_BOT_TOKEN;
const TG_CHANNEL_ID = process.env.GH_CHANNEL_ID; // -1004466635373 (Gold Hunter channel)
const WEBHOOK_SECRET = process.env.GH_SIGNAL_SECRET || 'trading-mastery-2026';

// ALLOWED timeframes (boss filter: M15, M30, H1 only — boss explicit)
const ALLOWED_TIMEFRAMES = ['15', '30', '60'];
const TF_LABELS = { '15': 'M15', '30': 'M30', '60': 'H1' };

// DEDUP: 30-min window per signal hash
const DEDUP_WINDOW_MS = 30 * 60 * 1000;
const recentSignals = new Map();

function buildSignalCaption(sig) {
  const direction = (sig.direction || '').toUpperCase();
  const pair = sig.pair || 'XAUUSD';
  const tfCode = String(sig.timeframe || '');
  const tfLabel = TF_LABELS[tfCode] || `M${tfCode}`;
  const score = parseFloat(sig.score) || 0;
  const entry = parseFloat(sig.entry) || 0;
  const sl = parseFloat(sig.sl) || 0;
  const tp1 = parseFloat(sig.tp1) || 0;
  const tp2 = parseFloat(sig.tp2) || 0;
  const tp3 = parseFloat(sig.tp3) || 0;

  const dirEmoji = direction === 'BUY' ? '🟢' : direction === 'SELL' ? '🔴' : '⚪';
  const pairEmoji = pair.includes('XAU') || pair.includes('GOLD') ? '🥇' : '📊';

  // Pip size (XAUUSD = 0.1 per pip)
  const pipSize = pair.includes('XAU') || pair.includes('GOLD') ? 0.1 : 0.0001;
  const slPips = direction === 'BUY' ? Math.round((entry - sl) / pipSize) : Math.round((sl - entry) / pipSize);
  const tp1Pips = direction === 'BUY' ? Math.round((tp1 - entry) / pipSize) : Math.round((entry - tp1) / pipSize);
  const tp2Pips = direction === 'BUY' ? Math.round((tp2 - entry) / pipSize) : Math.round((entry - tp2) / pipSize);
  const tp3Pips = tp3 ? (direction === 'BUY' ? Math.round((tp3 - entry) / pipSize) : Math.round((entry - tp3) / pipSize)) : 0;

  const rr = slPips > 0 ? (tp2Pips / slPips).toFixed(1) : 'N/A';

  // Profit calculation (XAUUSD: 0.01 lot = $0.10/pip, 0.10 lot = $1.00/pip, 1.00 lot = $10.00/pip)
  const tp2Usd01 = (tp2Pips * 0.10).toFixed(2);
  const tp2Usd10 = (tp2Pips * 1.00).toFixed(2);
  const tp2Usd100 = (tp2Pips * 10.00).toFixed(2);

  // Time in MYT
  const now = new Date();
  const mytTime = now.toLocaleString('en-MY', {
    timeZone: 'Asia/Kuala_Lumpur',
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  // Signal label cleanup
  let signalLabel = (sig.signal || 'SIGNAL').replace(/^TRADING MASTERY\s*/i, '');

  let cap = '';
  cap += `🥇 *GOLD HUNTER SIGNAL* 🚨\n\n`;
  cap += `${dirEmoji} *${direction} ${signalLabel}*\n`;
  cap += `${pairEmoji} ${pair} · *${tfLabel}*\n`;
  if (score > 0) cap += `💯 Score: ${score.toFixed(1)}/7.0\n`;
  cap += `\n`;
  cap += `🎯 *Entry:* \`${entry.toFixed(2)}\`\n`;
  cap += `🟢 *TP1:* \`${tp1.toFixed(2)}\` (+${tp1Pips}p)\n`;
  cap += `🟢 *TP2:* \`${tp2.toFixed(2)}\` (+${tp2Pips}p)\n`;
  if (tp3) cap += `🟢 *TP3:* \`${tp3.toFixed(2)}\` (+${tp3Pips}p)\n`;
  cap += `🔴 *SL:* \`${sl.toFixed(2)}\` (-${slPips}p)\n`;
  cap += `\n`;
  cap += `📈 *R:R* 1:${rr}  ·  ⏰ ${mytTime} MYT\n`;
  cap += `\n`;
  cap += `💰 *Profit if TP2 hits:*\n`;
  cap += `   • 0.01 lot: $${tp2Usd01}\n`;
  cap += `   • 0.10 lot: $${tp2Usd10}\n`;
  cap += `   • 1.00 lot: $${tp2Usd100}\n`;
  cap += `\n`;
  cap += `⚠️ _Trading involves risk. Trade with discipline._\n\n`;
  cap += `━━━━━━━━━━━━━━━━━━\n`;
  cap += `📱 Channel: https://t.me/getfreegoldsignal\n`;
  cap += `🤖 Bot: @thegoldhunterbot`;

  return cap;
}

function buildCloseCaption(sig) {
  const direction = (sig.direction || '').toUpperCase();
  const pair = sig.pair || 'XAUUSD';
  const close = (sig.close || '').toLowerCase();
  const pips = parseFloat(sig.pips) || 0;
  const entry = parseFloat(sig.entry) || 0;
  const closePrice = parseFloat(sig.close_price) || 0;

  const closeEmojis = { tp1: '🎯', tp2: '🎯', tp3: '🎯', sl: '🛑' };
  const closeLabels = { tp1: 'TP1 HIT ✅', tp2: 'TP2 HIT ✅', tp3: 'TP3 HIT ✅', sl: 'SL HIT ❌' };

  const emoji = closeEmojis[close] || '📊';
  const label = closeLabels[close] || close.toUpperCase();

  const dirEmoji = direction === 'BUY' ? '🟢' : '🔴';
  const pairEmoji = pair.includes('XAU') || pair.includes('GOLD') ? '🥇' : '📊';

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
  cap += `📱 Channel: https://t.me/getfreegoldsignal`;
  return cap;
}

function hashSignal(sig) {
  // Include timeframe + entry + direction + TP/SL for proper dedup
  const raw = [
    sig.direction || '',
    sig.pair || '',
    sig.entry || '',
    sig.sl || '',
    sig.tp1 || '',
    sig.tp2 || '',
    sig.timeframe || '',
    sig.close || '',
  ].join('|');
  return require('crypto').createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

async function postToTelegram(text) {
  if (!TG_BOT_TOKEN || !TG_CHANNEL_ID) {
    throw new Error('Missing TG_BOT_TOKEN or TG_CHANNEL_ID');
  }
  const url = `https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`;
  const body = JSON.stringify({
    chat_id: TG_CHANNEL_ID,
    text: text,
    parse_mode: 'Markdown',
    disable_web_page_preview: true,
  });
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' } }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.ok) resolve(result.result);
          else reject(new Error(result.description));
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); }
      catch (e) { return res.status(400).json({ error: 'invalid_json' }); }
    }

    // Verify secret
    if (!body.secret || body.secret !== WEBHOOK_SECRET) {
      return res.status(401).json({ error: 'invalid_secret' });
    }

    // Validate required fields
    if (!body.direction || !body.entry) {
      return res.status(400).json({
        error: 'missing_fields',
        hint: 'direction and entry required'
      });
    }

    // Validate timeframe
    const tf = String(body.timeframe || '');
    if (!ALLOWED_TIMEFRAMES.includes(tf)) {
      return res.status(403).json({
        error: 'timeframe_not_allowed',
        timeframe: tf,
        allowed: ALLOWED_TIMEFRAMES.map(t => TF_LABELS[t] || t),
        hint: `Only ${ALLOWED_TIMEFRAMES.map(t => TF_LABELS[t] || t).join(', ')} allowed. Boss filter excludes M1, M5, M30 etc.`
      });
    }

    // Dedup check
    const sigHash = hashSignal(body);
    const now = Date.now();
    const lastSeen = recentSignals.get(sigHash);
    if (lastSeen && (now - lastSeen.ts) < DEDUP_WINDOW_MS) {
      const minutesLeft = Math.ceil((DEDUP_WINDOW_MS - (now - lastSeen.ts)) / 60000);
      return res.status(200).json({
        ok: true,
        deduplicated: true,
        last_msg_id: lastSeen.msg_id,
        cooldown_minutes: minutesLeft,
        hint: `Same signal posted ${Math.round((now - lastSeen.ts) / 60000)}min ago. Next post allowed in ${minutesLeft}min.`
      });
    }

    // Build caption
    const caption = body.close ? buildCloseCaption(body) : buildSignalCaption(body);

    // Post to Telegram channel
    const result = await postToTelegram(caption);

    // Update dedup
    recentSignals.set(sigHash, { ts: now, msg_id: result.message_id });

    // Cleanup old entries (>30 min)
    for (const [k, v] of recentSignals.entries()) {
      if (now - v.ts > 30 * 60 * 1000) recentSignals.delete(k);
    }

    return res.status(200).json({
      ok: true,
      message_id: result.message_id,
      target: 'CHANNEL @getfreegoldsignal',
      type: body.close ? 'close' : 'signal',
      timeframe: TF_LABELS[tf] || tf,
      direction: body.direction,
      pair: body.pair,
      caption_length: caption.length,
    });
  } catch (err) {
    console.error('[gh-signal-live error]', err);
    return res.status(500).json({
      error: 'internal',
      message: err.message,
    });
  }
};
/* Force rebuild Sat Aug 29 07:58:02 PM CST 2026 */
