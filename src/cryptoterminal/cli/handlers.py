from __future__ import annotations

from typing import TYPE_CHECKING

import structlog

from ..config.settings import Settings
from ..core.enums import TradingMode
from ..core.event_bus import EventBus
from ..market.service import MarketDataService
from ..news.service import NewsService
from ..utils.formatting import fmt_price, fmt_usd
from ..utils.time import format_timestamp, utcnow
from .aliases import AliasManager
from .parser import (
    ParsedCommand,
    parse_amount_usd,
    parse_leverage,
    parse_pct_or_price,
    resolve_symbol,
)
from .registry import CommandRegistry

if TYPE_CHECKING:
    from ..ui.app import TerminalApp
    from ..ui.command_panel import CommandPanel

logger = structlog.get_logger(__name__)

HELP_TEXT = """
[bold cyan]CryptoTerminal Commands[/bold cyan]

[yellow]MARKET DATA[/yellow]
  watch <symbols>          Add to watchlist (e.g. watch BTC ETH SOL)
  unwatch <symbol>         Remove from watchlist
  ticker <symbol>          Detailed price info
  book <symbol> [depth]    Order book (default depth: 10)

[yellow]NEWS[/yellow]
  news [count]             Show recent news (default: 10)
  news <symbol>            Filter news by coin

[yellow]ORDERS[/yellow]
  buy <sym> <usd> market|limit [price]
  sell <sym> <usd> market|limit [price]
  long <sym> <usd> <leverage>
  short <sym> <usd> <leverage>
  close <symbol>|all
  sl <symbol> <pct%>|<price>
  tp <symbol> <pct%>|<price>
  orders                   Open orders
  cancel <id>|<sym>|all

[yellow]PORTFOLIO[/yellow]
  positions | pos          Open positions
  pnl [symbol]             PnL summary
  balance | bal            Account balance
  history [count]          Trade history

[yellow]RISK[/yellow]
  risk                     Risk summary
  limits                   Active limits

[yellow]HESAPLAMA[/yellow]
  size <sym> <bal> <risk%> [sl=<p>]  Position sizing (kaç lot alınabilir)
  dca <sym> <side> <usd> <n>          DCA — toplamı N eşit emre böl
  hedge <sym> [usd=<amt>]             Hedge — ters pozisyon aç

[yellow]SYSTEM[/yellow]
  panic                    EMERGENCY CLOSE ALL
  status                   System status
  mode paper|live          Switch trading mode
  ping                     Exchange latency
  clear                    Clear log
  alias <name> <cmd>       Set alias
  unalias <name>           Remove alias
  aliases                  List aliases
  bind <key> <cmd>         Set key binding
  bindings                 List bindings
  help [command]           This help
  quit | exit              Quit terminal
"""


class CommandHandlers:
    def __init__(
        self,
        app: "TerminalApp",
        bus: EventBus,
        settings: Settings,
        market_service: MarketDataService,
        news_service: NewsService,
    ) -> None:
        self.app = app
        self.bus = bus
        self.settings = settings
        self.market_service = market_service
        self.news_service = news_service
        self._portfolio = None  # PortfolioManager — Faz 3'te eklenir
        self._risk_engine = None  # RiskEngine — Faz 3'te eklenir
        self._execution_engine = None  # ExecutionEngine — Faz 3'te eklenir

    def register_all(self, registry: CommandRegistry) -> None:
        registry.register("watch", self.cmd_watch, "watch <symbols...>")
        registry.register("unwatch", self.cmd_unwatch, "unwatch <symbol>")
        registry.register("ticker", self.cmd_ticker, "ticker <symbol>")
        registry.register("book", self.cmd_book, "book <symbol> [depth]")
        registry.register("news", self.cmd_news, "news [count|symbol]")
        registry.register("testnews", self.cmd_testnews, "testnews  — inject sample news to panel")
        registry.register("status", self.cmd_status, "status")
        registry.register("ping", self.cmd_ping, "ping")
        registry.register("clear", self.cmd_clear, "clear")
        registry.register("help", self.cmd_help, "help [command]")
        registry.register("mode", self.cmd_mode, "mode paper|live")
        registry.register("alias", self.cmd_alias, "alias <name> <command>")
        registry.register("unalias", self.cmd_unalias, "unalias <name>")
        registry.register("aliases", self.cmd_aliases, "aliases")
        registry.register("bind", self.cmd_bind, "bind <key> <command>")
        registry.register("unbind", self.cmd_unbind, "unbind <key>")
        registry.register("bindings", self.cmd_bindings, "bindings")

        # Emir komutları (Faz 3'te tam implement)
        for cmd in ["buy", "sell", "long", "short", "close", "sl", "tp",
                    "orders", "cancel", "positions", "pos", "pnl",
                    "balance", "bal", "history", "risk", "limits", "panic",
                    "quit", "exit", "unlock"]:
            registry.register(cmd, self._not_implemented_yet, f"{cmd} ...")

        # Emir ve risk komutlarını şimdi bağla
        registry.register("buy", self.cmd_buy, "buy <sym> <usd> market|limit [price]")
        registry.register("sell", self.cmd_sell, "sell <sym> <usd> market|limit [price]")
        registry.register("long", self.cmd_long, "long <sym> <margin_usd> <lev> [@<limit>] [sl=<px>] [tp=<px>]  — örn: long BTC 100 5 = $100 marjin × 5x = $500 pozisyon")
        registry.register("short", self.cmd_short, "short <sym> <margin_usd> <lev> [@<limit>] [sl=<px>] [tp=<px>]  — örn: short ETH 100 5 = $100 marjin × 5x = $500 pozisyon")
        registry.register("close", self.cmd_close, "close <symbol>|all")
        registry.register("reduce", self.cmd_reduce, "reduce <symbol> <pct%>|<usd>")
        registry.register("reverse", self.cmd_reverse, "reverse <symbol> [leverage]")
        registry.register("be", self.cmd_be, "be <symbol>  — move SL to entry (break-even)")
        registry.register("sl", self.cmd_sl, "sl <symbol> <pct%>|<price>")
        registry.register("tp", self.cmd_tp, "tp <symbol> <pct%>|<price>")
        registry.register("orders", self.cmd_orders, "orders")
        registry.register("cancel", self.cmd_cancel, "cancel <id>|<sym>|all")
        registry.register("positions", self.cmd_positions, "positions")
        registry.register("pos", self.cmd_positions, "pos")
        registry.register("pnl", self.cmd_pnl, "pnl [symbol]")
        registry.register("balance", self.cmd_balance, "balance")
        registry.register("bal", self.cmd_balance, "bal")
        registry.register("history", self.cmd_history, "history [count]")
        registry.register("risk", self.cmd_risk, "risk")
        registry.register("limits", self.cmd_limits, "limits")
        registry.register("panic", self.cmd_panic, "panic")
        registry.register("quit", self.cmd_quit, "quit")
        registry.register("exit", self.cmd_quit, "exit")
        registry.register("unlock", self.cmd_unlock, "unlock — risk engine kilidini aç")
        registry.register("trail", self.cmd_trail, "trail <symbol> <distance>|off  — trailing stop")
        registry.register("transfer", self.cmd_transfer, "transfer <usd> spot|perp  — HL spot↔perp")
        registry.register("hl-status", self.cmd_hl_status, "hl-status")
        registry.register("mode", self.cmd_mode, "mode [paper|hyperliquid]")
        registry.register("size", self.cmd_size, "size <sym> <bakiye> <risk%> [sl=<fiyat>]")
        registry.register("dca", self.cmd_dca, "dca <sym> <side> <total_usd> <orders> [leverage=<n>]")
        registry.register("hedge", self.cmd_hedge, "hedge <sym> [usd=<amount>]")

    # ── Market Data ─────────────────────────────────────────────

    async def cmd_watch(self, parsed: ParsedCommand, cmd: "CommandPanel") -> None:
        if not parsed.args:
            cmd.log_error("Usage: watch <symbols...>")
            return
        for sym in parsed.args:
            symbol = resolve_symbol(sym)
            await self.market_service.add_symbol(symbol)
            cmd.log_message(f"✓ Watching {symbol}", "success")

    async def cmd_unwatch(self, parsed: ParsedCommand, cmd: "CommandPanel") -> None:
        if not parsed.args:
            cmd.log_error("Usage: unwatch <symbol>")
            return
        symbol = resolve_symbol(parsed.args[0])
        await self.market_service.remove_symbol(symbol)
        cmd.log_message(f"✓ Removed {symbol} from watchlist", "success")

    async def cmd_ticker(self, parsed: ParsedCommand, cmd: "CommandPanel") -> None:
        if not parsed.args:
            cmd.log_error("Usage: ticker <symbol>")
            return
        symbol = resolve_symbol(parsed.args[0])
        ticker = self.market_service.get_ticker(symbol)
        if not ticker:
            cmd.log_error(f"No data for {symbol}. Add to watchlist: watch {symbol[:-4]}")
            return

        stale = "[dim][STALE][/dim] " if self.market_service.is_stale(symbol) else ""
        cmd.log_message(
            f"{stale}[bold]{symbol}[/bold]  Last: [cyan]{fmt_price(ticker.last_price)}[/cyan]"
            f"  Bid: {fmt_price(ticker.bid)}  Ask: {fmt_price(ticker.ask)}"
            f"  Spread: {fmt_price(ticker.spread)}"
            f"  24h: {'[green]' if ticker.change_24h_pct >= 0 else '[red]'}"
            f"{ticker.change_24h_pct:+.2f}%"
            f"{'[/green]' if ticker.change_24h_pct >= 0 else '[/red]'}"
            f"  Vol: {ticker.volume_24h:,.0f}",
            "info",
        )

    async def cmd_book(self, parsed: ParsedCommand, cmd: "CommandPanel") -> None:
        if not parsed.args:
            cmd.log_error("Usage: book <symbol> [depth]")
            return
        symbol = resolve_symbol(parsed.args[0])
        depth = int(parsed.args[1]) if len(parsed.args) > 1 else 10

        ob = self.market_service.get_orderbook(symbol)
        if not ob:
            cmd.log_message(f"Fetching orderbook for {symbol}...", "system")
            return

        cmd.log_message(f"[bold]{symbol} Orderbook[/bold]  Spread: {fmt_price(ob.spread)}", "info")
        cmd.log_message("[red]ASK[/red]", "info")
        for ask in reversed(ob.asks[:depth]):
            cmd.log_message(f"  [red]{fmt_price(ask.price)}[/red]  {ask.quantity:.4f}", "info")
        cmd.log_message(f"  ──── spread: {fmt_price(ob.spread)} ────", "info")
        for bid in ob.bids[:depth]:
            cmd.log_message(f"  [green]{fmt_price(bid.price)}[/green]  {bid.quantity:.4f}", "info")
        cmd.log_message("[green]BID[/green]", "info")

    # ── News ─────────────────────────────────────────────────────

    async def cmd_news(self, parsed: ParsedCommand, cmd: "CommandPanel") -> None:
        symbol = None
        count = 10
        if parsed.args:
            try:
                count = int(parsed.args[0])
            except ValueError:
                symbol = resolve_symbol(parsed.args[0])

        items = self.news_service.get_recent(count=count, symbol=symbol)
        if not items:
            cmd.log_message("No news available yet.", "system")
            return

        from ..utils.time import latency_display, format_timestamp

        for news in items:
            color = {"HIGH": "red", "MED": "yellow", "LOW": "white"}[news.priority.value]
            lat = latency_display(news.latency_ms)

            # Varlık + tema bilgisi
            asset_tag = ""
            if news.primary_asset_id:
                sym = news.primary_symbol or news.primary_asset_id
                conf = int(news.confidence * 100)
                asset_tag = f"  [cyan]{sym}[/cyan][dim] {conf}%[/dim]"
            if news.themes:
                asset_tag += "  [dim green]" + " ".join(news.themes[:3]) + "[/dim green]"

            cmd.log_message(
                f"[dim]{format_timestamp(news.received_at)} {lat}[/dim]{asset_tag}\n"
                f"  [{color}]{news.headline[:90]}[/{color}]  [dim]{news.source.upper()}[/dim]",
                "info",
            )

    async def cmd_testnews(self, parsed: ParsedCommand, cmd: "CommandPanel") -> None:
        """Panel'e örnek haberler enjekte eder — entity resolution'ın çalıştığını doğrulamak için."""
        from datetime import datetime, timezone
        from ..core.models import NormalizedNews
        from ..core import event_bus as events
        from ..news.normalize import resolve_entities, determine_priority, extract_tags

        sample_headlines = [
            "Bitcoin ETF sees record $1B daily inflows",
            "Pudgy Penguins listing announced on Binance",
            "Coinbase shares jump 8% after strong earnings beat",
            "Iran threatens to close the Strait of Hormuz",
            "Fed minutes signal sticky inflation, rate cut delayed",
            "MicroStrategy buys another 5000 BTC for corporate treasury",
            "Ethereum Pectra upgrade goes live on mainnet",
            "SEC files lawsuit against major crypto exchange",
        ]

        for headline in sample_headlines:
            r = resolve_entities(headline)
            now = datetime.now(timezone.utc)
            news = NormalizedNews(
                id=f"test_{abs(hash(headline)) % 99999}",
                headline=headline,
                source="TESTNEWS",
                source_priority=3,
                published_at=now,
                received_at=now,
                latency_ms=0,
                related_symbols=r.related_symbols,
                tags=extract_tags(headline),
                priority=determine_priority(headline),
                primary_symbol=r.primary_symbol,
                primary_asset_id=r.primary_asset_id,
                mentioned_assets=r.mentioned_assets,
                themes=r.themes,
                confidence=r.confidence,
            )
            await self.bus.publish(events.NEWS_RECEIVED, {"news": news})

        cmd.log_message(f"[green]{len(sample_headlines)} test haberi panel'e gönderildi.[/green]", "system")

    # ── System ───────────────────────────────────────────────────

    async def cmd_status(self, parsed: ParsedCommand, cmd: "CommandPanel") -> None:
        watchlist = self.market_service.get_watchlist()
        cmd.log_message(
            f"[bold]System Status[/bold]\n"
            f"  Mode: [cyan]{self.app._mode.value}[/cyan]\n"
            f"  Watchlist: {', '.join(watchlist)}\n"
            f"  Exchange: {self.settings.exchange} "
            f"({'testnet' if self.settings.exchange_testnet else 'mainnet'})\n"
            f"  News sources: {self.settings.news_sources}",
            "info",
        )
        for sym in watchlist:
            stale = "[red][STALE][/red]" if self.market_service.is_stale(sym) else "[green]OK[/green]"
            cmd.log_message(f"  {sym}: {stale}", "info")

    async def cmd_ping(self, parsed: ParsedCommand, cmd: "CommandPanel") -> None:
        cmd.log_message("Pinging exchange...", "system")
        ms = await self.market_service.ping()
        if ms >= 0:
            cmd.log_message(f"✓ Ping: {ms}ms", "success")
        else:
            cmd.log_error("Ping failed — not connected")

    async def cmd_clear(self, parsed: ParsedCommand, cmd: "CommandPanel") -> None:
        cmd.clear_log()

    async def cmd_help(self, parsed: ParsedCommand, cmd: "CommandPanel") -> None:
        cmd.log_message(HELP_TEXT, "info")

    async def cmd_mode(self, parsed: ParsedCommand, cmd: "CommandPanel") -> None:
        if not parsed.args:
            cmd.log_error("Usage: mode paper|live")
            return
        mode_str = parsed.args[0].upper()
        if mode_str == "PAPER":
            self.app.set_mode(TradingMode.PAPER)
            cmd.log_message("✓ Switched to PAPER trading mode", "success")
        elif mode_str == "LIVE":
            cmd.log_message(
                "[yellow]⚠ LIVE mode: real money at risk. Type 'mode live confirm' to proceed.[/yellow]",
                "warning",
            )
            if len(parsed.args) > 1 and parsed.args[1] == "confirm":
                self.app.set_mode(TradingMode.LIVE)
                cmd.log_message("✓ Switched to LIVE trading mode", "success")
        else:
            cmd.log_error(f"Unknown mode: {mode_str}")

    # ── Aliases ──────────────────────────────────────────────────

    async def cmd_alias(self, parsed: ParsedCommand, cmd: "CommandPanel") -> None:
        if len(parsed.args) < 2:
            cmd.log_error("Usage: alias <name> <command>")
            return
        name = parsed.args[0]
        command = " ".join(parsed.args[1:])
        AliasManager.set_alias(name, command)
        cmd.log_message(f"✓ Alias set: {name} → {command}", "success")

    async def cmd_unalias(self, parsed: ParsedCommand, cmd: "CommandPanel") -> None:
        if not parsed.args:
            cmd.log_error("Usage: unalias <name>")
            return
        if AliasManager.remove_alias(parsed.args[0]):
            cmd.log_message(f"✓ Alias removed: {parsed.args[0]}", "success")
        else:
            cmd.log_error(f"No alias: {parsed.args[0]}")

    async def cmd_aliases(self, parsed: ParsedCommand, cmd: "CommandPanel") -> None:
        aliases = AliasManager.list_aliases()
        if not aliases:
            cmd.log_message("No aliases defined.", "info")
            return
        cmd.log_message("[bold]Aliases:[/bold]", "info")
        for name, command in aliases.items():
            cmd.log_message(f"  [cyan]{name}[/cyan] → {command}", "info")

    async def cmd_bind(self, parsed: ParsedCommand, cmd: "CommandPanel") -> None:
        if len(parsed.args) < 2:
            cmd.log_error("Usage: bind <key> <command>")
            return
        key = parsed.args[0]
        command = " ".join(parsed.args[1:])
        AliasManager.set_binding(key, command)
        cmd.log_message(f"✓ Binding set: {key} → {command}", "success")

    async def cmd_unbind(self, parsed: ParsedCommand, cmd: "CommandPanel") -> None:
        if not parsed.args:
            cmd.log_error("Usage: unbind <key>")
            return
        if AliasManager.remove_binding(parsed.args[0]):
            cmd.log_message(f"✓ Binding removed: {parsed.args[0]}", "success")
        else:
            cmd.log_error(f"No binding: {parsed.args[0]}")

    async def cmd_bindings(self, parsed: ParsedCommand, cmd: "CommandPanel") -> None:
        bindings = AliasManager.list_bindings()
        if not bindings:
            cmd.log_message("No bindings defined.", "info")
            return
        cmd.log_message("[bold]Bindings:[/bold]", "info")
        for key, command in bindings.items():
            cmd.log_message(f"  [cyan]{key}[/cyan] → {command}", "info")

    # ── Trade komutları (Faz 3'te execution engine bağlanır) ──────

    async def cmd_buy(self, parsed: ParsedCommand, cmd: "CommandPanel") -> None:
        await self._trade_cmd("buy", parsed, cmd)

    async def cmd_sell(self, parsed: ParsedCommand, cmd: "CommandPanel") -> None:
        await self._trade_cmd("sell", parsed, cmd)

    @staticmethod
    def _parse_sl_tp(args: list[str]) -> tuple[float | None, float | None]:
        """`sl=58000 tp=72000` / `sl:58k tp:72k` formatını yakala.
        Geçersiz değerler None döner (çağıran kod uyarıyı loglar).
        """
        sl: float | None = None
        tp: float | None = None
        for tok in args:
            low = tok.lower().replace(":", "=")
            if low.startswith("sl="):
                try:
                    sl = parse_amount_usd(tok.split("=", 1)[1])
                except Exception:
                    sl = None
            elif low.startswith("tp="):
                try:
                    tp = parse_amount_usd(tok.split("=", 1)[1])
                except Exception:
                    tp = None
        return sl, tp

    @staticmethod
    def _parse_limit_price(args: list[str]) -> float | None:
        """`@58000` veya `limit=58000` tokeni varsa float döndür."""
        for tok in args:
            if tok.startswith("@") and len(tok) > 1:
                try:
                    return parse_amount_usd(tok[1:])
                except Exception:
                    return None
            low = tok.lower()
            if low.startswith("limit="):
                try:
                    return parse_amount_usd(tok.split("=", 1)[1])
                except Exception:
                    return None
        return None

    async def _long_short_impl(
        self, side: str, parsed: ParsedCommand, cmd: "CommandPanel",
    ) -> None:
        label = side.upper()
        if len(parsed.args) < 3:
            cmd.log_error(f"Usage: {side} <symbol> <usd> <leverage> [@<limit_price>] [sl=<price>] [tp=<price>]")
            return
        symbol = resolve_symbol(parsed.args[0])
        amount = parse_amount_usd(parsed.args[1])
        lev = parse_leverage(parsed.args[2])
        rest = parsed.args[3:]
        sl, tp = self._parse_sl_tp(rest)
        limit_px = self._parse_limit_price(rest)
        if not amount or not lev:
            cmd.log_error("Invalid amount or leverage")
            return
        if not self._execution_engine:
            cmd.log_error("Execution engine not available")
            return

        order_type = "limit" if limit_px else "market"
        extras: list[str] = []
        if limit_px: extras.append(f"@{limit_px}")
        if sl: extras.append(f"SL={sl}")
        if tp: extras.append(f"TP={tp}")
        suffix = (" " + " ".join(extras)) if extras else ""
        cmd.log_message(f"{label} {symbol} ${amount} {lev}x {order_type.upper()}{suffix}", "info")
        try:
            await self._execution_engine.submit_order(
                symbol=symbol,
                side=("buy" if side == "long" else "sell"),
                amount_usd=amount,
                order_type=order_type,
                price=limit_px,
                leverage=lev,
                stop_loss_price=sl, take_profit_price=tp,
            )
        except ValueError as e:
            cmd.log_error(str(e))

    async def cmd_long(self, parsed: ParsedCommand, cmd: "CommandPanel") -> None:
        await self._long_short_impl("long", parsed, cmd)

    async def cmd_short(self, parsed: ParsedCommand, cmd: "CommandPanel") -> None:
        await self._long_short_impl("short", parsed, cmd)

    async def cmd_close(self, parsed: ParsedCommand, cmd: "CommandPanel") -> None:
        """close <symbol>|all              → market kapat
           close <symbol> limit @<price>   → reduce-only limit emir, fiyata gelince kapanır
           close <symbol> @<price>         → @price kısaltması, limit
        """
        if not parsed.args:
            cmd.log_error("Usage: close <symbol>|all  [limit @<price>]")
            return
        target = parsed.args[0]
        if target == "all":
            cmd.log_message("Closing all positions...", "warning")
            if self._execution_engine:
                await self._execution_engine.close_all()
            return

        symbol = resolve_symbol(target)
        # Limit close mu? `limit @58000` veya direkt `@58000`
        limit_price = self._parse_limit_price(parsed.args[1:])
        if limit_price is not None:
            engine = self._execution_engine
            if not engine or engine._hl_executor is None:
                cmd.log_error("Limit close şu an sadece HL LIVE'da çalışıyor")
                return
            cmd.log_message(f"Limit close {symbol} @ {limit_price}...", "warning")
            ok, msg = await engine._hl_executor.place_limit_close(symbol, limit_price)
            if ok:
                cmd.log_message(f"✓ Limit close emrı yerleşti: {msg}", "success")
            else:
                cmd.log_error(f"Limit close başarısız: {msg}")
            return

        cmd.log_message(f"Closing {symbol}...", "warning")
        if self._execution_engine:
            await self._execution_engine.close_position(symbol)

    async def cmd_reduce(self, parsed: ParsedCommand, cmd: "CommandPanel") -> None:
        """reduce <symbol> <pct%|usd> — pozisyonun bir kısmını market ile kapat.
        Örnek:
          reduce BTCUSDT 50%    → pozisyonun yarısını kapat
          reduce BTCUSDT 1000   → $1000 notional kapat
        """
        if len(parsed.args) < 2:
            cmd.log_error("Usage: reduce <symbol> <pct%>|<usd>")
            return
        symbol = resolve_symbol(parsed.args[0])
        pos = self._portfolio.get_position(symbol) if self._portfolio else None
        if not pos:
            cmd.log_error(f"No open position on {symbol}")
            return
        raw = parsed.args[1]
        notional_to_close: float
        if raw.endswith("%"):
            try:
                pct = float(raw[:-1])
            except ValueError:
                cmd.log_error(f"Invalid percent: {raw}")
                return
            if not (0 < pct <= 100):
                cmd.log_error("Percent must be between 0 and 100")
                return
            notional_to_close = pos.notional_usd * (pct / 100)
        else:
            val = parse_amount_usd(raw)
            if not val or val <= 0:
                cmd.log_error(f"Invalid amount: {raw}")
                return
            notional_to_close = min(val, pos.notional_usd)
        if notional_to_close >= pos.notional_usd * 0.999:
            cmd.log_message(f"Reduction covers full position — kapatılıyor: {symbol}", "warning")
            if self._execution_engine:
                await self._execution_engine.close_position(symbol)
            return
        # Ters yönlü market emri gönder (engine mevcut pozisyonu azaltacak şekilde işler)
        close_side = "sell" if pos.side.value == "LONG" else "buy"
        cmd.log_message(
            f"REDUCE {symbol} ${notional_to_close:.2f} ({close_side.upper()}) · Lev {pos.leverage}x",
            "info",
        )
        if self._execution_engine:
            # submit_order amount_usd'yi marjin olarak yorumluyor;
            # kapatmak istediğimiz NOTIONAL'ı leverage'a böl.
            margin_to_close = notional_to_close / max(pos.leverage, 1)
            await self._execution_engine.submit_order(
                symbol=symbol, side=close_side, amount_usd=margin_to_close,
                order_type="market", leverage=pos.leverage,
            )

    async def cmd_reverse(self, parsed: ParsedCommand, cmd: "CommandPanel") -> None:
        """reverse <symbol> [leverage] — pozisyonu kapatıp aynı notional ile ters yönde aç.
        Örnek:
          reverse BTCUSDT      → mevcut kaldıraçla ters yöne çevir
          reverse BTCUSDT 10   → 10x kaldıraçla ters yöne çevir
        """
        if not parsed.args:
            cmd.log_error("Usage: reverse <symbol> [leverage]")
            return
        symbol = resolve_symbol(parsed.args[0])
        pos = self._portfolio.get_position(symbol) if self._portfolio else None
        if not pos:
            cmd.log_error(f"No open position on {symbol}")
            return
        new_lev = pos.leverage
        if len(parsed.args) >= 2:
            lv = parse_leverage(parsed.args[1])
            if lv and lv > 0:
                new_lev = lv
        old_side = pos.side.value  # "LONG" | "SHORT"
        new_side = "sell" if old_side == "LONG" else "buy"
        # Notional korunmalı; margin = notional / leverage
        new_margin_usd = pos.notional_usd / max(new_lev, 1)
        cmd.log_message(
            f"REVERSE {symbol}: close {old_side} → open "
            f"{'SHORT' if old_side == 'LONG' else 'LONG'} ${new_margin_usd:.2f} {new_lev}x",
            "warning",
        )
        if self._execution_engine:
            await self._execution_engine.close_position(symbol)
            await self._execution_engine.submit_order(
                symbol=symbol, side=new_side, amount_usd=new_margin_usd,
                order_type="market", leverage=new_lev,
            )

    async def cmd_be(self, parsed: ParsedCommand, cmd: "CommandPanel") -> None:
        """be <symbol> — stop-loss'u pozisyonun giriş fiyatına taşı (break-even).
        Pozisyon artıya geçtiyse riski sıfırlar; eşik olmadan çağrılabilir.
        """
        if not parsed.args:
            cmd.log_error("Usage: be <symbol>")
            return
        symbol = resolve_symbol(parsed.args[0])
        pos = self._portfolio.get_position(symbol) if self._portfolio else None
        if not pos:
            cmd.log_error(f"No open position on {symbol}")
            return
        entry = pos.entry_price
        if not entry or entry <= 0:
            cmd.log_error(f"Invalid entry price for {symbol}")
            return
        # Pozisyon kâra geçmemişse uyar — kullanıcı yine de isterse geçerli.
        cur = pos.current_price or entry
        in_profit = (cur > entry) if pos.side.value == "LONG" else (cur < entry)
        if self._portfolio:
            self._portfolio.set_stop_loss(symbol, "price", entry)
        msg = f"✓ BE — {symbol} SL → entry ${entry:g}"
        if not in_profit:
            msg += "  (uyarı: pozisyon henüz kâra geçmedi)"
        cmd.log_message(msg, "success" if in_profit else "warning")
        await self._push_sl_tp_to_exchange(cmd, symbol, sl=entry)

    async def _push_sl_tp_to_exchange(
        self, cmd: "CommandPanel", symbol: str,
        sl: float | None = None, tp: float | None = None,
    ) -> bool:
        """Engine'in aktif HL executor'ı varsa borsaya SL/TP trigger gönder.
        HL bağlı değilse True döner (paper mode için NOOP, local update yeter).
        HL bağlı ve push başarısızsa False — caller local state'i revert etmeli.
        """
        if not self._execution_engine or self._execution_engine._hl_executor is None:
            return True
        try:
            ok, msg = await self._execution_engine._hl_executor.update_position_sl_tp(
                symbol, stop_loss=sl, take_profit=tp,
            )
            if ok:
                cmd.log_message(f"✓ HL trigger güncellendi: {symbol}", "success")
                return True
            cmd.log_error(f"HL trigger hatası: {msg}")
            return False
        except Exception as e:
            cmd.log_error(f"HL trigger exception: {e}")
            return False

    @staticmethod
    def _resolve_price_from_pct(pos, kind: str, value: float, is_stop: bool) -> float:
        """pct ise entry'den fiyata çevir; price ise olduğu gibi."""
        if kind == "price":
            return float(value)
        entry = pos.entry_price
        is_long = pos.side.value == "LONG"
        # SL pct: long için entry * (1 - v/100), short için entry * (1 + v/100)
        # TP pct: long için entry * (1 + v/100), short için entry * (1 - v/100)
        if is_stop:
            return entry * (1 - value / 100) if is_long else entry * (1 + value / 100)
        return entry * (1 + value / 100) if is_long else entry * (1 - value / 100)

    async def cmd_sl(self, parsed: ParsedCommand, cmd: "CommandPanel") -> None:
        if len(parsed.args) < 2:
            cmd.log_error("Usage: sl <symbol> <pct%>|<price>")
            return
        symbol = resolve_symbol(parsed.args[0])
        result = parse_pct_or_price(parsed.args[1])
        if not result:
            cmd.log_error("Invalid stop-loss value")
            return
        kind, value = result
        pos = self._portfolio.get_position(symbol) if self._portfolio else None
        if not pos:
            cmd.log_error(f"No open position on {symbol}")
            return
        # Önce snapshot — HL push başarısız olursa geri sarmak için
        old_sl = pos.stop_loss
        sl_px = self._resolve_price_from_pct(pos, kind, value, is_stop=True)
        if self._portfolio:
            self._portfolio.set_stop_loss(symbol, kind, value)
        ok = await self._push_sl_tp_to_exchange(cmd, symbol, sl=sl_px)
        if not ok:
            # HL push fail — local state'i revert (LIVE'da HL doğruluk kaynağıdır)
            pos.stop_loss = old_sl
            cmd.log_error(f"SL kaydı geri alındı (HL push başarısız) — eski SL: {old_sl}")
            return
        cmd.log_message(
            f"✓ SL set for {symbol}: {value}{'%' if kind == 'pct' else ''} (≈ ${sl_px:g})",
            "error",
        )

    async def cmd_tp(self, parsed: ParsedCommand, cmd: "CommandPanel") -> None:
        if len(parsed.args) < 2:
            cmd.log_error("Usage: tp <symbol> <pct%>|<price>")
            return
        symbol = resolve_symbol(parsed.args[0])
        result = parse_pct_or_price(parsed.args[1])
        if not result:
            cmd.log_error("Invalid take-profit value")
            return
        kind, value = result
        pos = self._portfolio.get_position(symbol) if self._portfolio else None
        if not pos:
            cmd.log_error(f"No open position on {symbol}")
            return
        old_tp = pos.take_profit
        tp_px = self._resolve_price_from_pct(pos, kind, value, is_stop=False)
        if self._portfolio:
            self._portfolio.set_take_profit(symbol, kind, value)
        ok = await self._push_sl_tp_to_exchange(cmd, symbol, tp=tp_px)
        if not ok:
            pos.take_profit = old_tp
            cmd.log_error(f"TP kaydı geri alındı (HL push başarısız) — eski TP: {old_tp}")
            return
        cmd.log_message(
            f"✓ TP set for {symbol}: {value}{'%' if kind == 'pct' else ''} (≈ ${tp_px:g})",
            "success",
        )

    async def cmd_orders(self, parsed: ParsedCommand, cmd: "CommandPanel") -> None:
        if self._portfolio:
            orders = self._portfolio.get_open_orders()
            if not orders:
                cmd.log_message("No open orders.", "info")
                return
            for o in orders:
                cmd.log_message(
                    f"  [{o.status.value}] {o.internal_id} {o.symbol} "
                    f"{o.side.value.upper()} {fmt_usd(o.notional_usd)} {o.order_type.value}",
                    "info",
                )
        else:
            cmd.log_message("No open orders.", "info")

    async def cmd_cancel(self, parsed: ParsedCommand, cmd: "CommandPanel") -> None:
        """Kullanım:
          cancel all                           → tüm açık emirleri iptal et
          cancel <symbol>                      → sembolün tüm açık emirlerini iptal
          cancel <symbol> <oid>                → tek emir (frontend bu formatı kullanır)
        """
        if not parsed.args:
            cmd.log_error("Usage: cancel all | cancel <symbol> [<oid>]")
            return
        if not self._execution_engine:
            cmd.log_message("Execution engine not available.", "info")
            return

        engine = self._execution_engine
        target = parsed.args[0]

        if target == "all":
            await engine.cancel_all()
            # HL bağlıysa borsa tarafındaki tüm açık emirleri de iptal et
            hl = engine._hl_executor
            if hl is not None and self._portfolio:
                try:
                    syms = set()
                    for sym in self._portfolio.get_positions().keys():
                        syms.add(sym)
                    # Açık emirler zorunlu pozisyona bağlı değil — open_orders'tan tara
                    from eth_account import Account  # type: ignore
                    address = hl.wallet_address or Account.from_key(hl.private_key).address
                    import asyncio as _aio
                    orders = await _aio.to_thread(hl._info.open_orders, address)
                    for o in orders:
                        coin = o.get("coin")
                        if coin: syms.add(coin + "USDT")
                    total = 0
                    for sym in syms:
                        n, errs = await hl.cancel_all_for_symbol(sym)
                        total += n
                        for e in errs: cmd.log_error(f"  {sym}: {e}")
                    cmd.log_message(f"✓ HL: {total} açık emir iptal edildi", "success")
                except Exception as e:
                    cmd.log_error(f"HL cancel-all failed: {e}")
            else:
                cmd.log_message("✓ All orders cancelled", "success")
            return

        # Sembol bazlı iptal — opsiyonel oid
        symbol = resolve_symbol(target)
        oid: int | None = None
        if len(parsed.args) >= 2:
            try:
                oid = int(parsed.args[1])
            except ValueError:
                cmd.log_error(f"Invalid oid: {parsed.args[1]}")
                return

        hl = engine._hl_executor
        if hl is None:
            cmd.log_message(f"PAPER mode — {symbol} için açık emir yok", "info")
            return

        if oid is not None:
            ok, msg = await hl.cancel_exchange_order(symbol, oid)
            if ok:
                cmd.log_message(f"✓ Cancelled {symbol} oid={oid}", "success")
            else:
                cmd.log_error(f"Cancel failed {symbol} oid={oid}: {msg}")
        else:
            n, errs = await hl.cancel_all_for_symbol(symbol)
            cmd.log_message(f"✓ {symbol}: {n} açık emir iptal edildi", "success")
            for e in errs:
                cmd.log_error(f"  {e}")

    async def cmd_positions(self, parsed: ParsedCommand, cmd: "CommandPanel") -> None:
        if self._portfolio:
            positions = self._portfolio.get_positions()
            if not positions:
                cmd.log_message("No open positions.", "info")
                return
            for sym, pos in positions.items():
                pnl = pos.unrealized_pnl
                pnl_color = "green" if pnl >= 0 else "red"
                cmd.log_message(
                    f"  {sym} {pos.side.value}  qty={pos.quantity:.4f}"
                    f"  entry={fmt_price(pos.entry_price)}"
                    f"  now={fmt_price(pos.current_price)}"
                    f"  PnL=[{pnl_color}]{fmt_usd(pnl)}[/{pnl_color}]",
                    "info",
                )
        else:
            cmd.log_message("No open positions.", "info")

    async def cmd_pnl(self, parsed: ParsedCommand, cmd: "CommandPanel") -> None:
        if self._portfolio:
            daily = self._portfolio.daily_pnl
            realized = self._portfolio.realized_pnl_today
            unrealized = self._portfolio.unrealized_pnl
            color = "green" if daily >= 0 else "red"
            cmd.log_message(
                f"Daily PnL: [{color}]{fmt_usd(daily)}[/{color}]"
                f"  Realized: {fmt_usd(realized)}"
                f"  Unrealized: {fmt_usd(unrealized)}",
                "info",
            )
        else:
            cmd.log_message("Daily PnL: $0.00", "info")

    async def cmd_balance(self, parsed: ParsedCommand, cmd: "CommandPanel") -> None:
        if self._portfolio:
            bal = self._portfolio.balance
            cmd.log_message(
                f"Balance: [cyan]{fmt_usd(bal.total_usdt)}[/cyan]"
                f"  Available: {fmt_usd(bal.available_usdt)}"
                f"  Locked: {fmt_usd(bal.locked_usdt)}",
                "info",
            )
        else:
            bal = self.settings.paper_starting_balance
            cmd.log_message(f"Paper Balance: [cyan]{fmt_usd(bal)}[/cyan]", "info")

    async def cmd_history(self, parsed: ParsedCommand, cmd: "CommandPanel") -> None:
        count = 20
        if parsed.args:
            try:
                count = int(parsed.args[0])
            except ValueError:
                pass

        # Live HL varsa borsa fill'lerini, yoksa portfolio kapanış kayıtlarını göster
        trades: list = []
        engine = self._execution_engine
        if engine and engine._hl_executor is not None:
            try:
                trades = await engine._hl_executor.get_trade_history(limit=count)
            except Exception as e:
                cmd.log_error(f"HL history fetch failed: {e}")
        if not trades and self._portfolio:
            try:
                trades = self._portfolio.get_trade_history()[-count:]
            except Exception:
                trades = []
        if not trades:
            cmd.log_message("No trade history.", "info")
            return

        cmd.log_message(f"[bold]Last {len(trades)} trades[/bold]", "info")
        for t in trades:
            sym  = t.get("symbol") or t.get("coin") or "?"
            side = (t.get("side") or "").upper()
            qty  = t.get("quantity") or t.get("sz") or 0
            px   = t.get("price") or t.get("px") or 0
            pnl  = t.get("realized_pnl") or t.get("closedPnl") or 0
            ts   = t.get("timestamp") or t.get("time") or ""
            try:
                qty_f = float(qty); px_f = float(px); pnl_f = float(pnl)
            except (TypeError, ValueError):
                qty_f = px_f = pnl_f = 0
            color = "green" if pnl_f >= 0 else "red"
            cmd.log_message(
                f"  {ts}  {sym} {side}  qty={qty_f:.4f} @ {fmt_price(px_f)}  "
                f"PnL=[{color}]{fmt_usd(pnl_f)}[/{color}]",
                "info",
            )

    async def cmd_risk(self, parsed: ParsedCommand, cmd: "CommandPanel") -> None:
        if self._risk_engine:
            summary = await self._risk_engine.get_risk_summary()
            cmd.log_message(str(summary), "info")
        else:
            s = self.settings
            cmd.log_message(
                f"[bold]Risk Limits[/bold]\n"
                f"  Max trade:     {fmt_usd(s.risk_max_trade_usd)}\n"
                f"  Max daily loss: {s.risk_max_daily_loss_pct}%\n"
                f"  Max leverage:  {s.risk_max_leverage}x\n"
                f"  Max positions: {s.risk_max_open_positions}\n"
                f"  Cooldown:      {s.risk_cooldown_seconds}s",
                "info",
            )

    async def cmd_limits(self, parsed: ParsedCommand, cmd: "CommandPanel") -> None:
        await self.cmd_risk(parsed, cmd)

    async def cmd_panic(self, parsed: ParsedCommand, cmd: "CommandPanel") -> None:
        if not parsed.args or parsed.args[0] != "yes":
            positions_count = len(self._portfolio.get_positions()) if self._portfolio else 0
            orders_count = len(self._portfolio.get_open_orders()) if self._portfolio else 0
            cmd.log_message(
                f"[bold red]⚠ PANIC CLOSE[/bold red]\n"
                f"  Open positions: {positions_count}\n"
                f"  Open orders: {orders_count}\n"
                f"  Type: [bold]panic yes[/bold] to confirm",
                "warning",
            )
            return

        cmd.log_message("[bold red]PANIC INITIATED[/bold red]", "error")
        if self._execution_engine:
            await self._execution_engine.panic_close()
        else:
            cmd.log_message("✓ Paper panic: all positions cleared", "success")

    async def cmd_transfer(self, parsed: ParsedCommand, cmd: "CommandPanel") -> None:
        """HL spot ↔ perp USDC transferi.
        Örnek:
          transfer 500 perp     → spot'tan perp'e $500
          transfer 100 spot     → perp'ten spot'a $100
        """
        if len(parsed.args) < 2:
            cmd.log_error("Usage: transfer <usd_amount> spot|perp")
            return
        try:
            amount = float(parsed.args[0].replace("$", "").replace(",", ""))
        except ValueError:
            cmd.log_error(f"Invalid amount: {parsed.args[0]}")
            return
        target = parsed.args[1].lower()
        if target not in ("spot", "perp"):
            cmd.log_error("Yön: spot veya perp")
            return
        engine = self._execution_engine
        if not engine or engine._hl_executor is None:
            cmd.log_error("HL bağlı değil")
            return
        to_perp = (target == "perp")
        cmd.log_message(
            f"Transferring ${amount} → {target.upper()}...",
            "system",
        )
        ok, msg = await engine._hl_executor.transfer_spot_perp(amount, to_perp=to_perp)
        if ok:
            cmd.log_message(f"✓ Transfer başarılı: ${amount} → {target.upper()}", "success")
        else:
            # Agent wallet transfer/withdraw yapamaz (HL güvenlik tasarımı).
            # Kullanıcı web UI üzerinden main wallet imzasıyla yapmalı.
            if "Must deposit" in msg or "permission" in msg.lower():
                hl_url = (
                    "https://app.hyperliquid-testnet.xyz"
                    if engine._hl_executor.testnet
                    else "https://app.hyperliquid.xyz"
                )
                cmd.log_error(
                    f"Transfer reddedildi — agent wallet transfer yetkisine sahip değil "
                    f"(HL tasarımı; trade dışında işlem yapamaz).\n"
                    f"Çözüm: {hl_url} üstünden MAIN cüzdanınla bağlan ve "
                    f"Spot ↔ Perp transferini orada yap."
                )
            else:
                cmd.log_error(f"Transfer başarısız: {msg}")

    async def cmd_trail(self, parsed: ParsedCommand, cmd: "CommandPanel") -> None:
        """trail <symbol> <distance>|off
        distance: USD ('100') veya % ('1.5%') — entry/peak'a göre.
        Örnek:
          trail BTC 200       → peak'tan $200 geri SL takibi
          trail BTC 1%        → peak'tan %1 geri SL takibi
          trail BTC off       → trailing'i kapat (mevcut SL kalır)
        """
        if len(parsed.args) < 2:
            cmd.log_error("Usage: trail <symbol> <distance>|off")
            return
        symbol = resolve_symbol(parsed.args[0])
        arg = parsed.args[1]
        if not self._execution_engine:
            cmd.log_error("Execution engine not available")
            return
        engine = self._execution_engine

        if arg.lower() == "off":
            await engine.cancel_trailing_stop(symbol)
            cmd.log_message(f"✓ Trailing kapatıldı: {symbol}", "success")
            return

        pos = self._portfolio.get_position(symbol) if self._portfolio else None
        if not pos:
            cmd.log_error(f"No open position on {symbol}")
            return
        # USD veya pct
        try:
            if arg.endswith("%"):
                pct = float(arg[:-1])
                if pct <= 0:
                    cmd.log_error("Distance > 0 olmalı")
                    return
                cur = pos.current_price or pos.entry_price
                distance = cur * pct / 100.0
            else:
                distance = float(arg.replace("$", "").replace(",", ""))
                if distance <= 0:
                    cmd.log_error("Distance > 0 olmalı")
                    return
        except ValueError:
            cmd.log_error(f"Invalid distance: {arg}")
            return

        ok, msg = await engine.set_trailing_stop(symbol, distance)
        if ok:
            cmd.log_message(f"✓ {symbol} trail ${distance:g} — {msg}", "success")
        else:
            cmd.log_error(f"Trail kurulamadı: {msg}")

    async def cmd_unlock(self, parsed: ParsedCommand, cmd: "CommandPanel") -> None:
        """Risk engine'in panic / daily-loss kilidini açar.
        Kullanıcı bilinçli onaylarsa cooldown'u sıfırlar.
        """
        if not parsed.args or parsed.args[0] != "yes":
            cmd.log_message(
                "[yellow]⚠ Risk engine kilidini açmak üzeresin. "
                "panic veya günlük kayıp limiti sebebiyle kilitli olabilir.\n"
                "  Type:[/yellow] [bold]unlock yes[/bold]",
                "warning",
            )
            return
        if not self._risk_engine:
            cmd.log_error("Risk engine yok")
            return
        self._risk_engine.unlock()
        # Cooldown'ı da sıfırla
        try:
            self._risk_engine.state.cooldown_until = None
        except Exception:
            pass
        cmd.log_message("✓ Risk engine kilidi açıldı, cooldown sıfırlandı", "success")

    async def cmd_quit(self, parsed: ParsedCommand, cmd: "CommandPanel") -> None:
        if self._portfolio and self._portfolio.get_positions():
            cmd.log_message(
                "[yellow]⚠ You have open positions. They will remain on the exchange. Quit? "
                "Type 'quit confirm'[/yellow]",
                "warning",
            )
            if not parsed.args or parsed.args[0] != "confirm":
                return
        self.app.exit()

    # ── Placeholder ──────────────────────────────────────────────

    async def _not_implemented_yet(self, parsed: ParsedCommand, cmd: "CommandPanel") -> None:
        cmd.log_message(f"[dim]{parsed.command}: coming in next sprint[/dim]", "system")

    async def _trade_cmd(self, side: str, parsed: ParsedCommand, cmd: "CommandPanel") -> None:
        if len(parsed.args) < 3:
            cmd.log_error(f"Usage: {side} <symbol> <usd> market|limit [price]")
            return
        symbol = resolve_symbol(parsed.args[0])
        amount = parse_amount_usd(parsed.args[1])
        order_type = parsed.args[2]

        if amount is None:
            cmd.log_error(f"Invalid amount: {parsed.args[1]}")
            return
        if order_type not in ("market", "limit"):
            cmd.log_error(f"Invalid order type: {order_type}. Use market or limit.")
            return

        price = None
        if order_type == "limit":
            if len(parsed.args) < 4:
                cmd.log_error("Limit order requires price: buy <sym> <usd> limit <price>")
                return
            try:
                price = float(parsed.args[3])
            except ValueError:
                cmd.log_error(f"Invalid price: {parsed.args[3]}")
                return

        if self._execution_engine:
            await self._execution_engine.submit_order(
                symbol=symbol, side=side, amount_usd=amount,
                order_type=order_type, price=price
            )
        else:
            # Faz 3 öncesi placeholder
            ticker = self.market_service.get_ticker(symbol)
            price_str = f"@ {fmt_price(ticker.last_price)}" if ticker else ""
            cmd.log_message(
                f"[yellow]PAPER {side.upper()} {symbol} {fmt_usd(amount)} {order_type} {price_str}[/yellow]"
                f"\n[dim]Execution engine not yet active (Sprint 3)[/dim]",
                "warning",
            )

    # ── Hyperliquid ──────────────────────────────────────────────

    async def cmd_hl_status(self, parsed: ParsedCommand, cmd: "CommandPanel") -> None:
        """Hyperliquid cüzdan durumu ve açık pozisyonları göster."""
        settings = self._execution_engine.settings if self._execution_engine else None
        if not settings:
            cmd.log_error("Execution engine not available")
            return

        mode = getattr(settings, "trading_mode", "paper")
        if mode.lower() != "hyperliquid":
            cmd.log_message(
                f"[yellow]Mode: PAPER[/yellow] — Hyperliquid aktif değil\n"
                f"[dim].env'de TRADING_MODE=hyperliquid yaparak live moda geç[/dim]",
                "warning",
            )
            return

        hl = self._execution_engine._hl_executor
        if not hl:
            cmd.log_error("Hyperliquid executor başlatılamadı — private key eksik?")
            return

        cmd.log_message("[cyan]Hyperliquid durumu sorgulanıyor...[/cyan]", "info")
        balance = await hl.get_balance()
        positions = await hl.get_open_positions()

        testnet_tag = "[red](TESTNET)[/red] " if settings.hyperliquid_testnet else ""
        wallet = settings.hyperliquid_wallet_address[:10] + "..." if settings.hyperliquid_wallet_address else "?"
        cmd.log_message(
            f"[green]✓ LIVE MODE[/green] {testnet_tag}| Wallet: {wallet}\n"
            f"  Balance: ${balance['total']:.2f} | Available: ${balance['available']:.2f}",
            "success",
        )
        if positions:
            cmd.log_message(f"  Açık Pozisyon ({len(positions)}):", "info")
            for p in positions:
                side_tag = "[green]LONG[/green]" if p["side"] == "long" else "[red]SHORT[/red]"
                cmd.log_message(
                    f"  {p['symbol']} {side_tag} x{p['leverage']} "
                    f"qty={p['quantity']} entry={p['entry_price']} "
                    f"pnl={p['unrealized_pnl']:+.2f}",
                    "info",
                )
        else:
            cmd.log_message("  Açık pozisyon yok", "info")

    async def cmd_mode(self, parsed: ParsedCommand, cmd: "CommandPanel") -> None:
        """Mevcut trading modunu göster veya değiştir."""
        if not self._execution_engine:
            cmd.log_error("Execution engine not available")
            return

        if not parsed.args:
            mode = self._execution_engine._mode.value
            hl_active = self._execution_engine._hl_executor is not None
            tag = "[green]LIVE (Hyperliquid)[/green]" if hl_active else "[yellow]PAPER[/yellow]"
            cmd.log_message(f"Trading mode: {tag} ({mode})", "info")
            return

        new_mode = parsed.args[0].lower()
        if new_mode == "paper":
            from ..core.enums import TradingMode
            self._execution_engine._mode = TradingMode.PAPER
            cmd.log_message("[yellow]PAPER moduna geçildi[/yellow]", "warning")
        elif new_mode == "hyperliquid":
            hl = self._execution_engine._hl_executor
            if not hl:
                cmd.log_error("Hyperliquid executor yok — .env'e HYPERLIQUID_PRIVATE_KEY ekle")
                return
            from ..core.enums import TradingMode
            self._execution_engine._mode = TradingMode.LIVE
            cmd.log_message("[green]LIVE (Hyperliquid) moduna geçildi[/green]", "success")
        else:
            cmd.log_error(f"Geçersiz mod: {new_mode}. Kullanım: mode paper|hyperliquid")

    async def cmd_size(self, parsed: ParsedCommand, cmd: "CommandPanel") -> None:
        """
        Position sizing calculator.
        Kullanım:
          size <symbol> <bakiye_usd> <risk%> [sl=<fiyat>]
        Örnek:
          size BTC 10000 2%
          size BTC 10000 2% sl=95000
        """
        args = parsed.args
        if len(args) < 3:
            cmd.log_error("Kullanım: size <symbol> <bakiye> <risk%> [sl=<fiyat>]")
            cmd.log_message("Örnek: size BTC 10000 2%   veya   size BTC 10000 1% sl=95000", "system")
            return

        symbol = resolve_symbol(args[0])
        try:
            balance = float(args[1].replace("$", "").replace(",", ""))
        except ValueError:
            cmd.log_error(f"Geçersiz bakiye: {args[1]}")
            return

        risk_str = args[2].replace("%", "")
        try:
            risk_pct = float(risk_str)
        except ValueError:
            cmd.log_error(f"Geçersiz risk yüzdesi: {args[2]}")
            return

        if not (0 < risk_pct <= 100):
            cmd.log_error("Risk yüzdesi 0-100 arasında olmalı")
            return

        # Opsiyonel sl= parametresi
        sl_price: float | None = None
        for a in args[3:]:
            if a.lower().startswith("sl="):
                try:
                    sl_price = float(a.split("=", 1)[1].replace(",", ""))
                except ValueError:
                    cmd.log_error(f"Geçersiz SL fiyatı: {a}")
                    return

        ticker = self.market_service.get_ticker(symbol)
        if not ticker or not ticker.last_price:
            cmd.log_error(f"{symbol} için güncel fiyat yok. Önce `watch {symbol}` çalıştırın.")
            return

        price = ticker.last_price
        risk_amount = balance * risk_pct / 100

        if sl_price is not None:
            sl_distance = abs(price - sl_price)
            if sl_distance == 0:
                cmd.log_error("SL fiyatı güncel fiyata eşit olamaz")
                return
            quantity = risk_amount / sl_distance
        else:
            # SL verilmemişse: %2 fiyat hareketi varsayılan kayıp noktası
            quantity = risk_amount / (price * 0.02)

        notional = quantity * price

        cmd.log_message("─" * 48, "system")
        cmd.log_message(f"  Position Sizing: {symbol}", "info")
        cmd.log_message("─" * 48, "system")
        cmd.log_message(f"  Bakiye        : ${balance:,.2f}", "info")
        cmd.log_message(f"  Risk           : %{risk_pct} = ${risk_amount:,.2f}", "info")
        cmd.log_message(f"  Güncel fiyat  : ${fmt_price(price)}", "info")
        if sl_price:
            cmd.log_message(f"  Stop-Loss      : ${fmt_price(sl_price)}  (mesafe: ${abs(price - sl_price):,.2f})", "info")
        else:
            cmd.log_message(f"  SL varsayım    : %2 fiyat hareketi (sl= ile belirtin)", "system")
        cmd.log_message(f"  Pozisyon boyutu: {quantity:.6f} {symbol.replace('USDT','')}", "success")
        cmd.log_message(f"  Notional       : ${notional:,.2f}", "success")
        cmd.log_message("─" * 48, "system")
        cmd.log_message("  Kaldıraç bazlı teminat:", "system")
        for lev in [1, 2, 5, 10, 20, 50]:
            collateral = notional / lev
            if collateral <= balance:
                cmd.log_message(f"    x{lev:<3} → ${collateral:>10,.2f} teminat", "info")

    async def cmd_dca(self, parsed: ParsedCommand, cmd: "CommandPanel") -> None:
        """
        DCA — Dollar Cost Averaging.
        Toplam USD'yi N eşit market emrine böler.
        Kullanım: dca <symbol> <side> <total_usd> <orders> [leverage=<n>]
        Örnek:    dca BTC long 500 5
                  dca ETH short 1000 4 leverage=3
        """
        args = parsed.args
        if len(args) < 4:
            cmd.log_error("Kullanım: dca <symbol> <side> <total_usd> <orders> [leverage=<n>]")
            cmd.log_message("Örnek: dca BTC long 500 5   (500$ toplam, 5 eşit emir = 100$/emir)", "system")
            return

        symbol = resolve_symbol(args[0])
        side = args[1].lower()
        if side not in ("long", "short", "buy", "sell"):
            cmd.log_error("Side: long / short")
            return

        try:
            total_usd = float(args[2].replace("$", "").replace(",", ""))
            n_orders = int(args[3])
        except (ValueError, IndexError):
            cmd.log_error("Geçersiz miktar veya emir sayısı")
            return

        if n_orders < 2 or n_orders > 20:
            cmd.log_error("Emir sayısı 2-20 arasında olmalı")
            return

        leverage = 1
        for a in args[4:]:
            if a.lower().startswith("leverage="):
                try:
                    leverage = int(a.split("=", 1)[1])
                except ValueError:
                    cmd.log_error(f"Geçersiz kaldıraç: {a}")
                    return

        if not self._execution_engine:
            cmd.log_error("Execution engine başlatılmamış")
            return

        per_order_usd = total_usd / n_orders
        cmd.log_message("─" * 48, "system")
        cmd.log_message(f"  DCA: {symbol} {side.upper()}  —  ${total_usd:,.2f} / {n_orders} emir", "info")
        cmd.log_message(f"  Her emir: ${per_order_usd:,.2f}  |  Kaldıraç: x{leverage}", "system")
        cmd.log_message("─" * 48, "system")

        from ..core.enums import OrderStatus
        order_side = "buy" if side in ("long", "buy") else "sell"
        filled = 0
        for i in range(n_orders):
            try:
                order = await self._execution_engine.submit_order(
                    symbol=symbol,
                    side=order_side,
                    amount_usd=per_order_usd,
                    order_type="market",
                    leverage=leverage,
                )
                if order.status == OrderStatus.FILLED:
                    filled += 1
                    cmd.log_message(
                        f"  [{i+1}/{n_orders}] FILLED qty={order.quantity:.4f} @ {fmt_price(order.fill_price or 0)}",
                        "success",
                    )
                elif order.status == OrderStatus.ACKNOWLEDGED:
                    cmd.log_message(
                        f"  [{i+1}/{n_orders}] ACKNOWLEDGED {order.error or ''}",
                        "warning",
                    )
                else:
                    cmd.log_message(
                        f"  [{i+1}/{n_orders}] {order.status.value.upper()} {order.error or order.risk_reject_reason or ''}",
                        "error",
                    )
            except Exception as e:
                cmd.log_message(f"  [{i+1}/{n_orders}] HATA: {e}", "error")

        cmd.log_message("─" * 48, "system")
        cmd.log_message(f"  DCA tamamlandı: {filled}/{n_orders} emir başarılı", "success" if filled == n_orders else "order")

    async def cmd_hedge(self, parsed: ParsedCommand, cmd: "CommandPanel") -> None:
        """
        Hedge — mevcut pozisyonun tam tersini açar.
        Kullanım: hedge <symbol> [usd=<amount>]
        Örnek:    hedge BTC            (aynı büyüklükte ters pozisyon)
                  hedge BTC usd=500   (500$ değerinde ters pozisyon)
        """
        args = parsed.args
        if not args:
            cmd.log_error("Kullanım: hedge <symbol> [usd=<amount>]")
            return

        symbol = resolve_symbol(args[0])

        if not self._portfolio or not self._execution_engine:
            cmd.log_error("Portfolio / execution engine başlatılmamış")
            return

        pos = self._portfolio.get_position(symbol)
        override_usd: float | None = None
        for a in args[1:]:
            if a.lower().startswith("usd="):
                try:
                    override_usd = float(a.split("=", 1)[1].replace(",", ""))
                except ValueError:
                    cmd.log_error(f"Geçersiz miktar: {a}")
                    return

        if pos is None and override_usd is None:
            cmd.log_error(f"{symbol} açık pozisyon yok. Miktar belirtin: hedge {args[0]} usd=500")
            return

        from ..core.enums import OrderStatus, PositionSide

        if pos is not None:
            hedge_side = "sell" if pos.side == PositionSide.LONG else "buy"
            # Mevcut pozisyonla aynı NOTIONAL'da hedge açmak istiyoruz.
            # submit_order amount_usd'yi marjin olarak yorumluyor, o yüzden
            # marjin = notional / leverage hesaplayıp veriyoruz.
            current_notional = override_usd if override_usd else (pos.quantity * (pos.current_price or pos.entry_price))
            leverage = max(pos.leverage, 1)
            usd_amount = float(current_notional) / leverage
            side_name = "SHORT" if pos.side == PositionSide.LONG else "LONG"
        else:
            # Pozisyon yok, override_usd ile yeni short hedge (varsayılan)
            hedge_side = "sell"
            usd_amount = override_usd  # type: ignore[assignment]
            leverage = 1
            side_name = "SHORT"

        if not usd_amount or usd_amount <= 0:
            cmd.log_error("Hedge tutarı belirlenemedi")
            return

        try:
            order = await self._execution_engine.submit_order(
                symbol=symbol,
                side=hedge_side,
                amount_usd=float(usd_amount),
                order_type="market",
                leverage=leverage,
            )
        except Exception as e:
            cmd.log_error(f"Hedge başarısız: {e}")
            return

        if order.status == OrderStatus.FILLED:
            cmd.log_message(
                f"  Hedge açıldı: {symbol} {side_name} ${usd_amount:,.2f} x{leverage} "
                f"qty={order.quantity:.4f} @ {fmt_price(order.fill_price or 0)}",
                "success",
            )
        else:
            cmd.log_error(
                f"Hedge {order.status.value}: {order.error or order.risk_reject_reason or ''}",
            )
