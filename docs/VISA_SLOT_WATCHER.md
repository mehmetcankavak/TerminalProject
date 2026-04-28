# US Visa Slot Watcher

Bu script randevu almaz, CAPTCHA cozmez, onay butonlarina basmaz. Tarayiciyi acar,
giris ve randevu takvimi ekranina gelme isi sende kalir. Script sadece sayfadaki
metni izler ve uygun slot ihtimali gorurse Telegram bildirimi gonderir.

## 1. Telegram ayarlari

`.env` dosyasina sunlari ekle:

```env
TELEGRAM_ALERT_BOT_TOKEN=123456:botfather_token
VISA_WATCHER_TELEGRAM_CHAT_ID=123456789
VISA_WATCHER_URL=https://www.usvisascheduling.com/
VISA_WATCHER_INTERVAL=180
```

Chat id'yi bulmak icin bota Telegram'da `/start` yaz, sonra su URL'yi tarayicida ac:

```text
https://api.telegram.org/botBOT_TOKENIN/getUpdates
```

Yanitta `chat.id` olarak gorunen sayiyi `VISA_WATCHER_TELEGRAM_CHAT_ID` yap.

## 2. Telegram test

```bash
.venv/bin/python scripts/visa_slot_watcher.py --telegram-test
```

## 3. Watcher'i baslat

```bash
.venv/bin/python scripts/visa_slot_watcher.py --url https://www.usvisascheduling.com/ --interval 180
```

Tarayici acilinca:

1. Hesabina manuel giris yap.
2. CAPTCHA veya guvenlik sorusu varsa kendin gec.
3. Randevu takvimi / reschedule ekranina kadar gel.
4. Terminali acik birak.

Default mod pasiftir: sayfayi yenilemez, sadece acik ekrandaki metni kontrol
eder. Uygunluk ihtimali gorurse Telegram'a alarm yollar ve
`data/visa_watcher/latest-alert.png` ekran goruntusunu kaydeder.

Takvim ekraninda script yalnizca sayfadaki DOM'u okur:

- Takvimde disabled olmayan, tiklanabilir gorunen gun var mi?
- `Gonder` / `Submit` benzeri buton aktif mi?

Script tarih secmez, butona basmaz, form gondermez, CAPTCHA veya guvenlik
sorularina dokunmaz.

Sayfayi otomatik yenilemek istersen bunu bilerek ac:

```bash
.venv/bin/python scripts/visa_slot_watcher.py --url https://www.usvisascheduling.com/ --interval 600 --reload
```

Temkinli kullanim icin `--reload` acmadan calistir, sayfayi ara ara kendin manuel
yenile. Script yenilemeden sonra degisen metni gorurse alarm verir.

Daha dusuk riskli otomatik kontrol icin seyrek yenileme kullan:

```bash
.venv/bin/python scripts/visa_slot_watcher.py --url https://www.usvisascheduling.com/ --interval 1800 --reload
```

## 4. Yanlis alarm olursa regex'i daralt

Sistemler sayfa metnini degistirebildigi icin ilk calistirmada false positive
olabilir. Terminalde yazan `reason=` kismina gore regexleri `.env` icinde
daraltabilirsin:

```env
VISA_WATCHER_AVAILABLE_REGEX=(?i)select appointment date|earliest available|available appointments
VISA_WATCHER_UNAVAILABLE_REGEX=(?i)no appointments? (?:are )?available|there are no available appointments|no slots? available
```

`ais.usvisa-info.com` kullaniyorsan URL'yi o domain ile baslat:

```bash
.venv/bin/python scripts/visa_slot_watcher.py --url https://ais.usvisa-info.com/
```
