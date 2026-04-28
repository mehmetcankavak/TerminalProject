"""UI önizleme — gerçek bağlantı olmadan ekranı gösterir."""
import asyncio
from datetime import datetime, timezone

from cryptoterminal.config.settings import Settings
from cryptoterminal.core.enums import ConnectionStatus, NewsPriority, PositionSide, TradingMode
from cryptoterminal.core.event_bus import EventBus
from cryptoterminal.core.models import NormalizedNews, Position, Ticker
from cryptoterminal.ui.app import TerminalApp
from cryptoterminal.market.service import MarketDataService
from cryptoterminal.news.service import NewsService


class MockMarketService(MarketDataService):
    def __init__(self, settings):
        self.bus = EventBus()
        self.settings = settings
        from cryptoterminal.market.stale import StaleDataChecker
        self.stale_checker = StaleDataChecker(10)
        self._tickers = {}
        self._orderbooks = {}
        self._watchlist = list(settings.watchlist)
        self._tasks = []
        self._running = False

    async def start(self): pass
    async def stop(self): pass
    async def ping(self): return 42
    def is_stale(self, sym): return False
    def get_watchlist(self): return self._watchlist


class MockNewsService(NewsService):
    def __init__(self, settings):
        self.bus = EventBus()
        self.settings = settings
        self._news_history = []
        self._running = False
        self._task = None
        self._adapters = []
        self._dedup = None
        self._last_check = {}
        self.MAX_HISTORY = 200

    async def start(self): pass
    async def stop(self): pass


async def run_preview():
    settings = Settings()
    bus = EventBus()

    market = MockMarketService(settings)
    news = MockNewsService(settings)

    # Demo veriler
    market._tickers = {
        "BTCUSDT": Ticker(symbol="BTCUSDT", last_price=67842.50, bid=67841.20, ask=67843.80,
                          spread=2.60, volume_24h=28451230, change_24h_pct=2.34,
                          high_24h=68100, low_24h=66200),
        "ETHUSDT": Ticker(symbol="ETHUSDT", last_price=3421.80, bid=3421.50, ask=3422.10,
                          spread=0.60, volume_24h=142100000, change_24h_pct=1.12,
                          high_24h=3500, low_24h=3350),
        "SOLUSDT": Ticker(symbol="SOLUSDT", last_price=187.42, bid=187.40, ask=187.44,
                          spread=0.04, volume_24h=891200000, change_24h_pct=8.71,
                          high_24h=195, low_24h=172),
    }

    demo_news = [
        NormalizedNews(id="n1", headline="SEC Approves Solana ETF Application from BlackRock",
                       source="cryptopanic", published_at=datetime(2026,3,8,14,22,15,tzinfo=timezone.utc),
                       received_at=datetime(2026,3,8,14,22,28,tzinfo=timezone.utc),
                       latency_ms=13000, related_symbols=["SOLUSDT"], priority=NewsPriority.HIGH),
        NormalizedNews(id="n2", headline="Binance Lists New Perpetual Contract: PEPEUSDT",
                       source="binance_announcements", published_at=datetime(2026,3,8,14,21,3,tzinfo=timezone.utc),
                       received_at=datetime(2026,3,8,14,21,5,tzinfo=timezone.utc),
                       latency_ms=2000, related_symbols=["PEPEUSDT"], priority=NewsPriority.MED),
        NormalizedNews(id="n3", headline="Bitcoin whale moves $500M to cold storage",
                       source="cryptopanic", published_at=datetime(2026,3,8,14,20,0,tzinfo=timezone.utc),
                       received_at=datetime(2026,3,8,14,20,8,tzinfo=timezone.utc),
                       latency_ms=8000, related_symbols=["BTCUSDT"], priority=NewsPriority.LOW),
    ]
    news._news_history = demo_news

    demo_position = Position(
        symbol="SOLUSDT", side=PositionSide.LONG, quantity=2.5,
        entry_price=185.20, current_price=187.42, leverage=1,
        stop_loss=179.45,
    )

    app = TerminalApp(bus=bus, settings=settings, market_service=market, news_service=news)
    app._mode = TradingMode.PAPER

    # Mount sonrası demo verilerini yükle
    async def inject_demo():
        await asyncio.sleep(1.5)

        # Status bar
        from cryptoterminal.ui.status_bar import StatusBar
        status = app.query_one("#status", StatusBar)
        status.ws_status = ConnectionStatus.CONNECTED
        status.ping_ms = 42
        status.mode = TradingMode.PAPER
        status.balance = 10000.0

        # Market panel
        from cryptoterminal.ui.market_panel import MarketPanel
        mp = app.query_one("#market-panel", MarketPanel)
        for sym, ticker in market._tickers.items():
            mp.update_ticker(sym, ticker)
        mp.mark_spike("SOLUSDT")

        # News panel
        from cryptoterminal.ui.news_panel import NewsPanel
        np = app.query_one("#news-panel", NewsPanel)
        for n in reversed(demo_news):
            np.add_news(n)

        # Position panel
        from cryptoterminal.ui.position_panel import PositionPanel
        pp = app.query_one("#position-panel", PositionPanel)
        pp.update_position("SOLUSDT", demo_position)
        pp.update_daily_pnl(12.30)
        pp.update_risk_stats(10000, 23)
        pp._max_positions = 3

        # Command log
        from cryptoterminal.ui.command_panel import CommandPanel
        cmd = app.query_one("#command-panel", CommandPanel)
        cmd.log_system("CryptoTerminal v0.1 — DEMO MODE")
        cmd.log_message("> buy SOLUSDT 50 market", "info")
        cmd.log_message("✓ Risk check passed", "success")
        cmd.log_message("→ Order submitted", "system")
        cmd.log_order("✓ Filled @ 187.42 qty=2.5")
        cmd.log_message("Position opened: SOLUSDT LONG", "success")

        await asyncio.sleep(1.5)
        # Screenshot al
        app.save_screenshot("preview.svg")
        print("✓ Screenshot kaydedildi: preview.svg")
        app.exit()

    asyncio.create_task(inject_demo())
    await app.run_async()


if __name__ == "__main__":
    asyncio.run(run_preview())
