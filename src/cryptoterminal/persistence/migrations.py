from __future__ import annotations

import asyncpg

# ── Trading tables ──────────────────────────────────────────────────────────
_TRADING_TABLES = [
    """
    CREATE TABLE IF NOT EXISTS news_events (
        id TEXT PRIMARY KEY,
        headline TEXT NOT NULL,
        source TEXT NOT NULL,
        source_priority INTEGER DEFAULT 3,
        published_at TEXT NOT NULL,
        received_at TEXT NOT NULL,
        latency_ms INTEGER DEFAULT 0,
        related_symbols TEXT DEFAULT '[]',
        tags TEXT DEFAULT '[]',
        priority TEXT DEFAULT 'LOW',
        url TEXT,
        raw_content TEXT
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        exchange_id TEXT,
        symbol TEXT NOT NULL,
        side TEXT NOT NULL,
        order_type TEXT NOT NULL,
        quantity DOUBLE PRECISION NOT NULL,
        price DOUBLE PRECISION,
        leverage INTEGER DEFAULT 1,
        notional_usd DOUBLE PRECISION DEFAULT 0,
        status TEXT NOT NULL,
        risk_approved BOOLEAN,
        risk_reject_reason TEXT,
        created_at TEXT NOT NULL,
        submitted_at TEXT,
        filled_at TEXT,
        fill_price DOUBLE PRECISION,
        fees DOUBLE PRECISION DEFAULT 0,
        error TEXT
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS fills (
        id SERIAL PRIMARY KEY,
        order_id TEXT NOT NULL,
        symbol TEXT NOT NULL,
        side TEXT NOT NULL,
        quantity DOUBLE PRECISION NOT NULL,
        price DOUBLE PRECISION NOT NULL,
        fees DOUBLE PRECISION DEFAULT 0,
        timestamp TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS positions (
        id SERIAL PRIMARY KEY,
        symbol TEXT NOT NULL,
        side TEXT NOT NULL,
        quantity DOUBLE PRECISION NOT NULL,
        entry_price DOUBLE PRECISION NOT NULL,
        current_price DOUBLE PRECISION DEFAULT 0,
        leverage INTEGER DEFAULT 1,
        stop_loss DOUBLE PRECISION,
        take_profit DOUBLE PRECISION,
        opened_at TEXT NOT NULL,
        closed_at TEXT,
        realized_pnl DOUBLE PRECISION DEFAULT 0,
        is_open INTEGER DEFAULT 1
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS risk_events (
        id SERIAL PRIMARY KEY,
        timestamp TEXT NOT NULL,
        order_id TEXT,
        symbol TEXT,
        side TEXT,
        amount_usd DOUBLE PRECISION,
        result TEXT NOT NULL,
        reason TEXT,
        checks TEXT DEFAULT '{}'
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS system_logs (
        id SERIAL PRIMARY KEY,
        timestamp TEXT NOT NULL,
        level TEXT NOT NULL,
        event TEXT NOT NULL,
        details TEXT
    )
    """,
]

# ── Auth tables ─────────────────────────────────────────────────────────────
_AUTH_TABLES = [
    """
    CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        plan TEXT NOT NULL DEFAULT 'free',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        stripe_customer_id TEXT
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        refresh_token TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS price_alerts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        coin TEXT NOT NULL,
        direction TEXT NOT NULL,
        target_price DOUBLE PRECISION NOT NULL,
        triggered INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token TEXT NOT NULL UNIQUE,
        expires_at TIMESTAMPTZ NOT NULL,
        used INTEGER NOT NULL DEFAULT 0
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS smart_money_settings (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        followed_json TEXT NOT NULL DEFAULT '{}',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(user_id)
    )
    """,
]

_LIQ_TABLES = [
    """
    CREATE TABLE IF NOT EXISTS liq_events (
        id BIGSERIAL PRIMARY KEY,
        exchange  TEXT NOT NULL,
        symbol    TEXT NOT NULL,
        side      TEXT NOT NULL,
        ts_ms     BIGINT NOT NULL,
        price     DOUBLE PRECISION NOT NULL,
        base_qty  DOUBLE PRECISION NOT NULL,
        usd_value DOUBLE PRECISION NOT NULL
    )
    """,
]

_NOTIFICATION_TABLES = [
    """
    CREATE TABLE IF NOT EXISTS telegram_subscriptions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        chat_id TEXT NOT NULL,
        notify_news BOOLEAN NOT NULL DEFAULT TRUE,
        notify_orders BOOLEAN NOT NULL DEFAULT TRUE,
        notify_alerts BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(user_id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS email_subscriptions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        notify_news BOOLEAN NOT NULL DEFAULT FALSE,
        notify_orders BOOLEAN NOT NULL DEFAULT TRUE,
        notify_alerts BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(user_id)
    )
    """,
]

_CRYPTO_BILLING = [
    # plan_expires_at: pro planın ne zaman biteceği (NULL = free veya sınırsız)
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ",
    """
    CREATE TABLE IF NOT EXISTS crypto_payments (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        plan TEXT NOT NULL,
        chain TEXT NOT NULL,
        token TEXT NOT NULL,
        amount DOUBLE PRECISION NOT NULL,
        tx_hash TEXT NOT NULL,
        wallet_address TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        verified_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    """,
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_crypto_payments_tx ON crypto_payments(tx_hash)",
    "CREATE INDEX IF NOT EXISTS idx_crypto_payments_user ON crypto_payments(user_id)",
    "CREATE INDEX IF NOT EXISTS idx_crypto_payments_status ON crypto_payments(status)",
]

_BIG_TRANSFERS = [
    """
    CREATE TABLE IF NOT EXISTS big_transfer_events (
        id BIGSERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        transfer_id TEXT NOT NULL,
        source TEXT NOT NULL, -- cex | chain
        ts_sec BIGINT NOT NULL,
        coin TEXT NOT NULL,
        amount_usd DOUBLE PRECISION NOT NULL,
        transfer_type TEXT NOT NULL, -- trade | transfer
        side TEXT,
        qty_text TEXT,
        chain TEXT,
        from_addr TEXT,
        to_addr TEXT,
        link TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    """,
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_big_transfer_user_unique ON big_transfer_events(user_id, transfer_id)",
    "CREATE INDEX IF NOT EXISTS idx_big_transfer_user_ts ON big_transfer_events(user_id, ts_sec DESC)",
]

_OAUTH_COLUMNS = [
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT",
    "ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL",
]

_PORTFOLIO_STATE_TABLE = [
    """
    CREATE TABLE IF NOT EXISTS portfolio_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )
    """,
    # accumulated_funding sütunu yoksa ekle (idempotent)
    """
    ALTER TABLE positions ADD COLUMN IF NOT EXISTS
        accumulated_funding DOUBLE PRECISION DEFAULT 0
    """,
]

# ── Conditional order columns on price_alerts ──
# Alarm tetiklendiğinde otomatik emir gönderebilsin diye action alanları.
_CONDITIONAL_ALERTS = [
    # action: 'long' | 'short' | 'close' | 'reduce' | NULL (sadece bildirim)
    "ALTER TABLE price_alerts ADD COLUMN IF NOT EXISTS action TEXT",
    "ALTER TABLE price_alerts ADD COLUMN IF NOT EXISTS action_amount_usd DOUBLE PRECISION",
    "ALTER TABLE price_alerts ADD COLUMN IF NOT EXISTS action_leverage INTEGER",
    "ALTER TABLE price_alerts ADD COLUMN IF NOT EXISTS action_fired INTEGER DEFAULT 0",
]

_INDEXES = [
    "CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)",
    "CREATE INDEX IF NOT EXISTS idx_smart_money_user ON smart_money_settings(user_id)",
    "CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(refresh_token)",
    "CREATE INDEX IF NOT EXISTS idx_alerts_user ON price_alerts(user_id)",
    "CREATE INDEX IF NOT EXISTS idx_news_received ON news_events(received_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_orders_symbol ON orders(symbol)",
    "CREATE INDEX IF NOT EXISTS idx_liq_ts ON liq_events(ts_ms DESC)",
    "CREATE INDEX IF NOT EXISTS idx_liq_exchange ON liq_events(exchange)",
    # Composite: zaman aralığı + exchange + symbol grupla sorguları için (aggregate sorgu)
    "CREATE INDEX IF NOT EXISTS idx_liq_ts_exchange_symbol ON liq_events(ts_ms DESC, exchange, symbol)",
    # Composite: sembol bazlı likidasyon arama için
    "CREATE INDEX IF NOT EXISTS idx_liq_symbol_ts ON liq_events(symbol, ts_ms DESC)",
]


_DEVICE_TOKENS = [
    """
    CREATE TABLE IF NOT EXISTS device_tokens (
        id          SERIAL PRIMARY KEY,
        user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token       TEXT    NOT NULL,
        platform    TEXT    NOT NULL DEFAULT 'ios',
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(user_id, token)
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_device_tokens_user ON device_tokens(user_id)",
]

# Global big-transfer feed populated by on-chain trackers (mempool.space for BTC,
# PublicNode WSS for EVM). One row per (chain, tx_hash) — shared across all users.
# Each user applies their own threshold filter at query time.
_BIG_TRANSFERS_GLOBAL = [
    """
    CREATE TABLE IF NOT EXISTS big_transfers (
        id            BIGSERIAL PRIMARY KEY,
        chain         TEXT NOT NULL,         -- 'btc' | 'eth' | 'tron' | ...
        asset         TEXT NOT NULL,         -- 'BTC' | 'USDT' | 'USDC' | 'ETH' ...
        tx_hash       TEXT NOT NULL,
        amount_native DOUBLE PRECISION NOT NULL,
        amount_usd    DOUBLE PRECISION NOT NULL,
        from_addr     TEXT,
        to_addr       TEXT,
        block_height  BIGINT,
        ts_sec        BIGINT NOT NULL,
        link          TEXT,
        from_label    TEXT,                  -- 'Binance hot' / 'Coinbase' (future enrichment)
        to_label      TEXT,
        raw_json      TEXT,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(chain, tx_hash, asset)
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_big_transfers_ts ON big_transfers(ts_sec DESC)",
    "CREATE INDEX IF NOT EXISTS idx_big_transfers_chain_ts ON big_transfers(chain, ts_sec DESC)",
    "CREATE INDEX IF NOT EXISTS idx_big_transfers_amount ON big_transfers(amount_usd DESC, ts_sec DESC)",
    # Flow category populated by tracker enrichment (cex_inflow/outflow/internal/mint/burn/unknown)
    "ALTER TABLE big_transfers ADD COLUMN IF NOT EXISTS flow_category TEXT",
    "CREATE INDEX IF NOT EXISTS idx_big_transfers_flow ON big_transfers(flow_category, ts_sec DESC)",
    # Heuristic auto-label hints — addresses that keep transacting with known
    # CEX wallets. When hits >= 5 AND volume >= $5M, lookup returns
    # "<Entity> Deposit (auto)" so the address starts surfacing as exchange-side.
    """
    CREATE TABLE IF NOT EXISTS address_label_hints (
        address          TEXT PRIMARY KEY,
        hinted_entity    TEXT NOT NULL,
        hits             INTEGER NOT NULL DEFAULT 0,
        total_volume_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
        first_seen       BIGINT NOT NULL,
        last_seen        BIGINT NOT NULL,
        promoted_at      TIMESTAMPTZ
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_addr_hints_entity ON address_label_hints(hinted_entity, hits DESC)",
    # Funding rates — populated by backend tracker every 60s from 5 exchanges.
    # One row per (exchange, symbol) — UPSERT keeps only latest snapshot.
    """
    CREATE TABLE IF NOT EXISTS funding_rates (
        exchange          TEXT NOT NULL,
        symbol            TEXT NOT NULL,
        rate              DOUBLE PRECISION NOT NULL,
        next_funding_ms   BIGINT,
        interval_hours    INTEGER NOT NULL DEFAULT 8,
        fetched_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (exchange, symbol)
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_funding_symbol ON funding_rates(symbol)",
    # Corridor alert dedup — one row per fired (chain:from:to) corridor so the
    # background scanner doesn't re-notify the same persistent route every tick.
    # Re-fires only after a cooldown, or if the corridor's volume re-doubles.
    """
    CREATE TABLE IF NOT EXISTS corridor_alerts (
        corridor_key   TEXT PRIMARY KEY,
        last_total_usd DOUBLE PRECISION NOT NULL,
        last_count     INTEGER NOT NULL,
        last_alert_ts  BIGINT NOT NULL
    )
    """,
]

# Real Hyperliquid userFills events for every smart money wallet being tracked.
# Single row per (address, oid) — same fill goes to all followers via fan-out.
_SMART_MONEY_FILLS = [
    """
    CREATE TABLE IF NOT EXISTS smart_money_fills (
        id          BIGSERIAL PRIMARY KEY,
        address     TEXT NOT NULL,
        coin        TEXT NOT NULL,
        side        TEXT NOT NULL,                  -- 'buy' | 'sell'
        size_usd    DOUBLE PRECISION NOT NULL,
        px          DOUBLE PRECISION NOT NULL,
        sz          DOUBLE PRECISION NOT NULL,
        ts_ms       BIGINT NOT NULL,
        oid         TEXT NOT NULL,
        dir         TEXT,                            -- 'Open Long' | 'Close Long' | 'Open Short' | 'Close Short'
        closed_pnl  DOUBLE PRECISION,
        raw_json    TEXT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(address, oid)
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_smfills_addr_ts ON smart_money_fills(address, ts_ms DESC)",
    "CREATE INDEX IF NOT EXISTS idx_smfills_ts ON smart_money_fills(ts_ms DESC)",
]


# Compass history — one row per compute_compass() snapshot. Used to derive
# momentum (current vs ~3d ago) and percentile thresholds (current vs 30d).
_COMPASS_HISTORY = [
    """
    CREATE TABLE IF NOT EXISTS compass_history (
        ts_sec       BIGINT PRIMARY KEY,
        master       DOUBLE PRECISION NOT NULL,
        smart_money  DOUBLE PRECISION,
        big_transfers DOUBLE PRECISION,
        funding      DOUBLE PRECISION,
        liquidations DOUBLE PRECISION,
        volume       DOUBLE PRECISION,
        etf          DOUBLE PRECISION,
        global_score DOUBLE PRECISION
    )
    """,
    # setup_key: hangi advisor setup'ı o anda tetiklendi. Backtest için kritik —
    # bu olmadan "EARLY_ACCUMULATION 3 gün önce tetiklenmişti" sorusunu sonradan
    # cevaplayamayız. ADD COLUMN IF NOT EXISTS PG 9.6+.
    "ALTER TABLE compass_history ADD COLUMN IF NOT EXISTS setup_key TEXT",
    "CREATE INDEX IF NOT EXISTS idx_compass_ts ON compass_history(ts_sec DESC)",
    "CREATE INDEX IF NOT EXISTS idx_compass_setup ON compass_history(setup_key, ts_sec DESC)",
]


async def run_migrations(conn: asyncpg.Connection) -> None:
    for sql in [*_TRADING_TABLES, *_AUTH_TABLES, *_LIQ_TABLES, *_NOTIFICATION_TABLES,
                *_OAUTH_COLUMNS, *_CRYPTO_BILLING, *_BIG_TRANSFERS, *_PORTFOLIO_STATE_TABLE,
                *_CONDITIONAL_ALERTS, *_DEVICE_TOKENS, *_SMART_MONEY_FILLS,
                *_BIG_TRANSFERS_GLOBAL, *_COMPASS_HISTORY, *_INDEXES]:
        await conn.execute(sql)
