"""
Telegram Alert Bot — kullanıcılara outbound bildirim gönderir.

Kullanım:
  1. @BotFather'dan bot oluştur → token al
  2. .env'e TELEGRAM_ALERT_BOT_TOKEN=<token> ekle
  3. Kullanıcı bota /start yazar → chat_id'yi site ayarlarından girer
  4. Sistem price alert / order fill / HIGH haber gelince mesaj atar

Bağımlılık: httpx (zaten projede mevcut)
"""
from __future__ import annotations

import asyncio
from typing import Optional

import httpx
import structlog

logger = structlog.get_logger(__name__)

_TG_API = "https://api.telegram.org/bot{token}/{method}"


class TelegramAlertBot:
    def __init__(self, token: str) -> None:
        self._token = token
        self._enabled = bool(token)

    async def send(self, chat_id: str | int, text: str, parse_mode: str = "HTML") -> bool:
        """Tek bir chat_id'ye mesaj gönderir. Başarı True, hata False döner."""
        if not self._enabled:
            return False
        url = _TG_API.format(token=self._token, method="sendMessage")
        try:
            async with httpx.AsyncClient(timeout=8) as client:
                r = await client.post(url, json={
                    "chat_id": chat_id,
                    "text": text,
                    "parse_mode": parse_mode,
                    "disable_web_page_preview": True,
                })
            ok = r.json().get("ok", False)
            if not ok:
                logger.warning("tg_send_failed", chat_id=chat_id, desc=r.json().get("description"))
            return ok
        except Exception as e:
            logger.warning("tg_send_error", chat_id=chat_id, error=str(e))
            return False

    async def send_to_many(self, chat_ids: list[str | int], text: str) -> None:
        """Birden fazla chat_id'ye paralel gönderir."""
        if not self._enabled or not chat_ids:
            return
        await asyncio.gather(*[self.send(cid, text) for cid in chat_ids], return_exceptions=True)

    # ── Hazır mesaj şablonları ───────────────────────────────────

    def fmt_price_alert(self, coin: str, direction: str, target: float, current: float) -> str:
        arrow = "🔺" if direction == "above" else "🔻"
        return (
            f"{arrow} <b>Fiyat Alarmı: {coin}</b>\n"
            f"Hedef: <b>${target:,.4f}</b> ({direction})\n"
            f"Şu an: <b>${current:,.4f}</b>\n"
            f"<i>CryptoTerminal</i>"
        )

    def fmt_order_filled(self, symbol: str, side: str, price: float, qty: float, mode: str) -> str:
        icon = "🟢" if side.lower() in ("buy", "long") else "🔴"
        return (
            f"{icon} <b>Emir Gerçekleşti [{mode}]</b>\n"
            f"{symbol} <b>{side.upper()}</b>\n"
            f"Fiyat: <b>${price:,.4f}</b>  Miktar: <b>{qty:.4f}</b>\n"
            f"<i>CryptoTerminal</i>"
        )

    def fmt_high_news(self, headline: str, source: str, latency_ms: Optional[int]) -> str:
        lat = f"  ⚡ {latency_ms}ms" if latency_ms else ""
        return (
            f"🚨 <b>ACİL HABER</b>{lat}\n"
            f"{headline}\n"
            f"<i>Kaynak: {source}</i>"
        )

    def fmt_sl_tp(self, symbol: str, kind: str, price: float, pnl: float) -> str:
        icon = "🛑" if kind == "sl" else "🎯"
        label = "Stop-Loss" if kind == "sl" else "Take-Profit"
        sign = "+" if pnl >= 0 else ""
        return (
            f"{icon} <b>{label} Tetiklendi</b>\n"
            f"{symbol} @ <b>${price:,.4f}</b>\n"
            f"PnL: <b>{sign}${pnl:,.2f}</b>\n"
            f"<i>CryptoTerminal</i>"
        )


_bot: Optional[TelegramAlertBot] = None


def get_bot() -> TelegramAlertBot:
    global _bot
    if _bot is None:
        from ..config.settings import get_settings
        token = get_settings().telegram_alert_bot_token
        _bot = TelegramAlertBot(token)
    return _bot
