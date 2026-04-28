from __future__ import annotations

from cryptoterminal.execution.hyperliquid_executor import _compose_hl_balance, _hl_api_base


def test_hl_balance_composes_perp_spot_and_margin_fields() -> None:
    perp = {
        "withdrawable": "207.25",
        "marginSummary": {
            "accountValue": "207.50",
            "totalMarginUsed": "61.75",
            "totalUnrealizedPnl": "-0.25",
        },
        "crossMarginSummary": {
            "accountValue": "207.50",
            "totalMarginUsed": "61.75",
        },
    }
    spot = {"balances": [{"coin": "USDC", "total": "62.00"}]}

    bal = _compose_hl_balance(perp, spot)

    assert bal["account_value"] == 269.5
    assert bal["total"] == 269.5
    assert bal["withdrawable"] == 269.25
    assert bal["available"] == 269.25
    assert bal["total_margin_used"] == 61.75
    assert bal["unrealized_pnl"] == -0.25
    assert bal["perp_account_value"] == 207.5
    assert bal["spot_usdc"] == 62.0


def test_hl_api_base_follows_connected_network() -> None:
    assert _hl_api_base(False) == "https://api.hyperliquid.xyz"
    assert _hl_api_base(True) == "https://api.hyperliquid-testnet.xyz"
