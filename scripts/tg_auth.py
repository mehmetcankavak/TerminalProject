#!/usr/bin/env python3
"""
Telegram MTProto — Tek Seferlik Auth Script
============================================
Sunucuyu başlatmadan önce bu scripti bir kez çalıştır.
Session dosyasını oluşturur, sonraki başlatmalarda kod sormaz.

Kullanım:
    cd /Users/mehmetcan/Desktop/terminal
    python scripts/tg_auth.py
"""
import asyncio
import os
import sys

# src/ dizinini path'e ekle
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))


_CODE_ARG: str | None = None


async def main() -> None:
    try:
        from telethon import TelegramClient  # type: ignore
    except ImportError:
        print("HATA: telethon kurulu değil.")
        print("Çalıştır: pip install telethon")
        sys.exit(1)

    # .env'den settings yükle
    from cryptoterminal.config.settings import get_settings
    s = get_settings()

    if not s.telegram_api_id or not s.telegram_api_hash:
        print("HATA: .env dosyasında TELEGRAM_API_ID ve TELEGRAM_API_HASH eksik.")
        print("my.telegram.org adresinden alabilirsin.")
        sys.exit(1)

    if not s.telegram_phone and not s.telegram_bot_token:
        print("HATA: .env dosyasında TELEGRAM_PHONE veya TELEGRAM_BOT_TOKEN eksik.")
        sys.exit(1)

    # Session klasörünü oluştur
    session_dir = os.path.dirname(s.telegram_session)
    if session_dir:
        os.makedirs(session_dir, exist_ok=True)

    session_file = s.telegram_session + ".session"
    if os.path.exists(session_file):
        print(f"✓ Session dosyası zaten var: {session_file}")
        print("  Tekrar auth gerekmez. Sunucuyu başlatabilirsin.")
        return

    print(f"Session dosyası oluşturuluyor: {session_file}")
    print()

    client = TelegramClient(s.telegram_session, s.telegram_api_id, s.telegram_api_hash)

    try:
        if s.telegram_bot_token:
            print("Bot token ile giriş yapılıyor...")
            await client.start(bot_token=s.telegram_bot_token)
            me = await client.get_me()
            print(f"✓ Bot olarak giriş yapıldı: @{me.username}")
        else:
            print(f"Telefon numarası: {s.telegram_phone}")
            code_cb = (lambda: _CODE_ARG) if _CODE_ARG else None
            await client.start(phone=s.telegram_phone, code_callback=code_cb)
            me = await client.get_me()
            print(f"✓ Kullanıcı olarak giriş yapıldı: {me.first_name} (@{me.username or 'yok'})")

        print()
        print(f"✓ Session kaydedildi: {session_file}")
        print("  Artık sunucuyu başlatabilirsin.")
        print()

        # Yapılandırılmış kanalları test et
        channels = [c.strip() for c in s.telegram_channels.split(",") if c.strip()]
        if channels:
            print("Kanal erişimi test ediliyor...")
            for ch in channels:
                try:
                    entity = await client.get_entity(ch)
                    title = getattr(entity, "title", None) or getattr(entity, "username", ch)
                    print(f"  ✓ {ch}  →  {title}")
                except Exception as e:
                    print(f"  ✗ {ch}  →  HATA: {e}")
        else:
            print("Not: .env'de TELEGRAM_CHANNELS tanımlı değil.")

    finally:
        await client.disconnect()


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--code", default=None, help="Telegram doğrulama kodu")
    args = parser.parse_args()
    _CODE_ARG = args.code
    asyncio.run(main())
