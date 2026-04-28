from __future__ import annotations

from rich.table import Table
from textual.app import ComposeResult
from textual.widget import Widget
from textual.widgets import Static

from ..core.models import Ticker
from ..utils.formatting import fmt_pct, fmt_price, fmt_volume


class MarketPanel(Widget):
    DEFAULT_CSS = """
    MarketPanel {
        border: solid $primary;
        height: 100%;
        overflow: hidden;
    }
    MarketPanel > Static {
        height: 100%;
        background: $surface;
    }
    """

    BORDER_TITLE = "📊 WATCHLIST"

    def __init__(self, watchlist: list[str], **kwargs) -> None:
        super().__init__(**kwargs)
        self._tickers: dict[str, Ticker] = {}
        self._spikes: set[str] = set()
        self._watchlist = watchlist

    def compose(self) -> ComposeResult:
        yield Static(id="market-table", markup=True)

    def update_ticker(self, symbol: str, ticker: Ticker) -> None:
        self._tickers[symbol] = ticker
        self._refresh_table()

    def mark_spike(self, symbol: str) -> None:
        self._spikes.add(symbol)
        self.set_timer(30.0, lambda: self._spikes.discard(symbol))
        self._refresh_table()

    def _refresh_table(self) -> None:
        table = Table(
            show_header=True,
            header_style="bold cyan",
            box=None,
            padding=(0, 1),
            expand=True,
        )
        table.add_column("Symbol", style="bold white", min_width=10)
        table.add_column("Price", justify="right", min_width=12)
        table.add_column("24h%", justify="right", min_width=8)
        table.add_column("Volume", justify="right", min_width=10)
        table.add_column("", min_width=2)

        for symbol in self._watchlist:
            ticker = self._tickers.get(symbol)
            if not ticker:
                table.add_row(symbol, "--", "--", "--", "")
                continue

            pct = ticker.change_24h_pct
            pct_color = "green" if pct >= 0 else "red"
            price_color = "green" if pct >= 0 else "red"

            spike_icon = "[yellow]▲[/yellow]" if symbol in self._spikes else ""

            table.add_row(
                f"[bold]{symbol}[/bold]",
                f"[{price_color}]{fmt_price(ticker.last_price)}[/{price_color}]",
                f"[{pct_color}]{fmt_pct(pct)}[/{pct_color}]",
                fmt_volume(ticker.volume_24h),
                spike_icon,
            )

        static = self.query_one("#market-table", Static)
        static.update(table)
