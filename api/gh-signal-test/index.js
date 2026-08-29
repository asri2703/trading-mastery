// Gold Hunter Signal — TEST MODE (posts to boss DM only)
// File: api/gh-signal-test/index.js → route: /api/gh-signal-test
//
// Purpose: Same as /api/gh-signal but posts to OWNER_CHAT_ID instead of channel.
// Use this for testing new webhook configs before going live.
//
// TradingView alert URL: https://tradingmastery.com.my/api/gh-signal-test

const https = require('https');

const TG_BOT_TOKEN = process.env.GH_BOT_TOKEN;
const OWNER_CHAT_ID = process.env.OWNER_CHAT_ID; // Boss @asripapa (958886296)
const WEBHOOK_SECRET = process.env.GH_SIGNAL_SECRET || 'trading-mastery-2026';

const DEDUP_WINDOW_MS = 5 * 60 * 1000;
const recentSignals = new Map();

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

  const dirEmoji = direction === 'BUY' ? '🟢' : direction === 'SELL' ? '🔴' : '⚪';
  const pairEmoji = pair.includes('XAU') || pair.includes('GOLD') ? '🥇' : '📊';

  const pipSize = pair.includes('XAU') || pair.includes('GOLD') ? 0.1 : 0.0001;
  const slPips = direction === 'BUY' ? Math.round((entry - sl) / pipSize) : Math.round((sl - entry) / pipSize);
  const tp1Pips = direction === 'BUY' ? Math.round((tp1 - entry) / pipSize) : Math.round((entry - tp1) / pipSize);
  const tp2Pips = direction === 'BUY' ? Math.round((tp2 - entry) / pipSize) : Math.round((entry - tp2) / pipSize);

  let cap = `🧪 *TEST SIGNAL* (DM only)\n\n`;
  cap += `${dirEmoji} *${direction} ${sig.signal || 'SIGNAL'}*\n`;
  cap += `${pairEmoji} ${pair}${tf ? ` · M${tf}` : ''}\n`;
  if (score > 0) cap += `💯 Score: ${score.toFixed(1)}/7.0\n`;
  cap += `\n`;
  cap += `🎯 Entry: \`${entry.toFixed(2)}\`\n`;
  if (tp1) cap += `🟢 TP1: \`${tp1.toFixed(2)}\` (+${tp1Pips}p)\n`;
  if (tp2) cap += `🟢 TP2: \`${tp2.toFixed(2)}\` (+${tp2Pips}p)\n`;
  if (tp3) cap += `🟢 TP3: \`${tp3.toFixed(2)}\` (+${Math.round((tp3-entry)/pipSize)}p)\n`;
  cap += `🔴 SL: \`${sl.toFixed(2)}\` (-${slPips}p)\n`;
  cap += `\n`;
  cap += `_This is a TEST — channel posting disabled._`;

  return cap;
}

function buildCloseCaption(sig) {
  const direction = (sig.direction || '').toUpperCase();
  const pair = sig.pair || 'XAUUSD';
  const close = (sig.close || '').toLowerCase();
  const pips = parseFloat(sig.pips) || 0;
  const entry = parseFloat(sig.entry) || 0;
  const closePrice = parseFloat(sig.close_price) || 0;

  const closeLabels = { tp1: 'TP1 HIT', tp2: 'TP2 HIT', tp3: 'TP3 HIT', sl: 'SL HIT' };
  const closeEmojis = { tp1: '🎯', tp2: '🎯', tp3: '🎯', sl: '🛑' };

  let cap = `🧪 *TEST CLOSE* (DM only)\n\n`;
  cap += `${closeEmojis[close] || '📊'} *${closeLabels[close] || close.toUpperCase()}*\n`;
  cap += `${direction} ${pair}\n`;
  cap += `Entry: \`${entry.toFixed(2)}\` → Close: \`${closePrice.toFixed(2)}\`\n`;
  cap += `Pips: *${pips >= 0 ? '+' : ''}${pips.toFixed(1)}p*\n`;
  cap += `\n_Test mode — channel disabled._`;
  return cap;
}

function hashSignal(sig) {
  const raw = [sig.direction || '', sig.pair || '', sig.entry || '',
               sig.sl || '', sig.tp1 || '', sig.tp2 || '', sig.close || ''].join('|');
  return require('crypto').createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

async function postToTelegram(text) {
  if (!TG_BOT_TOKEN || !OWNER_CHAT_ID) {
    throw new Error('Missing TG_BOT_TOKEN or OWNER_CHAT_ID');
  }
  const url = `https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`;
  const body = JSON.stringify({
    chat_id: OWNER_CHAT_ID,
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
    if (!body.secret || body.secret !== WEBHOOK_SECRET) {
      return res.status(401).json({ error: 'invalid_secret' });
    }
    if (!body.direction || !body.entry) {
      return res.status(400).json({ error: 'missing_fields', hint: 'direction and entry required' });
    }

    // Dedup
    const sigHash = hashSignal(body);
    const now = Date.now();
    const lastSeen = recentSignals.get(sigHash);
    if (lastSeen && (now - lastSeen.ts) < DEDUP_WINDOW_MS) {
      return res.status(200).json({ ok: true, deduplicated: true, last_msg_id: lastSeen.msg_id });
    }

    const caption = body.close ? buildCloseCaption(body) : buildSignalCaption(body);
    const result = await postToTelegram(caption);

    recentSignals.set(sigHash, { ts: now, msg_id: result.message_id });
    for (const [k, v] of recentSignals.entries()) {
      if (now - v.ts > 10 * 60 * 1000) recentSignals.delete(k);
    }

    return res.status(200).json({
      ok: true,
      message_id: result.message_id,
      test_mode: true,
      target: 'OWNER_DM',
      type: body.close ? 'close' : 'signal',
    });
  } catch (err) {
    console.error('[gh-signal-test error]', err);
    return res.status(500).json({ error: 'internal', message: err.message });
  }
};
