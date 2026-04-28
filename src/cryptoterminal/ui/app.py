from __future__ import annotations

import asyncio

from textual.app import App, ComposeResult
from textual.binding import Binding
from textual.widgets import Input

from ..config.settings import Settings
from ..core import event_bus as events
from ..core.enums import ConnectionStatus, TradingMode
from ..core.event_bus import EventBus
from ..core.models import NormalizedNews, Ticker
from ..market.service import MarketDataService
from ..news.service import NewsService
from .command_panel import CommandPanel
from .market_panel import MarketPanel
from .news_panel import NewsPanel
from .position_panel import PositionPanel
from .status_bar import StatusBar


class TerminalApp(App):
    CSS = """
    Screen {
        layout: grid;
        grid-size: 1;
        grid-rows: 1 1fr 1fr;
    }

    #status {
        row-span: 1;
        column-span: 1;
    }

    #main-grid {
        layout: grid;
        grid-size: 2;
        grid-columns: 1fr 1fr;
        row-span: 2;
    }

    NewsPanel {
        row-span: 1;
    }

    MarketPanel {
        row-span: 1;
    }

    PositionPanel {
        row-span: 1;
    }

    CommandPanel {
        row-span: 1;
    }

    .flash-high {
        border: solid red;
    }
    """

    BINDINGS = [
        Binding("ctrl+c", "quit", "Quit", priority=True),
        Binding("escape", "focus_command", "Focus command"),
        Binding("f5", "panic", "PANIC"),
    ]

    TITLE = "CryptoTerminal v0.1"

    def __init__(
        self,
        bus: EventBus,
        settings: Settings,
        market_service: MarketDataService,
        news_service: NewsService,
        portfolio=None,
        risk_engine=None,
        execution_engine=None,
    ) -> None:
        super().__init__()
        self.bus = bus
        self.settings = settings
        self.market_service = market_service
        self.news_service = news_service
        self._portfolio = portfolio
        self._risk_engine = risk_engine
        self._execution_engine = execution_engine
        self._mode = TradingMode.PAPER

    def compose(self) -> ComposeResult:
        from textual.containers import Container

        yield StatusBar(id="status")
        with Container(id="main-grid"):
            yield NewsPanel(id="news-panel")
            yield MarketPanel(watchlist=self.settings.watchlist, id="market-panel")
            yield PositionPanel(id="position-panel")
            yield CommandPanel(id="command-panel")

    async def on_mount(self) -> None:
        # Event bus consumer başlat
        asyncio.create_task(self.bus.start(), name="event_bus")

        # Event handler'ları kaydet
        await self.bus.subscribe(events.NEWS_RECEIVED, self._on_news)
        await self.bus.subscribe(events.MARKET_TICKER_UPDATE, self._on_ticker)
        await self.bus.subscribe(events.MARKET_VOLUME_SPIKE, self._on_volume_spike)
        await self.bus.subscribe(events.SYSTEM_WS_DISCONNECTED, self._on_ws_disconnected)
        await self.bus.subscribe(events.SYSTEM_WS_RECONNECTED, self._on_ws_reconnected)
        await self.bus.subscribe(events.RISK_BLOCKED, self._on_risk_blocked)
        await self.bus.subscribe(events.ORDER_FILLED, self._on_order_filled)
        await self.bus.subscribe(events.ORDER_REJECTED, self._on_order_rejected)
        await self.bus.subscribe(events.SYSTEM_ERROR, self._on_system_error)

        # Servisler başlat
        asyncio.create_task(self.market_service.start(), name="market_data")
        asyncio.create_task(self.news_service.start(), name="news")

        # CLI import (circular import önlemek için burada)
        from ..cli.registry import CommandRegistry
        from ..cli.handlers import CommandHandlers

        self._cmd_registry = CommandRegistry()
        self._handlers = CommandHandlers(
            app=self,
            bus=self.bus,
            settings=self.settings,
            market_service=self.market_service,
            news_service=self.news_service,
        )
        # Modüller bağla
        self._handlers._portfolio = self._portfolio
        self._handlers._risk_engine = self._risk_engine
        self._handlers._execution_engine = self._execution_engine
        self._handlers.register_all(self._cmd_registry)

        # Ping loop başlat
        asyncio.create_task(self._ping_loop(), name="ping")

        # Komut girişine odaklan
        self.call_after_refresh(self._focus_input)

        # Başlangıç bakiyesini status bar'a yaz
        if self._portfolio:
            status = self.query_one("#status", StatusBar)
            status.balance = self._portfolio.balance.available_usdt

        cmd = self.query_one("#command-panel", CommandPanel)
        cmd.log_system("CryptoTerminal v0.1 started. Type 'help' for commands.")
        cmd.log_system(f"Mode: {self._mode.value} | Watchlist: {', '.join(self.settings.watchlist)}")

    def _focus_input(self) -> None:
        try:
            self.query_one("#cmd-input", Input).focus()
        except Exception:
            pass

    async def on_input_submitted(self, event: Input.Submitted) -> None:
        cmd_text = event.value.strip()
        event.input.value = ""

        if not cmd_text:
            return

        cmd = self.query_one("#command-panel", CommandPanel)
        cmd.log_message(f"> {cmd_text}", "info")

        # Alias genişletme
        from ..cli.aliases import AliasManager
        expanded = AliasManager.expand(cmd_text)
        if expanded != cmd_text:
            cmd.log_message(f"  → {expanded}", "system")
            cmd_text = expanded

        # Komut çalıştır
        if hasattr(self, "_cmd_registry"):
            from ..cli.parser import parse_command
            parsed = parse_command(cmd_text)
            if parsed:
                await self._cmd_registry.execute(parsed, cmd)
            else:
                cmd.log_error(f"Unknown command: '{cmd_text.split()[0]}'. Type 'help'.")

    # ── Event Handlers ─────────────────────────────────────────

    async def _on_news(self, payload: dict) -> None:
        news: NormalizedNews = payload["news"]
        panel = self.query_one("#news-panel", NewsPanel)
        self.call_from_thread(panel.add_news, news) if False else panel.add_news(news)

    async def _on_ticker(self, payload: dict) -> None:
        symbol: str = payload["symbol"]
        ticker: Ticker = payload["ticker"]
        panel = self.query_one("#market-panel", MarketPanel)
        panel.update_ticker(symbol, ticker)

        # Portfolio fiyatlarını güncelle (canlı PnL için)
        if self._portfolio:
            self._portfolio.update_price(symbol, ticker)
            pos = self._portfolio.get_position(symbol)
            if pos:
                pp = self.query_one("#position-panel", PositionPanel)
                pp.update_position(symbol, pos)
                pp.update_daily_pnl(self._portfolio.daily_pnl)

    async def _on_volume_spike(self, payload: dict) -> None:
        symbol: str = payload["symbol"]
        panel = self.query_one("#market-panel", MarketPanel)
        panel.mark_spike(symbol)
        cmd = self.query_one("#command-panel", CommandPanel)
        cmd.log_system(f"⚡ Volume spike on {symbol} ({payload.get('multiplier', 0):.1f}x avg)")

    async def _on_ws_disconnected(self, payload: dict) -> None:
        status = self.query_one("#status", StatusBar)
        status.ws_status = ConnectionStatus.DISCONNECTED
        cmd = self.query_one("#command-panel", CommandPanel)
        cmd.log_system("⚠ WebSocket disconnected. Reconnecting...")

    async def _on_ws_reconnected(self, payload: dict) -> None:
        status = self.query_one("#status", StatusBar)
        status.ws_status = ConnectionStatus.CONNECTED
        cmd = self.query_one("#command-panel", CommandPanel)
        cmd.log_system("✓ WebSocket connected.")

    async def _on_risk_blocked(self, payload: dict) -> None:
        cmd = self.query_one("#command-panel", CommandPanel)
        cmd.log_risk(f"BLOCKED — {payload.get('reason', 'risk check failed')}")

    async def _on_order_filled(self, payload: dict) -> None:
        cmd = self.query_one("#command-panel", CommandPanel)
        order = payload.get("order")
        if order:
            cmd.log_order(
                f"✓ Filled @ {order.fill_price} qty={order.quantity:.4f}"
            )

        # Position paneli güncelle
        if self._portfolio:
            pp = self.query_one("#position-panel", PositionPanel)
            symbol = order.symbol if order else payload.get("symbol")
            if symbol:
                pos = self._portfolio.get_position(symbol)
                pp.update_position(symbol, pos)  # None ise pozisyon kapandı
            pp.update_daily_pnl(self._portfolio.daily_pnl)
            pp.update_risk_stats(
                self._portfolio.balance.total_usdt,
                len(self._portfolio.get_positions()),
            )

            # Status bar bakiyeyi güncelle
            status = self.query_one("#status", StatusBar)
            status.balance = self._portfolio.balance.available_usdt

    async def _on_order_rejected(self, payload: dict) -> None:
        cmd = self.query_one("#command-panel", CommandPanel)
        reason = payload.get("reason", "unknown")
        cmd.log_error(f"✗ Order rejected: {reason}")

    async def _on_system_error(self, payload: dict) -> None:
        cmd = self.query_one("#command-panel", CommandPanel)
        cmd.log_error(f"SYSTEM ERROR: {payload.get('error', 'unknown')}")

    async def _ping_loop(self) -> None:
        while True:
            await asyncio.sleep(30)
            try:
                ms = await self.market_service.ping()
                status = self.query_one("#status", StatusBar)
                status.ping_ms = ms
            except Exception:
                pass

    def action_panic(self) -> None:
        cmd = self.query_one("#command-panel", CommandPanel)
        cmd.log_error("Use 'panic' command to confirm emergency close.")

    def action_focus_command(self) -> None:
        self._focus_input()

    def set_mode(self, mode: TradingMode) -> None:
        self._mode = mode
        status = self.query_one("#status", StatusBar)
        status.mode = mode
        if self._execution_engine:
            self._execution_engine.set_mode(mode)

    def update_balance(self, balance: float) -> None:
        status = self.query_one("#status", StatusBar)
        status.balance = balance

    def update_position(self, symbol: str, position) -> None:
        panel = self.query_one("#position-panel", PositionPanel)
        panel.update_position(symbol, position)
