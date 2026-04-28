#!/usr/bin/env python3
"""
US visa appointment slot watcher.

This tool does not book, reschedule, bypass CAPTCHA, or click appointment
confirmation controls. It opens a normal browser profile, lets you sign in
manually, and alerts you when the visible page text looks like an appointment
slot may be available.

First run:
    .venv/bin/python scripts/visa_slot_watcher.py --url https://www.usvisascheduling.com/

Useful flags:
    --url https://ais.usvisa-info.com/
    --interval 180
    --reload
    --available-regex "April|May|June|Available Appointments"
    --unavailable-regex "No appointments are available|There are no available appointments"
"""
from __future__ import annotations

import argparse
import asyncio
import hashlib
import html
import os
import re
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable
from urllib.parse import urlparse

try:
    import httpx
except ImportError:  # pragma: no cover - shown as setup help for local use
    httpx = None  # type: ignore[assignment]


DEFAULT_UNAVAILABLE_RE = (
    r"(?i)"
    r"no appointments? (?:are )?available|"
    r"there are no available appointments|"
    r"no slots? available|"
    r"currently no appointments|"
    r"no earlier appointments|"
    r"randevu bulunmamaktadir|"
    r"randevu bulunmamaktadır|"
    r"uygun randevu yok|"
    r"bos randevu yok|"
    r"boş randevu yok"
)

DEFAULT_AVAILABLE_RE = (
    r"(?i)"
    r"available appointments?|"
    r"earliest available|"
    r"select appointment date|"
    r"choose appointment|"
    r"appointment date|"
    r"uygun randevu|"
    r"randevu tarihi|"
    r"tarih sec|"
    r"tarih seç"
)

DEFAULT_LOGIN_RE = (
    r"(?i)"
    r"sign in|"
    r"log in|"
    r"login|"
    r"username|"
    r"password|"
    r"security question|"
    r"captcha|"
    r"giris yap|"
    r"giriş yap|"
    r"oturum ac|"
    r"oturum aç|"
    r"kullanici adi|"
    r"kullanıcı adı|"
    r"sifre|"
    r"şifre"
)

STATE_DIR = Path("data/visa_watcher")
DEFAULT_PROFILE_DIR = STATE_DIR / "browser-profile"
LAST_STATE_FILE = STATE_DIR / "last_state.txt"
SCREENSHOT_FILE = STATE_DIR / "latest-alert.png"


@dataclass(frozen=True)
class WatchState:
    label: str
    should_alert: bool
    reason: str


@dataclass(frozen=True)
class CalendarSignal:
    has_open_day: bool
    open_days: tuple[str, ...]
    submit_enabled: bool
    reason: str


def load_env(path: Path = Path(".env")) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def collapse_text(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def text_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8", errors="ignore")).hexdigest()[:16]


def compile_regex(pattern: str) -> re.Pattern[str]:
    try:
        return re.compile(pattern)
    except re.error as exc:
        raise SystemExit(f"Regex hatali: {pattern}\n{exc}") from exc


def classify(
    text: str,
    url: str,
    available_re: re.Pattern[str],
    unavailable_re: re.Pattern[str],
    login_re: re.Pattern[str],
    alert_on_change: bool,
) -> WatchState:
    body = collapse_text(text)
    available_match = available_re.search(body)
    unavailable_match = unavailable_re.search(body)
    login_match = login_re.search(body)

    if login_match:
        return WatchState("login_required", True, f"login_regex: {login_match.group(0)!r}")
    if available_match and not unavailable_match:
        return WatchState("possible_slot", True, f"available_regex: {available_match.group(0)!r}")
    if unavailable_match:
        return WatchState("no_slot", False, f"unavailable_regex: {unavailable_match.group(0)!r}")
    if alert_on_change:
        return WatchState("unknown_changed", True, "known 'no slot' text was not found")

    host = urlparse(url).netloc or "current page"
    return WatchState("unknown", False, f"watched {host}, but no known slot text matched")


async def inspect_calendar(page) -> CalendarSignal:
    """Read-only calendar inspection. Does not click, type, submit, or fetch."""
    data = await page.evaluate(
        """
        () => {
          const visible = (el) => {
            const style = window.getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            return style.visibility !== 'hidden' &&
                   style.display !== 'none' &&
                   rect.width > 0 &&
                   rect.height > 0;
          };

          const disabledLike = (el) => {
            const cls = (el.className || '').toString().toLowerCase();
            const ariaDisabled = (el.getAttribute('aria-disabled') || '').toLowerCase();
            return el.disabled === true ||
                   ariaDisabled === 'true' ||
                   cls.includes('disabled') ||
                   cls.includes('unselectable') ||
                   cls.includes('inactive') ||
                   cls.includes('ui-state-disabled');
          };

          const candidates = [];
          const selector = [
            '.ui-datepicker-calendar td',
            '.ui-datepicker-calendar a',
            '.ui-datepicker-calendar button',
            '[role="gridcell"]',
            'td',
            'button',
            'a'
          ].join(',');

          for (const el of Array.from(document.querySelectorAll(selector))) {
            if (!visible(el) || disabledLike(el)) continue;

            const text = (el.innerText || el.textContent || '').trim();
            if (!/^\\d{1,2}$/.test(text)) continue;

            const parentDisabled = el.closest('[aria-disabled="true"], .disabled, .ui-state-disabled, .inactive, .unselectable');
            if (parentDisabled) continue;

            const clickable = el.matches('a,button,[onclick],[role="button"],[tabindex]') ||
                              el.querySelector('a,button,[onclick],[role="button"],[tabindex]');
            if (!clickable) continue;

            candidates.push(text);
          }

          const submitButtons = Array.from(document.querySelectorAll('button,input[type="submit"],input[type="button"]'))
            .filter(visible)
            .filter((el) => {
              const text = ((el.innerText || el.value || el.getAttribute('aria-label') || '') + '').toLowerCase();
              return text.includes('gönder') || text.includes('gonder') || text.includes('submit') || text.includes('continue');
            });

          const submitEnabled = submitButtons.some((el) => !disabledLike(el));
          return {
            openDays: Array.from(new Set(candidates)).slice(0, 20),
            submitEnabled
          };
        }
        """
    )
    open_days = tuple(str(day) for day in data.get("openDays", []))
    submit_enabled = bool(data.get("submitEnabled", False))
    has_open_day = bool(open_days)
    if has_open_day:
        reason = f"calendar_clickable_days: {', '.join(open_days[:10])}"
    elif submit_enabled:
        reason = "submit_button_enabled"
    else:
        reason = "no clickable calendar day found"
    return CalendarSignal(has_open_day, open_days, submit_enabled, reason)


async def send_telegram(text: str) -> bool:
    token = os.getenv("VISA_WATCHER_TELEGRAM_BOT_TOKEN") or os.getenv("TELEGRAM_ALERT_BOT_TOKEN")
    chat_id = os.getenv("VISA_WATCHER_TELEGRAM_CHAT_ID")
    if not token or not chat_id:
        print("[telegram] VISA_WATCHER_TELEGRAM_CHAT_ID veya TELEGRAM_ALERT_BOT_TOKEN eksik.")
        return False
    if httpx is None:
        print("[telegram] httpx kurulu degil. Kur: .venv/bin/python -m pip install httpx")
        return False

    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML",
        "disable_web_page_preview": True,
    }
    async with httpx.AsyncClient(timeout=12) as client:
        response = await client.post(url, json=payload)
    data = response.json()
    if not data.get("ok"):
        print(f"[telegram] gonderilemedi: {data}")
        return False
    return True


def notification_text(state: WatchState, page_url: str, snippet: str) -> str:
    escaped_url = html.escape(page_url)
    escaped_reason = html.escape(state.reason)
    escaped_snippet = html.escape(snippet[:900])
    return (
        "🚨 <b>Vize randevu sayfasinda hareket var</b>\n"
        f"Durum: <b>{html.escape(state.label)}</b>\n"
        f"Neden: <code>{escaped_reason}</code>\n"
        f"Saat: <code>{html.escape(now_iso())}</code>\n"
        f"URL: {escaped_url}\n\n"
        f"<pre>{escaped_snippet}</pre>"
    )


def calendar_notification_text(signal: CalendarSignal, page_url: str) -> str:
    escaped_url = html.escape(page_url)
    escaped_reason = html.escape(signal.reason)
    days = ", ".join(signal.open_days[:20]) if signal.open_days else "gun listesi yok"
    return (
        "🚨 <b>Vize takviminde bosluk ihtimali var</b>\n"
        f"Neden: <code>{escaped_reason}</code>\n"
        f"Gorunen gunler: <b>{html.escape(days)}</b>\n"
        f"Saat: <code>{html.escape(now_iso())}</code>\n"
        f"URL: {escaped_url}\n\n"
        "Randevuyu sen manuel kontrol edip almalisin."
    )


def print_setup_help() -> None:
    print("Playwright kurulu degil.")
    print("Kurulum:")
    print("  .venv/bin/python -m pip install playwright")
    print("  .venv/bin/python -m playwright install chromium")
    print()
    print("Sonra tekrar calistir:")
    print("  .venv/bin/python scripts/visa_slot_watcher.py --url https://www.usvisascheduling.com/")


async def run(args: argparse.Namespace) -> None:
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        print_setup_help()
        raise SystemExit(2)

    STATE_DIR.mkdir(parents=True, exist_ok=True)
    args.profile_dir.mkdir(parents=True, exist_ok=True)

    available_re = compile_regex(args.available_regex)
    unavailable_re = compile_regex(args.unavailable_regex)

    print("[watcher] Basliyor.")
    print(f"[watcher] Profil: {args.profile_dir}")
    print(f"[watcher] Ilk URL: {args.url}")
    print("[watcher] Tarayicida manuel giris yap; randevu takvim/yeniden planlama ekranina gel.")
    print("[watcher] Script sadece izler ve bildirim atar; randevu almaz.")
    if args.reload:
        print(f"[watcher] Reload modu acik: her {args.interval} saniyede sayfa yenilenecek.")
    else:
        print("[watcher] Pasif mod: sayfa yenilenmeyecek, sadece acik ekrandaki metin okunacak.")

    async with async_playwright() as p:
        context = await p.chromium.launch_persistent_context(
            user_data_dir=str(args.profile_dir),
            headless=False,
            viewport={"width": 1360, "height": 900},
            slow_mo=50,
        )
        page = context.pages[0] if context.pages else await context.new_page()
        await page.goto(args.url, wait_until="domcontentloaded")

        last_hash = LAST_STATE_FILE.read_text(encoding="utf-8").strip() if LAST_STATE_FILE.exists() else ""
        sent_for_hashes: set[str] = set()
        login_re = compile_regex(args.login_regex)

        while True:
            try:
                if args.reload:
                    await page.reload(wait_until="domcontentloaded", timeout=args.timeout_ms)
                await page.wait_for_timeout(args.settle_ms)
                body_text = await page.locator("body").inner_text(timeout=args.timeout_ms)
                current_url = page.url
                digest = text_hash(body_text + current_url)
                state = classify(
                    body_text,
                    current_url,
                    available_re,
                    unavailable_re,
                    login_re,
                    args.alert_on_change,
                )
                calendar_signal = await inspect_calendar(page)

                changed = digest != last_hash
                print(
                    f"[{now_iso()}] {state.label} changed={changed} "
                    f"reason={state.reason} calendar={calendar_signal.reason}"
                )

                if state.should_alert and digest not in sent_for_hashes:
                    await page.screenshot(path=str(SCREENSHOT_FILE), full_page=True)
                    ok = await send_telegram(notification_text(state, current_url, collapse_text(body_text)))
                    print(f"[alert] telegram={'ok' if ok else 'not_sent'} screenshot={SCREENSHOT_FILE}")
                    sent_for_hashes.add(digest)

                calendar_digest = "calendar:" + text_hash(
                    current_url
                    + "|".join(calendar_signal.open_days)
                    + str(calendar_signal.submit_enabled)
                )
                if (calendar_signal.has_open_day or calendar_signal.submit_enabled) and calendar_digest not in sent_for_hashes:
                    await page.screenshot(path=str(SCREENSHOT_FILE), full_page=True)
                    ok = await send_telegram(calendar_notification_text(calendar_signal, current_url))
                    print(f"[calendar-alert] telegram={'ok' if ok else 'not_sent'} screenshot={SCREENSHOT_FILE}")
                    sent_for_hashes.add(calendar_digest)

                if changed:
                    LAST_STATE_FILE.write_text(digest, encoding="utf-8")
                    last_hash = digest

            except KeyboardInterrupt:
                print("\n[watcher] Durduruldu.")
                break
            except Exception as exc:
                print(f"[watcher] hata: {exc!r}")

            await asyncio.sleep(args.interval)

        await context.close()


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="US visa appointment slot watcher")
    parser.add_argument("--url", default=os.getenv("VISA_WATCHER_URL", "https://www.usvisascheduling.com/"))
    parser.add_argument("--interval", type=int, default=int(os.getenv("VISA_WATCHER_INTERVAL", "180")))
    parser.add_argument("--profile-dir", type=Path, default=Path(os.getenv("VISA_WATCHER_PROFILE_DIR", DEFAULT_PROFILE_DIR)))
    parser.add_argument("--available-regex", default=os.getenv("VISA_WATCHER_AVAILABLE_REGEX", DEFAULT_AVAILABLE_RE))
    parser.add_argument("--unavailable-regex", default=os.getenv("VISA_WATCHER_UNAVAILABLE_REGEX", DEFAULT_UNAVAILABLE_RE))
    parser.add_argument("--login-regex", default=os.getenv("VISA_WATCHER_LOGIN_REGEX", DEFAULT_LOGIN_RE))
    parser.add_argument("--timeout-ms", type=int, default=int(os.getenv("VISA_WATCHER_TIMEOUT_MS", "30000")))
    parser.add_argument("--settle-ms", type=int, default=int(os.getenv("VISA_WATCHER_SETTLE_MS", "5000")))
    parser.add_argument("--alert-on-change", action="store_true", default=os.getenv("VISA_WATCHER_ALERT_ON_CHANGE", "").lower() in {"1", "true", "yes"})
    parser.add_argument("--reload", action="store_true", default=os.getenv("VISA_WATCHER_RELOAD", "").lower() in {"1", "true", "yes"}, help="Sayfayi belirlenen aralikla yenile.")
    parser.add_argument("--no-reload", action="store_true", help=argparse.SUPPRESS)
    parser.add_argument("--telegram-test", action="store_true", help="Telegram ayarlarini test mesaji ile dene ve cik.")
    args = parser.parse_args(list(argv))
    if args.no_reload:
        args.reload = False
    return args


async def main(argv: Iterable[str]) -> None:
    load_env()
    args = parse_args(argv)
    if args.telegram_test:
        ok = await send_telegram("✅ <b>Visa watcher test bildirimi</b>\nTelegram baglantisi calisiyor.")
        raise SystemExit(0 if ok else 1)
    await run(args)


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1:]))
