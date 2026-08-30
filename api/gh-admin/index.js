/**
 * GH Performance Tracking + Admin Schema Runner
 *
 * POST /api/gh-admin with {action: "init_perf_table"} creates gh_performance table
 * POST /api/gh-admin with {action: "log_close", ...} logs TP/SL close events
 * GET  /api/gh-admin returns stats
 *
 * Used by GCP Cloud Run webhook to record close events
 */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function ensurePerfTable() {
  // Use raw SQL via PostgREST RPC if available, or POST to a function
  // Since we don't have direct SQL, return the schema that should be run in Supabase
  return {
    sql: `
CREATE TABLE IF NOT EXISTS gh_performance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  signal_id TEXT,
  pair TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('BUY', 'SELL')),
  signal_name TEXT,
  entry NUMERIC(10, 2) NOT NULL,
  sl NUMERIC(10, 2) NOT NULL,
  tp1 NUMERIC(10, 2) NOT NULL,
  tp2 NUMERIC(10, 2),
  tp3 NUMERIC(10, 2),
  close_price NUMERIC(10, 2),
  close_result TEXT NOT NULL CHECK (close_result IN ('tp1', 'tp2', 'tp3', 'sl', 'be')),
  pips NUMERIC(10, 1) NOT NULL DEFAULT 0,
  score NUMERIC(3, 1),
  signal_time TIMESTAMPTZ,
  close_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gh_perf_close_result ON gh_performance(close_result);
CREATE INDEX IF NOT EXISTS idx_gh_perf_pair ON gh_performance(pair);
CREATE INDEX IF NOT EXISTS idx_gh_perf_close_time ON gh_performance(close_time DESC);
CREATE INDEX IF NOT EXISTS idx_gh_perf_direction ON gh_performance(direction);
CREATE UNIQUE INDEX IF NOT EXISTS uq_gh_perf_signal_id ON gh_performance(signal_id);

ALTER TABLE gh_performance ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON gh_performance FROM anon, authenticated;
`,
    note: 'Run this SQL in Supabase SQL Editor to create the table. After creation, log_close will work.'
  };
}

async function logCloseEvent(data) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return { ok: false, error: 'supabase_not_configured' };
  }

  const payload = {
    signal_id: data.signal_id || null,
    pair: data.pair || 'XAUUSD',
    timeframe: data.timeframe || 'M15',
    direction: data.direction || 'BUY',
    signal_name: data.signal_name || null,
    entry: data.entry || 0,
    sl: data.sl || 0,
    tp1: data.tp1 || 0,
    tp2: data.tp2 || null,
    tp3: data.tp3 || null,
    close_price: data.close_price || null,
    close_result: data.close_result || 'tp1',
    pips: data.pips || 0,
    score: data.score || null,
    signal_time: data.signal_time || null,
    close_time: data.close_time || new Date().toISOString(),
  };

  const res = await fetch(`${SUPABASE_URL}/rest/v1/gh_performance`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer': 'resolution=ignore-duplicates,return=minimal',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.text();
    return { ok: false, status: res.status, error: err.substring(0, 300) };
  }

  return { ok: true, status: res.status };
}

export default async function handler(req) {
  const ADMIN_TOKEN = process.env.ADMIN_TOKEN || process.env.GH_ADMIN_TOKEN;

  // Auth check for POST
  if (req.method === 'POST') {
    const body = await req.json().catch(() => ({}));
    const token = req.headers.get('x-admin-token') || body.admin_token;
    if (!ADMIN_TOKEN || token !== ADMIN_TOKEN) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (body.action === 'init_perf_table') {
      const info = await ensurePerfTable();
      return new Response(JSON.stringify(info), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (body.action === 'log_close') {
      const result = await logCloseEvent(body.data || body);
      return new Response(JSON.stringify(result), {
        status: result.ok ? 200 : 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'unknown_action', actions: ['init_perf_table', 'log_close'] }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // GET: Show status
  if (req.method === 'GET') {
    return new Response(JSON.stringify({
      service: 'gh-admin',
      status: 'ok',
      actions: ['init_perf_table', 'log_close'],
      timestamp: new Date().toISOString(),
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response('method not allowed', { status: 405 });
}