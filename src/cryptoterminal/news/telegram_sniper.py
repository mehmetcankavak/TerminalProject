"""
Telegram News Sniper
────────────────────
Primary:  HTTP polling via t.me/s/ (no credentials needed, works without MTProto)
Fallback: MTProto via Telethon (requires proxy when MTProto is blocked)

.env keys:
    TELEGRAM_CHANNELS=@whale_alert,@cryptoquant_official,...
    TELEGRAM_NEWS_PRIORITY=HIGH

Optional MTProto (when proxy available):
    TELEGRAM_API_ID=12345678
    TELEGRAM_API_HASH=abcdef...
    TELEGRAM_PHONE=+90...
    TELEGRAM_SESSION=data/tg_sniper
    TELEGRAM_PROXY_TYPE=socks5         # socks5 | mtproxy
    TELEGRAM_PROXY_HOST=127.0.0.1
    TELEGRAM_PROXY_PORT=1080
    TELEGRAM_PROXY_SECRET=             # only for mtproxy
"""
from __future__ import annotations

import asyncio
import hashlib
import html
import re
from datetime import datetime, timedelta, timezone
from html.parser import HTMLParser
from typing import Optional

import structlog

from ..config.settings import Settings
from ..core import event_bus as events
from ..core.enums import NewsPriority
from ..core.event_bus import EventBus
from ..core.models import NormalizedNews
from .dedup import get_shared_deduplicator
from .source_meta import infer_source_meta
from .normalize import determine_event_type, determine_priority, elevate_priority, resolve_entities

logger = structlog.get_logger(__name__)

# ── Coin hash-map (O(1) lookup per token) ─────────────────────────────────────
_COIN_MAP: dict[str, str] = {
    "bitcoin": "BTC", "btc": "BTC", "$btc": "BTC",
    "ethereum": "ETH", "eth": "ETH", "$eth": "ETH", "ether": "ETH",
    "solana": "SOL", "sol": "SOL", "$sol": "SOL",
    "xrp": "XRP", "$xrp": "XRP", "ripple": "XRP",
    "bnb": "BNB", "$bnb": "BNB", "binance coin": "BNB",
    "dogecoin": "DOGE", "doge": "DOGE", "$doge": "DOGE",
    "cardano": "ADA", "ada": "ADA", "$ada": "ADA",
    "avalanche": "AVAX", "avax": "AVAX", "$avax": "AVAX",
    "hyperliquid": "HYPE", "hype": "HYPE", "$hype": "HYPE",
    "sui": "SUI", "$sui": "SUI",
    "polkadot": "DOT", "dot": "DOT", "$dot": "DOT",
    "chainlink": "LINK", "link": "LINK", "$link": "LINK",
    "toncoin": "TON", "ton": "TON", "$ton": "TON",
    "tron": "TRX", "trx": "TRX", "$trx": "TRX",
    "near": "NEAR", "$near": "NEAR", "near protocol": "NEAR",
    "aptos": "APT", "apt": "APT", "$apt": "APT",
    "litecoin": "LTC", "ltc": "LTC", "$ltc": "LTC",
    "bitcoin cash": "BCH", "bch": "BCH", "$bch": "BCH",
    "uniswap": "UNI", "uni": "UNI", "$uni": "UNI",
    "arbitrum": "ARB", "arb": "ARB", "$arb": "ARB",
    "optimism": "OP", "op": "OP", "$op": "OP",
    "cosmos": "ATOM", "atom": "ATOM", "$atom": "ATOM",
    "polygon": "POL", "pol": "POL", "$pol": "POL", "matic": "POL",
    "injective": "INJ", "inj": "INJ", "$inj": "INJ",
    "celestia": "TIA", "tia": "TIA", "$tia": "TIA",
    "sei": "SEI", "$sei": "SEI",
    "jupiter": "JUP", "jup": "JUP", "$jup": "JUP",
    "pyth": "PYTH", "$pyth": "PYTH",
    "dogwifhat": "WIF", "wif": "WIF", "$wif": "WIF",
    "pepe": "PEPE", "$pepe": "PEPE",
    "render": "RNDR", "rndr": "RNDR", "$rndr": "RNDR",
    "immutable": "IMX", "imx": "IMX", "$imx": "IMX", "immutablex": "IMX",
    "lido": "LDO", "ldo": "LDO", "$ldo": "LDO",
    "stacks": "STX", "stx": "STX", "$stx": "STX",
    "ordi": "ORDI", "$ordi": "ORDI", "ordinals": "ORDI",
    "worldcoin": "WLD", "wld": "WLD", "$wld": "WLD",
    "pendle": "PENDLE", "$pendle": "PENDLE",
    "gmx": "GMX", "$gmx": "GMX",
    "dydx": "DYDX", "$dydx": "DYDX",
    "aave": "AAVE", "$aave": "AAVE",
    "synthetix": "SNX", "snx": "SNX", "$snx": "SNX",
    "curve": "CRV", "crv": "CRV", "$crv": "CRV",
    "ethena": "ENA", "ena": "ENA", "$ena": "ENA",
    "compound": "COMP", "comp": "COMP", "$comp": "COMP",
    "sushiswap": "SUSHI", "sushi": "SUSHI", "$sushi": "SUSHI",
    "ens": "ENS", "$ens": "ENS", "ethereum name service": "ENS",
    "blur": "BLUR", "$blur": "BLUR",
    "gala": "GALA", "$gala": "GALA",
    "sandbox": "SAND", "sand": "SAND", "$sand": "SAND",
    "axie": "AXS", "axs": "AXS", "$axs": "AXS", "axie infinity": "AXS",
    "internet computer": "ICP", "icp": "ICP", "$icp": "ICP",
    "sonic": "S", "$s": "S",
    "algorand": "ALGO", "algo": "ALGO", "$algo": "ALGO",
    "hedera": "HBAR", "hbar": "HBAR", "$hbar": "HBAR",
    "ethereum classic": "ETC", "etc": "ETC", "$etc": "ETC",
    "stellar": "XLM", "xlm": "XLM", "$xlm": "XLM",
    "bittensor": "TAO", "tao": "TAO", "$tao": "TAO",
    "eigenlayer": "EIGEN", "eigen": "EIGEN", "$eigen": "EIGEN",
    "celo": "CELO", "$celo": "CELO",
    "iota": "IOTA", "$iota": "IOTA",
    "neo": "NEO", "$neo": "NEO",
    "zcash": "ZEC", "zec": "ZEC", "$zec": "ZEC",
    "dash": "DASH", "$dash": "DASH",
    "starknet": "STRK", "strk": "STRK", "$strk": "STRK",
    "jito": "JTO", "jto": "JTO", "$jto": "JTO",
    "ondo": "ONDO", "$ondo": "ONDO",
    "sky": "SKY", "$sky": "SKY",
    "wormhole": "W", "$w": "W",
    "apecoin": "APE", "ape": "APE", "$ape": "APE",
    "arweave": "AR", "ar": "AR", "$ar": "AR",
    "notcoin": "NOT", "not": "NOT", "$not": "NOT",
    "conflux": "CFX", "cfx": "CFX", "$cfx": "CFX",
    "stepn": "GMT", "gmt": "GMT", "$gmt": "GMT",
    "mina": "MINA", "$mina": "MINA",
    "tellor": "TRB", "trb": "TRB", "$trb": "TRB",
    "reserve": "RSR", "rsr": "RSR", "$rsr": "RSR",
    "yield guild": "YGG", "ygg": "YGG", "$ygg": "YGG",
    "virtual": "VIRTUAL", "$virtual": "VIRTUAL", "virtuals": "VIRTUAL",
    "aerodrome": "AERO", "aero": "AERO", "$aero": "AERO",
    "layerzero": "ZRO", "zro": "ZRO", "$zro": "ZRO",
    "berachain": "BERA", "bera": "BERA", "$bera": "BERA",
    "peanut": "PNUT", "pnut": "PNUT", "$pnut": "PNUT",
    "etherfi": "ETHFI", "ethfi": "ETHFI", "$ethfi": "ETHFI", "ether.fi": "ETHFI",
    "movement": "MOVE", "move": "MOVE", "$move": "MOVE",
    "book of meme": "BOME", "bome": "BOME", "$bome": "BOME",
    "brett": "BRETT", "$brett": "BRETT",
    "mew": "MEW", "$mew": "MEW",
    "pudgy penguins": "PENGU", "pengu": "PENGU", "$pengu": "PENGU",
    "popcat": "POPCAT", "$popcat": "POPCAT",
    "people": "PEOPLE", "$people": "PEOPLE", "constitutiondao": "PEOPLE",
    "zetachain": "ZETA", "zeta": "ZETA", "$zeta": "ZETA",
    "turbo": "TURBO", "$turbo": "TURBO",
    "kaito": "KAITO", "$kaito": "KAITO",
    "grass": "GRASS", "$grass": "GRASS",
    "moodeng": "MOODENG", "$moodeng": "MOODENG", "moo deng": "MOODENG",
    "magic eden": "ME", "$me": "ME",
    "spx": "SPX", "$spx": "SPX", "spx6900": "SPX",
}

_TOKEN_RE = re.compile(r'\$[A-Za-z]+|[A-Za-z]+')

_HIGH_KEYWORDS = frozenset([
    "hack", "exploit", "hacked", "breach", "emergency",
    "sec", "etf", "approved", "rejected", "listing", "delisting",
    "ban", "banned", "regulation", "crash", "blackrock",
    "fed", "federal reserve", "rate hike", "rate cut", "sanctions",
    "bankrupt", "collapse", "liquidated", "flash crash", "whale",
    "pump", "dump", "scam", "rug", "police", "arrest",
])

_MED_KEYWORDS = frozenset([
    "partnership", "launch", "update", "upgrade", "fork",
    "airdrop", "mainnet", "testnet", "integration", "funding",
    "staking", "yield", "acquisition",
])

_STRIP_TAGS_RE = re.compile(r'<[^>]+>')
_MSG_ID_RE = re.compile(r'data-post="[^/]+/(\d+)"')
_MSG_POST_RE = re.compile(r'data-post="([^/"]+)/(\d+)"')
_MSG_BODY_RE = re.compile(r'class="tgme_widget_message_text[^"]*"[^>]*>(.*?)</div>', re.DOTALL)
_MSG_DT_RE = re.compile(r'datetime="([^"]+)"')

_HTTP_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
}


def _extract_message_entries(html: str) -> list[tuple[int, str, str]]:
    entries: list[tuple[int, str, str]] = []
    post_matches = list(_MSG_POST_RE.finditer(html))
    if not post_matches:
        return entries

    for idx, match in enumerate(post_matches):
        msg_id = int(match.group(2))
        start = match.start()
        end = post_matches[idx + 1].start() if idx + 1 < len(post_matches) else len(html)
        chunk = html[start:end]
        body_match = _MSG_BODY_RE.search(chunk)
        dt_match = _MSG_DT_RE.search(chunk)
        if not body_match or not dt_match:
            continue
        text = _STRIP_TAGS_RE.sub("", body_match.group(1)).strip()
        text = html.unescape(re.sub(r"\s+", " ", text))
        if len(text) < 10:
            continue
        entries.append((msg_id, text, dt_match.group(1)))

    return entries


class _TelegramMessageHTMLParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.entries: list[tuple[int, str, str]] = []
        self._current_id: int | None = None
        self._current_dt: str = ""
        self._current_text_parts: list[str] = []
        self._capture_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr_map = dict(attrs)
        data_post = attr_map.get("data-post")
        if data_post and "/" in data_post:
            self._flush()
            try:
                self._current_id = int(data_post.rsplit("/", 1)[-1])
            except Exception:
                self._current_id = None
            self._current_dt = ""
            self._current_text_parts = []
            self._capture_depth = 0

        if self._current_id is None:
            return

        if not self._current_dt and attr_map.get("datetime"):
            self._current_dt = str(attr_map["datetime"])

        class_name = attr_map.get("class") or ""
        if "tgme_widget_message_text" in class_name or "js-message_text" in class_name:
            self._capture_depth += 1
        elif self._capture_depth > 0:
            self._capture_depth += 1

    def handle_endtag(self, tag: str) -> None:
        if self._capture_depth > 0:
            self._capture_depth -= 1

    def handle_data(self, data: str) -> None:
        if self._current_id is not None and self._capture_depth > 0:
            self._current_text_parts.append(data)

    def close(self) -> None:
        super().close()
        self._flush()

    def _flush(self) -> None:
        if self._current_id is None:
            return
        text = html.unescape(" ".join(self._current_text_parts))
        text = re.sub(r"\s+", " ", text).strip()
        if self._current_dt and len(text) >= 10:
            self.entries.append((self._current_id, text, self._current_dt))
        self._current_id = None
        self._current_dt = ""
        self._current_text_parts = []
        self._capture_depth = 0


def _extract_message_entries_fallback(html_text: str) -> list[tuple[int, str, str]]:
    parser = _TelegramMessageHTMLParser()
    parser.feed(html_text)
    parser.close()
    return parser.entries

_DEFAULT_CRITICAL_CHANNELS = frozenset({
    "binance_announcements",
    "bybitannouncements",
    "okxannouncements",
    "gateionews",
    "kucoin_news",
    "whale_alert",
    "lookonchain",
    "spotonchain",
    "nansen_alerts",
    "unusual_whales",
    "tier10k",
    "reuters",
    "ap",
    "bbcbreaking",
    "disclosetv",
    "sentdefender",
    "coinglass_data",
    "ninjanewstr",
    "coinmuhendisihaber",
    "ninjanewsx",
    "jrkripto",
    "uzmancoin",
    "cryptoquant_official",
    "ai_9684xtpa",
    "embercnalerts",
})

_DEFAULT_ULTRA_CRITICAL_CHANNELS = frozenset({
    "binance_announcements",
    "bybitannouncements",
    "okxannouncements",
    "gateionews",
    "kucoin_news",
    "whale_alert",
    "lookonchain",
    "spotonchain",
    "nansen_alerts",
    "unusual_whales",
    "tier10k",
    "ninjanewstr",
    "coinmuhendisihaber",
    "ninjanewsx",
    "jrkripto",
})


def _detect_coins(text: str) -> list[str]:
    """Telegram mesajındaki coin kısaltmalarını tespit eder.

    Yalnızca $-prefix'li token'ları kabul eder. Önceden düz "not", "op", "ape",
    "near", "atom" gibi yaygın İngilizce kelimeler de coin olarak işaretlenip
    yanlış primary symbol üretiyordu ("We will NOT list X" → NOTUSDT). Entity
    extractor zaten ticker formatını ve context'i değerlendiriyor; bu fonksiyon
    sadece ek bir güvenlik ağı olarak $-token'larla sınırlı kalsın.
    """
    lower = text.lower()
    tokens = _TOKEN_RE.findall(lower)
    found: dict[str, None] = {}
    for tok in tokens:
        if not tok.startswith("$"):
            continue
        sym = _COIN_MAP.get(tok) or _COIN_MAP.get(tok.lstrip("$"))
        if sym:
            found[f"{sym}USDT"] = None
    return list(found.keys())


def _detect_priority(text: str, source: str, default: NewsPriority, event_type: str) -> NewsPriority:
    detected = determine_priority(text, source, event_type)
    if any(kw in text.lower() for kw in _HIGH_KEYWORDS):
        detected = NewsPriority.HIGH
    elif any(kw in text.lower() for kw in _MED_KEYWORDS) and detected == NewsPriority.LOW:
        detected = NewsPriority.MED
    return elevate_priority(detected, default)


def _news_id(channel: str, msg_id: int) -> str:
    raw = f"tg:{channel}:{msg_id}"
    return hashlib.sha1(raw.encode()).hexdigest()[:16]


class TelegramSniper:
    """
    Polls public Telegram channels via t.me/s/ web preview.
    No credentials required. Works even when MTProto is blocked.
    Silently skips channels that have disabled web preview.
    """

    ULTRA_CRITICAL_POLL_INTERVAL = 4
    CRITICAL_POLL_INTERVAL = 6
    SECONDARY_POLL_INTERVAL = 24
    MAX_CONCURRENT_POLLS = 6  # keep t.me pressure controlled while avoiding 1-by-1 crawling
    BACKFILL_MAX_AGE = timedelta(hours=24)

    def __init__(self, bus: EventBus, settings: Settings) -> None:
        self.bus = bus
        self.settings = settings
        self._running = False
        self._tasks: list[asyncio.Task] = []
        self._dedup = get_shared_deduplicator(window_seconds=300)
        self._seen: dict[str, set[int]] = {}
        self._working_channels: list[str] = []
        self._session = None
        # Per-channel health — UI'da hangi kanal sessiz kaldı görmek için
        self._channel_health: dict[str, dict[str, object]] = {}
        try:
            self._backfill_count = max(0, int(self.settings.telegram_backfill_count))
        except Exception:
            self._backfill_count = 5

    @property
    def _channels(self) -> list[str]:
        raw = self.settings.telegram_channels.strip()
        if not raw:
            return []
        return [c.strip().lstrip("@") for c in raw.split(",") if c.strip()]

    def is_configured(self) -> bool:
        return bool(self._channels)

    def _parse_channel_override(self, raw: str) -> set[str]:
        if not raw:
            return set()
        return {c.strip().lstrip("@").lower() for c in raw.split(",") if c.strip()}

    @property
    def _ultra_set(self) -> frozenset[str]:
        override = self._parse_channel_override(self.settings.telegram_ultra_channels)
        return frozenset(override) if override else _DEFAULT_ULTRA_CRITICAL_CHANNELS

    @property
    def _critical_set(self) -> frozenset[str]:
        override = self._parse_channel_override(self.settings.telegram_critical_channels)
        base = override if override else _DEFAULT_CRITICAL_CHANNELS
        # Ultra her zaman critical sayılır
        return frozenset(base | self._ultra_set)

    @property
    def _critical_channels(self) -> list[str]:
        crit = self._critical_set
        return [c for c in self._channels if c.lower() in crit]

    @property
    def _ultra_critical_channels(self) -> list[str]:
        ultra = self._ultra_set
        return [c for c in self._channels if c.lower() in ultra]

    @property
    def _secondary_channels(self) -> list[str]:
        critical = {c.lower() for c in self._critical_channels}
        return [c for c in self._channels if c.lower() not in critical]

    @property
    def _standard_critical_channels(self) -> list[str]:
        ultra = {c.lower() for c in self._ultra_critical_channels}
        return [c for c in self._critical_channels if c.lower() not in ultra]

    async def start(self) -> None:
        if not self._channels:
            logger.info("telegram_sniper_disabled", reason="no channels configured")
            return

        try:
            import aiohttp as _aiohttp
            self._aiohttp = _aiohttp
        except ImportError:
            logger.warning(
                "telegram_sniper_disabled",
                reason="aiohttp not installed — run: pip install aiohttp",
            )
            return

        self._running = True
        if self._ultra_critical_channels:
            self._tasks.append(
                asyncio.create_task(
                    self._run_loop(self._ultra_critical_channels, self.ULTRA_CRITICAL_POLL_INTERVAL, "ultra_critical"),
                    name="tg_sniper_ultra_critical",
                )
            )
        if self._standard_critical_channels:
            self._tasks.append(
                asyncio.create_task(
                    self._run_loop(self._standard_critical_channels, self.CRITICAL_POLL_INTERVAL, "critical"),
                    name="tg_sniper_critical",
                )
            )
        if self._secondary_channels:
            self._tasks.append(
                asyncio.create_task(
                    self._run_loop(self._secondary_channels, self.SECONDARY_POLL_INTERVAL, "secondary"),
                    name="tg_sniper_secondary",
                )
            )
        logger.info(
            "telegram_sniper_starting",
            channels=len(self._channels),
            ultra_critical_channels=len(self._ultra_critical_channels),
            critical_channels=len(self._standard_critical_channels),
            secondary_channels=len(self._secondary_channels),
            mode="http_web_preview",
        )

    async def stop(self) -> None:
        self._running = False
        for task in self._tasks:
            task.cancel()
        if self._tasks:
            await asyncio.gather(*self._tasks, return_exceptions=True)
        self._tasks.clear()
        if self._session:
            try:
                await self._session.close()
            except Exception:
                pass
            self._session = None

    async def _get_session(self):
        if self._session is None or self._session.closed:
            self._session = self._aiohttp.ClientSession(headers=_HTTP_HEADERS)
        return self._session

    async def _run_loop(self, channels: list[str], poll_interval: int, lane: str) -> None:
        delay = 5
        while self._running:
            try:
                await self._poll_all(channels)
                delay = poll_interval
            except asyncio.CancelledError:
                return
            except Exception as e:
                logger.debug("telegram_sniper_loop_error", lane=lane, error=str(e))
                delay = min(delay * 2, 120)

            if not self._running:
                return
            await asyncio.sleep(delay)

    async def _poll_all(self, channels: list[str]) -> None:
        session = await self._get_session()
        semaphore = asyncio.Semaphore(self.MAX_CONCURRENT_POLLS)

        async def _poll_one(channel: str) -> None:
            async with semaphore:
                if not self._running:
                    return
                try:
                    await self._poll_channel(session, channel)
                except asyncio.CancelledError:
                    raise
                except Exception as e:
                    logger.debug("telegram_poll_error", channel=channel, error=str(e))

        await asyncio.gather(*[_poll_one(channel) for channel in channels], return_exceptions=False)

    def _touch_channel_health(self, channel: str, *, status: int | None = None,
                              error: str | None = None, new_events: int = 0) -> None:
        now = datetime.now(timezone.utc)
        bucket = self._channel_health.setdefault(channel, {
            "channel": channel,
            "last_fetch_at": None,
            "last_success_at": None,
            "last_status": None,
            "last_error": None,
            "last_error_at": None,
            "fetches_total": 0,
            "errors_total": 0,
            "events_total": 0,
            "consecutive_errors": 0,
        })
        bucket["last_fetch_at"] = now
        bucket["fetches_total"] = int(bucket["fetches_total"]) + 1
        if status is not None:
            bucket["last_status"] = status
        if error:
            bucket["last_error"] = error
            bucket["last_error_at"] = now
            bucket["errors_total"] = int(bucket["errors_total"]) + 1
            bucket["consecutive_errors"] = int(bucket["consecutive_errors"]) + 1
        else:
            bucket["last_success_at"] = now
            bucket["consecutive_errors"] = 0
            bucket["last_error"] = None
        if new_events:
            bucket["events_total"] = int(bucket["events_total"]) + new_events

    def get_channel_health(self) -> list[dict[str, object]]:
        rows = []
        for ch, b in self._channel_health.items():
            rows.append({
                **{k: (v.isoformat() if hasattr(v, "isoformat") else v) for k, v in b.items()},
            })
        rows.sort(key=lambda r: (r.get("last_success_at") is None, -(r.get("events_total") or 0)))
        return rows

    async def _poll_channel(self, session, channel: str) -> None:
        url = f"https://t.me/s/{channel}"
        timeout = self._aiohttp.ClientTimeout(total=10)
        try:
            async with session.get(url, timeout=timeout, allow_redirects=True) as resp:
                status = resp.status
                if status != 200:
                    self._touch_channel_health(channel, status=status,
                                               error=f"http_{status}")
                    return
                html = await resp.text()
        except Exception as e:
            self._touch_channel_health(channel, error=str(e)[:160])
            raise

        # İki parser'ı da çalıştır ve id'ye göre union al — regex iç içe div'de
        # metni erken kesebiliyor (Whale Alert gibi HTML-zengin mesajlarda),
        # HTMLParser daha sağlam. Her ikisinin sonuçlarını id'ye göre birleştir
        # ve daha uzun metni olanı tercih et.
        by_id: dict[int, tuple[int, str, str]] = {}
        for msg_id, text, dt_str in _extract_message_entries_fallback(html):
            by_id[msg_id] = (msg_id, text, dt_str)
        for msg_id, text, dt_str in _extract_message_entries(html):
            existing = by_id.get(msg_id)
            if existing is None or len(text) > len(existing[1]):
                by_id[msg_id] = (msg_id, text, dt_str)
        entries = list(by_id.values())

        all_ids = [int(m) for m in _MSG_ID_RE.findall(html)]
        if not all_ids and not entries:
            self._touch_channel_health(channel, status=200,
                                       error="no_messages_parsed")
            return

        if entries and not all_ids:
            all_ids = [e[0] for e in entries]

        prio_str = self.settings.telegram_news_priority.upper()
        try:
            default_prio = NewsPriority[prio_str]
        except KeyError:
            default_prio = NewsPriority.HIGH

        published_count = 0
        if channel not in self._seen:
            self._seen[channel] = set(all_ids)
            backfill_candidates = []
            cutoff = datetime.now(timezone.utc) - self.BACKFILL_MAX_AGE
            for msg_id, text, datetime_str in sorted(entries, key=lambda item: item[0], reverse=True):
                try:
                    published_at = datetime.fromisoformat(datetime_str.replace("Z", "+00:00"))
                except Exception:
                    published_at = datetime.now(timezone.utc)
                if published_at < cutoff:
                    continue
                backfill_candidates.append((msg_id, text, datetime_str))
                if len(backfill_candidates) >= self._backfill_count:
                    break
            logger.info(
                "telegram_sniper_watching",
                channel=f"@{channel}",
                latest_id=max(all_ids) if all_ids else None,
                backfill_count=len(backfill_candidates),
            )
            for msg_id, text, datetime_str in reversed(backfill_candidates):
                await self._publish(channel, msg_id, text, datetime_str, default_prio)
                published_count += 1
            self._touch_channel_health(channel, status=200, new_events=published_count)
            return

        new_ids = set(all_ids) - self._seen[channel]
        if not new_ids:
            self._touch_channel_health(channel, status=200)
            return

        self._seen[channel].update(new_ids)

        for msg_id, text, datetime_str in entries:
            if msg_id not in new_ids:
                continue
            await self._publish(channel, msg_id, text, datetime_str, default_prio)
            published_count += 1
        self._touch_channel_health(channel, status=200, new_events=published_count)

    async def _publish(
        self,
        channel: str,
        msg_id: int,
        text: str,
        datetime_str: str,
        default_prio: NewsPriority,
    ) -> None:
        try:
            published_at = datetime.fromisoformat(datetime_str.replace("Z", "+00:00"))
        except Exception:
            published_at = datetime.now(timezone.utc)

        received_at = datetime.now(timezone.utc)
        latency_ms = max(0, int((received_at - published_at).total_seconds() * 1000))
        source = f"@{channel}"
        event_type = determine_event_type(text, source)
        priority = _detect_priority(text, source, default_prio, event_type)
        news_id = _news_id(channel, msg_id)
        headline = text[:280]
        cluster = self._dedup.register(news_id, headline, source)
        if cluster.get("is_duplicate"):
            logger.debug("telegram_duplicate_suppressed", source=source, snippet=headline[:80])
            return

        entities = resolve_entities(headline, body=text if len(text) > 280 else None)
        legacy_symbols = _detect_coins(text)
        related_symbols = list(entities.related_symbols)
        for sym in legacy_symbols:
            if sym not in related_symbols:
                related_symbols.append(sym)

        news = NormalizedNews(
            id=news_id,
            headline=headline,
            source=source,
            source_priority=1,
            **infer_source_meta(source),
            event_type=event_type,
            cluster_key=cluster.get("cluster_key"),
            corroboration_count=int(cluster.get("corroboration_count", 1)),
            corroborating_sources=list(cluster.get("corroborating_sources", [])),
            first_source=cluster.get("first_source"),
            published_at=published_at,
            received_at=received_at,
            latency_ms=latency_ms,
            related_symbols=related_symbols,
            tags=[],
            priority=priority,
            url=f"https://t.me/{channel}/{msg_id}",
            raw_content=text,
            primary_symbol=entities.primary_symbol,
            primary_asset_id=entities.primary_asset_id,
            mentioned_assets=entities.mentioned_assets,
            themes=entities.themes,
            confidence=entities.confidence,
        )

        await self.bus.publish(events.NEWS_RECEIVED, {"news": news})

        logger.info(
            "telegram_news_received",
            source=source,
            symbols=related_symbols,
            priority=priority.value,
            latency_ms=latency_ms,
            snippet=headline[:80],
        )
