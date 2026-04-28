"""
Email Alert Sender — kullanıcılara SMTP üzerinden bildirim gönderir.

.env anahtarları (auth modülüyle paylaşılır):
    SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM
"""
from __future__ import annotations

import asyncio
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

import structlog

logger = structlog.get_logger(__name__)

_STYLE = "font-family:monospace;background:#0a0b0f;color:#e8e6e2;padding:28px;max-width:500px;margin:0 auto;border:1px solid #1a1c25;"
_LOGO  = '<div style="color:#00d992;font-size:16px;font-weight:700;margin-bottom:20px;letter-spacing:.1em;">[CT] CRYPTOTERMINAL</div>'
_FOOT  = '<p style="color:#4e4d49;font-size:11px;margin-top:24px;">Ayarlar sayfasından email bildirimlerini kapatabilirsiniz.</p>'


def _html(body: str) -> str:
    return f'<div style="{_STYLE}">{_LOGO}{body}{_FOOT}</div>'


def _send_sync(to: str, subject: str, html: str) -> bool:
    from ..config.settings import get_settings
    s = get_settings()
    if not s.smtp_user or not s.smtp_password:
        return False
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"]    = s.smtp_from
    msg["To"]      = to
    msg.attach(MIMEText(html, "html"))
    try:
        with smtplib.SMTP(s.smtp_host, s.smtp_port, timeout=10) as srv:
            srv.starttls()
            srv.login(s.smtp_user, s.smtp_password)
            srv.sendmail(s.smtp_from, to, msg.as_string())
        return True
    except Exception as e:
        logger.warning("email_send_failed", to=to, error=str(e))
        return False


async def send_email(to: str, subject: str, html: str) -> bool:
    """Async wrapper — blocking SMTP çağrısını executor'da çalıştırır."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _send_sync, to, subject, html)


# ── Hazır şablonlar ─────────────────────────────────────────────────────────

async def send_price_alert(to: str, coin: str, direction: str, target: float, current: float) -> bool:
    arrow = "▲" if direction == "above" else "▼"
    color = "#00d992" if direction == "above" else "#ff3b5c"
    body = f"""
<p style="font-size:18px;font-weight:700;color:{color};margin:0 0 16px;">{arrow} Fiyat Alarmı: {coin}</p>
<table style="width:100%;border-collapse:collapse;">
  <tr><td style="color:#b0ada8;padding:6px 0;">Hedef</td><td style="color:#e8e6e2;font-weight:700;">${target:,.4f} ({direction})</td></tr>
  <tr><td style="color:#b0ada8;padding:6px 0;">Güncel Fiyat</td><td style="color:{color};font-weight:700;">${current:,.4f}</td></tr>
</table>"""
    return await send_email(to, f"[CT] {arrow} {coin} Fiyat Alarmı — ${target:,.2f}", _html(body))


async def send_order_filled(
    to: str, symbol: str, side: str, price: float, qty: float, mode: str,
    notional: float = 0.0, leverage: int = 1, liq_price: Optional[float] = None,
) -> bool:
    icon  = "🟢" if side.lower() in ("buy", "long") else "🔴"
    color = "#00d992" if side.lower() in ("buy", "long") else "#ff3b5c"
    liq_row = f'<tr><td style="color:#b0ada8;padding:6px 0;">⚠ Likidasyon</td><td style="color:#ff3b5c;font-weight:700;">${liq_price:,.4f}</td></tr>' if liq_price else ""
    body = f"""
<p style="font-size:18px;font-weight:700;color:{color};margin:0 0 16px;">{icon} Emir Gerçekleşti [{mode}]</p>
<table style="width:100%;border-collapse:collapse;">
  <tr><td style="color:#b0ada8;padding:6px 0;">Sembol</td><td style="color:#e8e6e2;font-weight:700;">{symbol}</td></tr>
  <tr><td style="color:#b0ada8;padding:6px 0;">Yön</td><td style="color:{color};font-weight:700;">{side.upper()}</td></tr>
  <tr><td style="color:#b0ada8;padding:6px 0;">Giriş Fiyatı</td><td style="color:#e8e6e2;">${price:,.4f}</td></tr>
  <tr><td style="color:#b0ada8;padding:6px 0;">Miktar</td><td style="color:#e8e6e2;">{qty:.6f}</td></tr>
  <tr><td style="color:#b0ada8;padding:6px 0;">İşlem Büyüklüğü</td><td style="color:#e8e6e2;font-weight:700;">${notional:,.2f}</td></tr>
  <tr><td style="color:#b0ada8;padding:6px 0;">Kaldıraç</td><td style="color:#f0b90b;font-weight:700;">{leverage}x</td></tr>
  {liq_row}
</table>"""
    subject = f"[CT] {icon} {symbol} {side.upper()} {leverage}x @ ${price:,.2f} | ${notional:,.0f}"
    return await send_email(to, subject, _html(body))


async def send_position_closed(
    to: str, symbol: str, side: str,
    entry_price: float, exit_price: float,
    realized_pnl: float, notional: float = 0.0, leverage: int = 1,
) -> bool:
    pnl_pct = (realized_pnl / notional * 100) if notional else 0.0
    is_profit = realized_pnl >= 0
    pnl_color = "#00d992" if is_profit else "#ff3b5c"
    pnl_sign  = "+" if is_profit else ""
    icon      = "🟢" if side.lower() in ("buy", "long") else "🔴"
    body = f"""
<p style="font-size:18px;font-weight:700;color:{pnl_color};margin:0 0 16px;">{icon} Pozisyon Kapatıldı — {symbol}</p>
<table style="width:100%;border-collapse:collapse;">
  <tr><td style="color:#b0ada8;padding:6px 0;">Sembol</td><td style="color:#e8e6e2;font-weight:700;">{symbol}</td></tr>
  <tr><td style="color:#b0ada8;padding:6px 0;">Yön</td><td style="color:#e8e6e2;font-weight:700;">{side.upper()}</td></tr>
  <tr><td style="color:#b0ada8;padding:6px 0;">Giriş Fiyatı</td><td style="color:#e8e6e2;">${entry_price:,.4f}</td></tr>
  <tr><td style="color:#b0ada8;padding:6px 0;">Çıkış Fiyatı</td><td style="color:#e8e6e2;">${exit_price:,.4f}</td></tr>
  <tr><td style="color:#b0ada8;padding:6px 0;">İşlem Büyüklüğü</td><td style="color:#e8e6e2;font-weight:700;">${notional:,.2f}</td></tr>
  <tr><td style="color:#b0ada8;padding:6px 0;">Kaldıraç</td><td style="color:#f0b90b;font-weight:700;">{leverage}x</td></tr>
  <tr><td style="color:#b0ada8;padding:6px 0;">Gerçekleşen P&L</td><td style="color:{pnl_color};font-weight:700;">{pnl_sign}${realized_pnl:,.2f} ({pnl_sign}{pnl_pct:.2f}%)</td></tr>
</table>"""
    pnl_label = f"{pnl_sign}${realized_pnl:,.2f}"
    subject = f"[CT] {icon} {symbol} Kapatıldı — P&L: {pnl_label}"
    return await send_email(to, subject, _html(body))


async def send_high_news(to: str, headline: str, source: str, latency_ms: Optional[int] = None) -> bool:
    lat = f'<span style="color:#e5a236;font-size:11px;">⚡ {latency_ms}ms latency</span>' if latency_ms else ""
    body = f"""
<p style="font-size:16px;font-weight:700;color:#ff3b5c;margin:0 0 12px;">🚨 ACİL HABER</p>
{lat}
<p style="color:#e8e6e2;font-size:14px;line-height:1.5;margin:12px 0;">{headline}</p>
<p style="color:#4e4d49;font-size:12px;">Kaynak: {source}</p>"""
    return await send_email(to, f"[CT] 🚨 {headline[:60]}…", _html(body))
