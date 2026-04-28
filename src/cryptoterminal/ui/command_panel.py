from __future__ import annotations

from textual.app import ComposeResult
from textual.reactive import reactive
from textual.widget import Widget
from textual.widgets import Input, RichLog

from ..utils.time import format_timestamp
from ..utils.time import utcnow


class CommandPanel(Widget):
    DEFAULT_CSS = """
    CommandPanel {
        border: solid $primary;
        height: 100%;
        overflow: hidden;
    }
    CommandPanel > RichLog {
        height: 1fr;
        background: $surface;
        padding: 0 1;
    }
    CommandPanel > Input {
        height: 3;
        background: $surface;
        border: solid $accent;
    }
    """

    BORDER_TITLE = "⌨️  COMMAND & LOG"

    def compose(self) -> ComposeResult:
        yield RichLog(id="cmd-log", wrap=True, markup=True, highlight=False)
        yield Input(placeholder="> enter command... (type 'help')", id="cmd-input")

    def log_message(self, msg: str, level: str = "info") -> None:
        log = self.query_one("#cmd-log", RichLog)
        ts = format_timestamp(utcnow())
        color_map = {
            "info": "white",
            "success": "green",
            "error": "red",
            "warning": "yellow",
            "system": "cyan",
        }
        color = color_map.get(level, "white")
        log.write(f"[dim]{ts}[/dim] [{color}]{msg}[/{color}]")

    def log_order(self, msg: str) -> None:
        self.log_message(msg, "success")

    def log_error(self, msg: str) -> None:
        self.log_message(f"✗ {msg}", "error")

    def log_risk(self, msg: str) -> None:
        self.log_message(f"[RISK] {msg}", "warning")

    def log_system(self, msg: str) -> None:
        self.log_message(msg, "system")

    def clear_log(self) -> None:
        log = self.query_one("#cmd-log", RichLog)
        log.clear()

    def focus_input(self) -> None:
        self.query_one("#cmd-input", Input).focus()
