from __future__ import annotations

from dataclasses import asdict, dataclass

from .assets_registry import AssetsRegistry, get_registry


@dataclass
class TradFiSupportRow:
    asset_id: str
    display_name: str
    asset_type: str
    tradable_symbols: list[str]
    news_ready: bool
    chart_ready: bool
    trade_ready: bool
    status: str
    notes: list[str]


def build_tradfi_support_matrix(registry: AssetsRegistry | None = None) -> dict[str, object]:
    reg = registry or get_registry()
    rows: list[TradFiSupportRow] = []

    for asset in reg.all_assets():
        if asset.asset_type not in {"equity", "etf", "commodity", "index"}:
            continue

        has_symbols = bool(asset.tradable_symbols)
        notes: list[str] = []

        # Registry presence means explicit headlines / aliases can resolve.
        news_ready = True

        # Current UI chart + order flows use Binance-style USDT symbols.
        chart_ready = has_symbols
        trade_ready = has_symbols

        if not has_symbols:
            notes.append("No Binance tradable symbol mapped yet")

        if asset.asset_id == "SPX" and asset.tradable_symbols == ["SPYUSDT"]:
            notes.append("Uses SPYUSDT as Binance TradFi proxy for S&P 500 exposure")

        if asset.asset_id == "NDX" and asset.tradable_symbols == ["QQQUSDT"]:
            notes.append("Uses QQQUSDT as Binance TradFi proxy for Nasdaq 100 exposure")

        if asset.asset_type == "index" and not has_symbols:
            notes.append("Index asset is theme-detectable but not chart/trade-ready")

        if asset.asset_type == "etf" and not has_symbols:
            notes.append("ETF asset resolves in news but still needs live symbol integration")

        if chart_ready and trade_ready:
            status = "ready"
        elif news_ready:
            status = "partial"
        else:
            status = "missing"

        rows.append(
            TradFiSupportRow(
                asset_id=asset.asset_id,
                display_name=asset.display_name,
                asset_type=asset.asset_type,
                tradable_symbols=asset.tradable_symbols,
                news_ready=news_ready,
                chart_ready=chart_ready,
                trade_ready=trade_ready,
                status=status,
                notes=notes,
            )
        )

    rows.sort(key=lambda row: (row.status != "ready", row.asset_type, row.asset_id))

    summary = {
        "ready": sum(1 for row in rows if row.status == "ready"),
        "partial": sum(1 for row in rows if row.status == "partial"),
        "missing": sum(1 for row in rows if row.status == "missing"),
        "total": len(rows),
    }

    return {
        "summary": summary,
        "rows": [asdict(row) for row in rows],
    }
