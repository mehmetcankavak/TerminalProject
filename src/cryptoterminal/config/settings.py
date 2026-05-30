from __future__ import annotations

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Exchange
    exchange: str = "binance"
    exchange_api_key: str = ""
    exchange_api_secret: str = ""
    exchange_testnet: bool = False

    # Hyperliquid
    trading_mode: str = "paper"          # "paper" | "binance" | "hyperliquid"
    hyperliquid_private_key: str = ""    # 0x... EVM private key
    hyperliquid_wallet_address: str = "" # 0x... public wallet address
    hyperliquid_testnet: bool = False    # True = testnet API

    # Watchlist
    watchlist_raw: str = "BTCUSDT,ETHUSDT,SOLUSDT"

    @field_validator("watchlist_raw", mode="before")
    @classmethod
    def parse_watchlist(cls, v: str) -> str:
        return v.upper()

    @property
    def watchlist(self) -> list[str]:
        return [s.strip() for s in self.watchlist_raw.split(",") if s.strip()]

    # News
    news_sources: str = "cryptopanic"
    news_poll_interval_seconds: int = 15
    cryptopanic_api_key: str = ""
    cryptopanic_filter: str = "hot"
    rss_feeds: str = ""
    twitter_accounts: str = ""  # comma-separated @handles (Nitter polling)
    twitter_bearer_token: str = ""  # Twitter API v2 Bearer Token (Filtered Stream)

    # Risk
    risk_max_trade_usd: float = 200.0
    risk_max_daily_loss_pct: float = 3.0
    risk_max_open_positions: int = 3
    risk_max_leverage: int = 5
    risk_max_position_usd: float = 500.0
    risk_max_portfolio_exposure_pct: float = 50.0
    risk_cooldown_seconds: int = 5
    risk_panic_cooldown_seconds: int = 300
    risk_duplicate_window_seconds: int = 5
    risk_stale_data_max_age_seconds: int = 3   # 10s → 3s: hızlı piyasada 10s çok uzun
    risk_max_spread_pct: float = 0.5
    risk_news_delay_seconds: int = 3
    risk_sl_required: bool = False
    risk_sl_reminder_seconds: int = 60

    # Paper trading başlangıç bakiyesi
    paper_starting_balance: float = 10_000.0

    # Logging
    log_level: str = "INFO"
    log_file: str = "logs/terminal.log"

    # Database
    db_path: str = "data/terminal.db"  # SQLite (TUI modu için hâlâ kullanılır)
    database_url: str = "postgresql://ct:ct_secret@localhost:5433/cryptoterminal"

    # Redis
    redis_url: str = "redis://localhost:6380/0"

    # Volume spike detection
    volume_spike_multiplier: float = 2.0

    # Auth / JWT
    jwt_secret: str = ""
    jwt_algorithm: str = "HS256"
    admin_email: str = ""  # Bu email'e sahip kullanıcı admin paneline erişir
    plan_price_usd: float = 19.0  # Pro plan aylık fiyatı (MRR hesabı için)

    # Google OAuth
    google_client_id: str = ""

    # Stripe / Billing (legacy — crypto ödeme sistemi aktif)
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    stripe_pro_price_id: str = ""

    # Crypto Payment — Wallet Addresses
    wallet_erc20: str = ""       # ERC-20 (Ethereum mainnet) USDT/USDC
    wallet_bsc: str = ""         # BEP-20 (BSC) USDT/USDC
    wallet_solana: str = ""      # SPL (Solana) USDT/USDC
    wallet_tron: str = ""        # TRC-20 (Tron) USDT/USDC
    wallet_arbitrum: str = ""    # Arbitrum One USDT/USDC

    # Crypto Payment — Plan Prices (USD)
    plan_price_monthly: float = 59.99
    plan_price_yearly: float = 479.99

    # Crypto Payment — Block Explorer API Keys (free tier yeterli)
    etherscan_api_key: str = ""
    bscscan_api_key: str = ""
    arbiscan_api_key: str = ""

    # TronGrid API key (trongrid.io → free) — lifts the keyless rate limit on
    # the TRON big-transfer tracker. Works without it, but intermittently.
    trongrid_api_key: str = ""

    # App environment — cookie Secure flag için
    app_env: str = "development"  # "production" | "development"

    # Coinglass API  (coinglass.com → API → ücretsiz key al)
    coinglass_api_key: str = ""

    # Bybit API key (bybit.com → API Management → read-only, ücretsiz)
    bybit_api_key: str = ""
    bybit_api_secret: str = ""

    # Groq (AI Piyasa Analisti)
    groq_api_key: str = ""

    # Financial Modeling Prep (Stocks fundamentals fallback)
    # https://site.financialmodelingprep.com/developer/docs
    fmp_api_key: str = ""

    # CORS
    cors_origins: str = "http://localhost:5173,http://localhost:3000"

    # Email / SMTP
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = "noreply@tradingtools.app"
    app_url: str = "https://tradingtools.app"

    # Telegram MTProto Sniper
    telegram_api_id: int = 0
    telegram_api_hash: str = ""
    telegram_phone: str = ""          # phone number OR leave empty to use bot token
    telegram_bot_token: str = ""         # sniper için (kanal okuma)
    telegram_alert_bot_token: str = ""   # kullanıcılara alert göndermek için ayrı bot
    telegram_session: str = "data/tg_sniper"  # session file path (no .session suffix)
    telegram_session_string: str = ""  # Telethon StringSession — MTProto real-time (cloud)
    telegram_channels: str = ""       # comma-separated: @channel or numeric id
    telegram_news_priority: str = "HIGH"  # default priority for TG messages
    # Lane overrides — comma-separated channel handles (without @). Boş bırakılırsa
    # telegram_sniper'daki built-in default listeleri kullanılır.
    telegram_ultra_channels: str = ""      # 4s polling
    telegram_critical_channels: str = ""   # 6s polling
    telegram_backfill_count: int = 5       # startup'ta kaç eski mesaj yayınlansın


_settings: Settings | None = None


def get_settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = Settings()
        _validate_secrets(_settings)
    return _settings


def _validate_secrets(s: Settings) -> None:
    """Kritik secret'lar eksikse startup'ta uyar veya hata ver."""
    import sys, logging
    log = logging.getLogger("cryptoterminal.config")

    errors = []
    warnings = []

    if not s.jwt_secret:
        errors.append("JWT_SECRET tanımlanmamış. .env dosyasına ekle: JWT_SECRET=<random 64 hex char>")
    elif s.jwt_secret == "change-me-in-production-use-random-32-chars":
        errors.append("JWT_SECRET hâlâ default değerde. Güvenli random bir değer üret.")
    elif len(s.jwt_secret) < 32:
        warnings.append("JWT_SECRET çok kısa (min 32 karakter önerilir).")

    if not s.database_url or "ct_secret" in s.database_url:
        warnings.append("DATABASE_URL default credentials kullanıyor. Production'da değiştir.")

    if errors:
        for e in errors:
            log.critical("SECRET_ERROR: %s", e)
        print("\n[HATA] Kritik yapılandırma eksik:")
        for e in errors:
            print(f"  ✗ {e}")
        print("\nİpucu: python -c \"import secrets; print(secrets.token_hex(32))\" komutuyla random secret üret.\n")
        sys.exit(1)

    for w in warnings:
        log.warning("SECRET_WARNING: %s", w)
