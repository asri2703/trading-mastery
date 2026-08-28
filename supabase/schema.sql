-- Gold Hunter (Trading Mastery) — Supabase Schema
-- Run this in Supabase SQL Editor (Project: Trading-Mastery, ref: kfjsdlqkebrepwjciedr)
-- IMPORTANT: This is the GH landing page project, isolated from Mastery Signal

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- ORDERS: Track every GH purchase attempt
-- =====================================================
CREATE TABLE IF NOT EXISTS gh_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- Plan info
  plan TEXT NOT NULL CHECK (plan IN ('flex', 'plus', 'pro')),
  plan_name TEXT NOT NULL,
  amount_usd DECIMAL(10, 2) NOT NULL,
  -- Customer info
  tv_username TEXT NOT NULL,
  telegram_username TEXT NOT NULL,
  -- Stripe
  stripe_session_id TEXT UNIQUE,
  stripe_payment_intent TEXT,
  -- Status flow: pending → paid → processed (or cancelled)
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'processed', 'cancelled')),
  -- Telegram messages (for tracking notifications sent)
  owner_msg_id BIGINT,
  group_msg_id BIGINT,
  client_msg_id BIGINT,
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancel_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_gh_orders_status ON gh_orders(status);
CREATE INDEX IF NOT EXISTS idx_gh_orders_created ON gh_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gh_orders_telegram ON gh_orders(telegram_username);
CREATE INDEX IF NOT EXISTS idx_gh_orders_tv ON gh_orders(tv_username);

-- =====================================================
-- ACCESS: Granted TradingView access (post-processed)
-- =====================================================
CREATE TABLE IF NOT EXISTS gh_access (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- Links to order
  order_id UUID REFERENCES gh_orders(id) ON DELETE SET NULL,
  -- Customer
  telegram_username TEXT NOT NULL,
  tv_username TEXT NOT NULL,
  -- Plan details
  plan TEXT NOT NULL,
  -- Access window
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  -- Status
  active BOOLEAN NOT NULL DEFAULT TRUE,
  -- Manual notes (boss adds when granting)
  notes TEXT,
  UNIQUE(telegram_username, tv_username, plan)
);

CREATE INDEX IF NOT EXISTS idx_gh_access_telegram ON gh_access(telegram_username);
CREATE INDEX IF NOT EXISTS idx_gh_access_expires ON gh_access(expires_at);
CREATE INDEX IF NOT EXISTS idx_gh_access_active ON gh_access(active) WHERE active = TRUE;

-- =====================================================
-- ACTIVITY LOG: Track all bot interactions
-- =====================================================
CREATE TABLE IF NOT EXISTS gh_activity (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID REFERENCES gh_orders(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gh_activity_order ON gh_activity(order_id);
CREATE INDEX IF NOT EXISTS idx_gh_activity_created ON gh_activity(created_at DESC);

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================
ALTER TABLE gh_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE gh_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE gh_activity ENABLE ROW LEVEL SECURITY;

-- Allow service_role full access (used by webhook + bot)
-- No policies for anon/authenticated = default deny = safe

-- Service role bypasses RLS by default, so we don't need explicit policies for it

-- =====================================================
-- HELPFUL VIEWS (for boss dashboard)
-- =====================================================

-- Orders summary (for boss dashboard)
CREATE OR REPLACE VIEW v_gh_orders_summary AS
SELECT
  o.id,
  o.plan,
  o.plan_name,
  o.amount_usd,
  o.tv_username,
  o.telegram_username,
  o.status,
  o.created_at,
  o.paid_at,
  o.processed_at,
  EXTRACT(EPOCH FROM (NOW() - o.created_at))/3600 AS hours_since_order,
  CASE
    WHEN o.status = 'pending' THEN EXTRACT(EPOCH FROM (NOW() - o.created_at))/3600
    WHEN o.status = 'paid' THEN EXTRACT(EPOCH FROM (NOW() - o.paid_at))/3600
    ELSE NULL
  END AS hours_in_current_state
FROM gh_orders o
ORDER BY o.created_at DESC;

-- Active subscriptions (for renewal tracking)
CREATE OR REPLACE VIEW v_gh_active_subscriptions AS
SELECT
  a.telegram_username,
  a.tv_username,
  a.plan,
  a.granted_at,
  a.expires_at,
  EXTRACT(DAY FROM (a.expires_at - NOW())) AS days_until_expiry,
  CASE
    WHEN a.expires_at < NOW() THEN 'expired'
    WHEN a.expires_at < NOW() + INTERVAL '7 days' THEN 'expiring_soon'
    ELSE 'active'
  END AS status_label
FROM gh_access a
WHERE a.active = TRUE
ORDER BY a.expires_at ASC;

-- =====================================================
-- COMPLETE
-- =====================================================
COMMENT ON TABLE gh_orders IS 'All GH purchase attempts and their Stripe payment status';
COMMENT ON TABLE gh_access IS 'Granted TradingView indicator access (post-processed orders)';
COMMENT ON TABLE gh_activity IS 'Activity log for bot interactions, status changes, etc';
