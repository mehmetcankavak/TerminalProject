from __future__ import annotations

from textual.app import ComposeResult
from textual.reactive import reactive
from textual.widget import Widget
from textual.widgets import Static

from ..core.enums import ConnectionStatus, TradingMode
from ..utils.formatting import fmt_usd


class StatusBar(Widget):
    DEFAULT_CSS = """
    StatusBar {
        height: 1;
        background: $panel;
        color: $text;
        padding: 0 1;
    }
    """

    ws_status: reactive[ConnectionStatus] = reactive(ConnectionStatus.DISCONNECTED)
    ping_ms: reactive[int] = reactive(0)
    mode: reactive[TradingMode] = reactive(TradingMode.PAPER)
    balance: reactive[float] = reactive(0.0)

    def render(self) -> str:
        ws_color = {
            ConnectionStatus.CONNECTED: "green",
            ConnectionStatus.DISCONNECTED: "red",
            ConnectionStatus.RECONNECTING: "yellow",
        }[self.ws_status]

        ws_icon = "●" if self.ws_status == ConnectionStatus.CONNECTED else "○"
        ws_text = f"[{ws_color}]{ws_icon} WS: {self.ws_status.value}[/{ws_color}]"

        ping_text = f"Ping: {self.ping_ms}ms" if self.ping_ms > 0 else "Ping: --"

        mode_color = {
            TradingMode.PAPER: "blue",
            TradingMode.LIVE: "orange1",
            TradingMode.LOCKED: "red",
        }[self.mode]
        mode_text = f"[{mode_color}]Mode: {self.mode.value}[/{mode_color}]"

        balance_text = f"USDT: {fmt_usd(self.balance)}"

        return f" {ws_text}  │  {ping_text}  │  {mode_text}  │  {balance_text}"
