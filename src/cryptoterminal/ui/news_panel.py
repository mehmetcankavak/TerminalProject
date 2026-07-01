from __future__ import annotations

from textual.app import ComposeResult
from textual.widget import Widget
from textual.widgets import RichLog

from ..core.enums import NewsPriority
from ..core.models import NormalizedNews
from ..utils.time import format_timestamp, latency_display


class NewsPanel(Widget):
    DEFAULT_CSS = """
    NewsPanel {
        border: solid $primary;
        height: 100%;
        overflow: hidden;
    }
    NewsPanel > RichLog {
        height: 100%;
        background: $surface;
        padding: 0 1;
    }
    """

    BORDER_TITLE = "📰 NEWS FEED"

    def compose(self) -> ComposeResult:
        yield RichLog(id="news-log", wrap=True, highlight=False, markup=True)

    def add_news(self, news: NormalizedNews) -> None:
        log = self.query_one("#news-log", RichLog)

        ts = format_timestamp(news.received_at)
        lat = latency_display(news.latency_ms)

        color_map = {
            NewsPriority.HIGH: "bold red",
            NewsPriority.MED: "yellow",
            NewsPriority.LOW: "white",
        }
        color = color_map[news.priority]

        lat_color = "green"
        if news.latency_ms > 30_000:
            lat_color = "yellow"
        if news.latency_ms > 120_000:
            lat_color = "dim"

        # --- Varlık satırı ---
        asset_parts: list[str] = []

        # Birincil varlık — en belirgin şekilde göster
        if news.primary_asset_id:
            sym = news.primary_symbol or news.primary_asset_id
            # Varlık tipine göre renk: crypto=cyan, equity/etf=magenta, commodity/index=yellow
            primary_ma = next(
                (ma for ma in news.mentioned_assets if ma.asset_id == news.primary_asset_id),
                None,
            )
            atype = primary_ma.asset_type if primary_ma else "crypto"
            sym_color = (
                "magenta" if atype in ("equity", "etf")
                else "yellow" if atype in ("commodity", "index")
                else "cyan"
            )
            conf_pct = int((primary_ma.confidence if primary_ma else news.confidence) * 100)
            asset_parts.append(f"[bold {sym_color}]{sym}[/bold {sym_color}] [dim]{conf_pct}%[/dim]")

        # Ek varlıklar (primary dışı, max 3)
        extras = [
            ma for ma in news.mentioned_assets
            if ma.asset_id != news.primary_asset_id
            and ma.match_type not in ("theme_primary", "theme_secondary")
        ][:3]
        for ma in extras:
            extra_sym = ma.tradable_symbols[0] if ma.tradable_symbols else ma.asset_id
            asset_parts.append(f"[dim cyan]{extra_sym}[/dim cyan]")

        # Temalar
        theme_str = ""
        if news.themes:
            tags = " ".join(f"[dim green]{t}[/dim green]" for t in news.themes[:4])
            theme_str = f"  {tags}"

        asset_str = "  ".join(asset_parts) if asset_parts else ""

        # Eski related_symbols fallback (entity resolution boşsa)
        if not asset_str and news.related_symbols:
            asset_str = f"[dim cyan]{' '.join(news.related_symbols[:3])}[/dim cyan]"

        # Satır 1: zaman + latency + varlık + temalar
        meta_line = f"[dim]{ts}[/dim] [{lat_color}]{lat}[/{lat_color}]"
        if asset_str:
            meta_line += f"  {asset_str}"
        if theme_str:
            meta_line += theme_str

        log.write(
            f"{meta_line}\n"
            f"[{color}]{news.headline[:100]}[/{color}]\n"
            f"[dim]{news.source.upper()}  {news.priority.value}[/dim]\n"
        )

        if news.priority == NewsPriority.HIGH:
            self.add_class("flash-high")
            self.set_timer(1.0, lambda: self.remove_class("flash-high"))
