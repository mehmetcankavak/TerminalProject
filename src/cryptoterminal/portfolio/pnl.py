from __future__ import annotations

from ..core.enums import PositionSide


def calc_realized_pnl(
    entry_price: float,
    exit_price: float,
    quantity: float,
    side: PositionSide,
    fees: float = 0.0,
) -> float:
    direction = 1 if side == PositionSide.LONG else -1
    return (exit_price - entry_price) * quantity * direction - fees


def calc_funding_fee(notional: float, funding_rate: float, side: PositionSide) -> float:
    """
    Tek bir funding periyodunun ödeme/gelirini hesaplar.

    Pozitif funding_rate:  LONG öder  → negatif etki
                           SHORT alır → pozitif etki
    Negatif funding_rate:  SHORT öder → negatif etki
                           LONG alır  → pozitif etki

    Döndürülen değer pozitifse bakiyeye eklenir, negatifse çıkarılır.
    """
    payment = notional * abs(funding_rate)
    if funding_rate >= 0:
        return payment if side == PositionSide.SHORT else -payment
    else:
        return payment if side == PositionSide.LONG else -payment


def calc_notional(quantity: float, price: float) -> float:
    return quantity * price
