"""Real-time Telegram via MTProto (Telethon) — sub-second news.

Complements the HTTP t.me/s/ poller (telegram_sniper). When a StringSession +
API credentials are configured, this opens a persistent MTProto connection and
fires on every new message instantly (no polling delay).

It forwards each message to the sniper's `_publish`, reusing the same dedup,
entity-resolution and normalization. Because dedup keys on (channel, msg_id),
whichever path sees a message first wins and the other is suppressed — so the
4 s HTTP poller stays as a safety net with zero double-posting.

MTProto only delivers messages from channels the account has JOINED, so we
best-effort join the configured channels on startup (flood-safe, idempotent).
"""
from __future__ import annotations

import asyncio

import structlog

logger = structlog.get_logger(__name__)


class TelegramMTProtoListener:
    def __init__(self, sniper, settings) -> None:
        self._sniper = sniper
        self.settings = settings
        self._client = None
        self._task: asyncio.Task | None = None
        self._running = False

    def is_configured(self) -> bool:
        return bool(
            getattr(self.settings, "telegram_session_string", "")
            and self.settings.telegram_api_id
            and self.settings.telegram_api_hash
            and self._sniper._channels
        )

    async def start(self) -> None:
        if self._running:
            return
        if not self.is_configured():
            logger.info("tg_mtproto_disabled",
                        reason="no session string / api creds / channels")
            return
        self._running = True
        self._task = asyncio.create_task(self._run(), name="telegram_mtproto")

    async def stop(self) -> None:
        self._running = False
        if self._client is not None:
            try:
                await self._client.disconnect()
            except Exception:
                pass
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except (asyncio.CancelledError, Exception):
                pass
            self._task = None

    def _default_prio(self):
        from .normalize import NewsPriority
        try:
            return NewsPriority[self.settings.telegram_news_priority.upper()]
        except (KeyError, AttributeError):
            return NewsPriority.HIGH

    async def _join_channels(self, client) -> None:
        """Best-effort join so MTProto delivers these channels in real time.
        Flood-safe: spaces out joins and backs off on FloodWaitError."""
        from telethon.tl.functions.channels import JoinChannelRequest
        from telethon.errors import FloodWaitError
        joined = skipped = 0
        for ch in self._sniper._channels:
            if not self._running:
                return
            try:
                await client(JoinChannelRequest(ch))
                joined += 1
                await asyncio.sleep(1.5)  # gentle on anti-spam
            except FloodWaitError as e:
                logger.warning("tg_mtproto_join_flood", wait_s=getattr(e, "seconds", None))
                break  # stop joining this cycle; already-followed channels still work
            except Exception:
                skipped += 1  # already member / private / bad username — fine
        logger.info("tg_mtproto_join_done", joined=joined, skipped=skipped)

    async def _run(self) -> None:
        from telethon import TelegramClient, events
        from telethon.sessions import StringSession

        # Map lower(username) → configured spelling so dedup news_id matches the
        # HTTP poller exactly (poller uses the configured channel name).
        target = {c.lower(): c for c in self._sniper._channels}

        backoff = 5
        while self._running:
            try:
                self._client = TelegramClient(
                    StringSession(self.settings.telegram_session_string),
                    int(self.settings.telegram_api_id),
                    self.settings.telegram_api_hash,
                )
                await self._client.connect()
                if not await self._client.is_user_authorized():
                    logger.error("tg_mtproto_not_authorized",
                                 hint="TELEGRAM_SESSION_STRING geçersiz/expired — yeniden login")
                    return
                me = await self._client.get_me()
                await self._join_channels(self._client)

                @self._client.on(events.NewMessage)
                async def _handler(event):  # noqa: ANN001
                    try:
                        text = event.message.message or ""
                        if not text.strip():
                            return
                        chat = await event.get_chat()
                        uname = (getattr(chat, "username", "") or "").lower()
                        ch = target.get(uname)
                        if not ch:
                            return  # not one of our channels
                        await self._sniper._publish(
                            ch, event.message.id, text,
                            event.message.date.isoformat(), self._default_prio(),
                        )
                    except Exception as e:
                        logger.debug("tg_mtproto_handler_error", error=str(e))

                logger.info("tg_mtproto_connected",
                            user=(me.username or me.first_name),
                            channels=len(target))
                backoff = 5
                await self._client.run_until_disconnected()
            except asyncio.CancelledError:
                return
            except Exception as e:
                logger.warning("tg_mtproto_error", error=str(e), retry_in=backoff)
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 120)
