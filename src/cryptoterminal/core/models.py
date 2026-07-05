from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from pydantic import BaseModel, Field

from .enums import (
    ConnectionStatus,
    NewsPriority,
    OrderSide,
    OrderStatus,
    OrderType,
    PositionSide,
    TradingMode,
)


class Ticker(BaseModel):
    symbol: str
    last_price: float
    bid: float
    ask: float
    spread: float
    volume_24h: float
    change_24h_pct: float
    high_24h: float
    low_24h: float
    funding_rate: Optional[float] = None
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    source: str = "binance"


class OrderBookLevel(BaseModel):
    price: float
    quantity: float


class OrderBook(BaseModel):
    symbol: str
    bids: list[OrderBookLevel]  # highest first
    asks: list[OrderBookLevel]  # lowest first
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    @property
    def spread(self) -> float:
        if self.bids and self.asks:
            return self.asks[0].price - self.bids[0].price
        return 0.0

    @property
    def spread_pct(self) -> float:
        if self.bids and self.asks and self.bids[0].price > 0:
            return (self.spread / self.bids[0].price) * 100
        return 0.0


class MentionedAsset(BaseModel):
    asset_id: str
    asset_type: str  # crypto | equity | etf | commodity | forex | index | stablecoin
    display_name: str
    match_type: str  # exact_ticker_explicit | exact_ticker | alias | brand | theme_primary | theme_secondary
    confidence: float = 0.0
    tradable_symbols: list[str] = Field(default_factory=list)
    matched_text: Optional[str] = None


class NormalizedNews(BaseModel):
    id: str
    headline: str
    source: str
    source_priority: int = 3  # 1 = en güvenilir, 5 = en az
    source_tier: str = "fallback"  # official | fast | fallback
    is_official: bool = False
    is_stream: bool = False
    event_type: str = "general"
    cluster_key: Optional[str] = None
    corroboration_count: int = 1
    corroborating_sources: list[str] = Field(default_factory=list)
    first_source: Optional[str] = None
    published_at: datetime
    received_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    latency_ms: int = 0
    # --- backward-compatible field (populated from mentioned_assets) ---
    related_symbols: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    priority: NewsPriority = NewsPriority.LOW
    url: Optional[str] = None
    raw_content: Optional[str] = None
    # --- enriched entity resolution fields ---
    primary_symbol: Optional[str] = None
    primary_asset_id: Optional[str] = None
    mentioned_assets: list[MentionedAsset] = Field(default_factory=list)
    themes: list[str] = Field(default_factory=list)
    confidence: float = 0.0


class Order(BaseModel):
    internal_id: str
    user_id: Optional[int] = None
    exchange_id: Optional[str] = None
    symbol: str
    side: OrderSide
    order_type: OrderType
    quantity: float
    price: Optional[float] = None  # limit emirler için
    leverage: int = 1
    notional_usd: float = 0.0
    status: OrderStatus = OrderStatus.CREATED
    risk_approved: Optional[bool] = None
    risk_reject_reason: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    submitted_at: Optional[datetime] = None
    filled_at: Optional[datetime] = None
    fill_price: Optional[float] = None
    fees: float = 0.0
    error: Optional[str] = None
    stop_price: Optional[float] = None  # stop-loss tetik fiyatı
    take_profit_price: Optional[float] = None  # take-profit tetik fiyatı
    force: bool = False  # duplicate blocker bypass


class Fill(BaseModel):
    order_id: str
    symbol: str
    side: OrderSide
    quantity: float
    price: float
    fees: float = 0.0
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class Position(BaseModel):
    symbol: str
    side: PositionSide
    quantity: float
    entry_price: float
    current_price: float = 0.0
    leverage: int = 1
    stop_loss: Optional[float] = None
    take_profit: Optional[float] = None
    opened_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    realized_pnl: float = 0.0
    accumulated_funding: float = 0.0  # toplam ödenen/alınan funding fee (paper mode)
    # ── LIVE borsa meta alanları (borsa destekliyorsa)
    liquidation_price: Optional[float] = None   # pozisyonun likide olduğu fiyat
    margin_mode: Optional[str] = None            # "cross" | "isolated"
    margin_used: Optional[float] = None          # initial/isolated margin (USD)
    # ── Trailing stop (process-bound, restart'ta kaybolur)
    trailing_distance: Optional[float] = None    # USD cinsinden mesafe; None → kapalı
    trailing_peak: Optional[float] = None        # long: gördüğü en yüksek; short: en düşük

    @property
    def unrealized_pnl(self) -> float:
        direction = 1 if self.side == PositionSide.LONG else -1
        return (self.current_price - self.entry_price) * self.quantity * direction

    @property
    def unrealized_pnl_pct(self) -> float:
        if self.entry_price == 0:
            return 0.0
        direction = 1 if self.side == PositionSide.LONG else -1
        return ((self.current_price - self.entry_price) / self.entry_price) * 100 * direction * self.leverage

    @property
    def notional_usd(self) -> float:
        return self.quantity * self.entry_price


class Balance(BaseModel):
    total_usdt: float
    available_usdt: float
    locked_usdt: float = 0.0
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class RiskCheckResult(BaseModel):
    approved: bool
    reason: Optional[str] = None
    checks: dict[str, str] = Field(default_factory=dict)


class SystemStatus(BaseModel):
    ws_status: ConnectionStatus = ConnectionStatus.DISCONNECTED
    ws_ping_ms: Optional[int] = None
    mode: TradingMode = TradingMode.PAPER
    balance_usdt: float = 0.0
    last_update: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
