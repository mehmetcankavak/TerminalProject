from __future__ import annotations

from rich.table import Table
from textual.app import ComposeResult
from textual.widget import Widget
from textual.widgets import Static

from ..core.models import Position
from ..utils.formatting import fmt_pct, fmt_price, fmt_usd


class PositionPanel(Widget):
    DEFAULT_CSS = """
    PositionPanel {
        border: solid $primary;
        height: 100%;
        overflow: hidden;
    }
    PositionPanel > Static {
        height: 100%;
        background: $surface;
        padding: 0 1;
    }
    """

    BORDER_TITLE = "💼 POSITIONS & PnL"

    def __init__(self, **kwargs) -> None:
        super().__init__(**kwargs)
        self._positions: dict[str, Position] = {}
        self._daily_pnl: float = 0.0
        self._max_positions: int = 3
        self._balance: float = 0.0
        self._risk_used_pct: float = 0.0

    def compose(self) -> ComposeResult:
        yield Static(id="position-table", markup=True)

    def update_position(self, symbol: str, position: Position | None) -> None:
        if position is None:
            self._positions.pop(symbol, None)
        else:
            self._positions[symbol] = position
        self._refresh()

    def update_daily_pnl(self, pnl: float) -> None:
        self._daily_pnl = pnl
        self._refresh()

    def update_risk_stats(self, balance: float, risk_used_pct: float) -> None:
        self._balance = balance
        self._risk_used_pct = risk_used_pct
        self._refresh()

    def _refresh(self) -> None:
        static = self.query_one("#position-table", Static)

        if not self._positions:
            daily_color = "green" if self._daily_pnl >= 0 else "red"
            text = (
                f"[dim]No open positions[/dim]\n\n"
                f"Daily PnL: [{daily_color}]{fmt_usd(self._daily_pnl)}[/{daily_color}]\n"
                f"Open: 0/{self._max_positions}"
            )
            static.update(text)
            return

        table = Table(show_header=True, header_style="bold cyan", box=None, padding=(0, 1))
        table.add_column("Symbol", min_width=8)
        table.add_column("Side", min_width=5)
        table.add_column("Qty", justify="right", min_width=8)
        table.add_column("Entry", justify="right", min_width=10)
        table.add_column("PnL", justify="right", min_width=10)
        table.add_column("SL", min_width=6)

        for symbol, pos in self._positions.items():
            pnl = pos.unrealized_pnl
            pnl_color = "green" if pnl >= 0 else "red"
            side_color = "green" if pos.side.value == "LONG" else "red"

            sl_text = "--"
            if pos.stop_loss:
                sl_pct = abs((pos.stop_loss - pos.entry_price) / pos.entry_price * 100)
                sl_text = f"[red]{sl_pct:.1f}%[/red]"

            table.add_row(
                f"[bold]{symbol}[/bold]",
                f"[{side_color}]{pos.side.value}[/{side_color}]",
                f"{pos.quantity:.4f}",
                fmt_price(pos.entry_price),
                f"[{pnl_color}]{fmt_usd(pnl)} ({fmt_pct(pos.unrealized_pnl_pct)})[/{pnl_color}]",
                sl_text,
            )

        daily_color = "green" if self._daily_pnl >= 0 else "red"
        summary = (
            f"\nDaily PnL: [{daily_color}]{fmt_usd(self._daily_pnl)}[/{daily_color}]"
            f"  Open: {len(self._positions)}/{self._max_positions}"
            f"  Risk: {self._risk_used_pct:.0f}%"
        )

        from rich.console import Group
        from rich.text import Text

        static.update(Group(table, Text.from_markup(summary)))
