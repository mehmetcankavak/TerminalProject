from __future__ import annotations

from cryptoterminal.news.tradfi_support import build_tradfi_support_matrix


def test_tradfi_support_matrix_summary_counts() -> None:
    matrix = build_tradfi_support_matrix()
    assert matrix["summary"]["total"] >= 1
    assert matrix["summary"]["ready"] >= 1


def test_tradfi_support_matrix_marks_brent_ready() -> None:
    matrix = build_tradfi_support_matrix()
    brent = next(row for row in matrix["rows"] if row["asset_id"] == "BRENT")
    assert brent["status"] == "ready"
    assert brent["chart_ready"] is True
    assert brent["trade_ready"] is True
    assert "BZUSDT" in brent["tradable_symbols"]


def test_tradfi_support_matrix_marks_unmapped_index_partial() -> None:
    matrix = build_tradfi_support_matrix()
    dxy = next(row for row in matrix["rows"] if row["asset_id"] == "DXY")
    assert dxy["status"] == "partial"
    assert dxy["news_ready"] is True
    assert dxy["chart_ready"] is False
    assert dxy["trade_ready"] is False


def test_tradfi_support_matrix_marks_spx_ready_via_spy_proxy() -> None:
    matrix = build_tradfi_support_matrix()
    spx = next(row for row in matrix["rows"] if row["asset_id"] == "SPX")
    assert spx["status"] == "ready"
    assert spx["tradable_symbols"] == ["SPYUSDT"]


def test_tradfi_support_matrix_marks_ndx_ready_via_qqq_proxy() -> None:
    matrix = build_tradfi_support_matrix()
    ndx = next(row for row in matrix["rows"] if row["asset_id"] == "NDX")
    assert ndx["status"] == "ready"
    assert ndx["tradable_symbols"] == ["QQQUSDT"]
