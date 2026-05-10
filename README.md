# CryptoTerminal

Haber bazlı kripto trading terminali. Web uygulaması, iOS native app ve Python CLI olarak çalışır.

**Production:** https://cryptoterminal-production.up.railway.app

---

## Stack

| Katman | Teknoloji |
|--------|-----------|
| Backend | Python 3.12, FastAPI, asyncpg |
| Frontend | React 18, Vite, TanStack Query |
| Mobile | Capacitor (iOS) |
| Veritabanı | PostgreSQL, Redis |
| Deploy | Railway, Docker |

---

## Özellikler

- Gerçek zamanlı kripto fiyatları ve grafikler (lightweight-charts)
- Haber akışı + entity resolution ile coin eşleştirme
- Risk motoru ve portfolio takibi
- Hyperliquid DEX entegrasyonu
- Web3 cüzdan bağlantısı (wagmi / WalletConnect)
- Google OAuth girişi
- Push bildirimleri (mobil)
- Telegram haber kaynağı (Telethon)

---

## Kurulum

### Gereksinimler

- Python 3.12+
- Node.js 20+
- Docker & Docker Compose
- Xcode (iOS build için)

### Backend

```bash
# Bağımlılıkları kur
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"

# Veritabanlarını başlat
docker compose up -d

# Sunucuyu çalıştır
PYTHONPATH=src .venv/bin/python -m cryptoterminal.web.runner --port 8001
```

### Web

```bash
cd web
npm install
npm run dev        # http://localhost:3000 (proxy → 8001)
npm run build      # production bundle → web-dist/
```

### iOS (Capacitor)

```bash
cd mobile
npm run sync       # web'i build edip iOS'a senkronize eder
npm run open       # Xcode'da aç
```

---

## Ortam Değişkenleri

`.env` dosyası oluştur (`.env.example` yoksa aşağıdakini baz al):

```env
DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5433/cryptoterminal
REDIS_URL=redis://localhost:6380
SECRET_KEY=your-secret-key
VITE_API_URL=http://localhost:8001
```

---

## Proje Yapısı

```
terminal/
├── src/cryptoterminal/
│   ├── auth/          # JWT, OAuth, kullanıcı yönetimi
│   ├── market/        # Fiyat akışları, exchange entegrasyonları
│   ├── news/          # Haber çekme, entity resolution
│   ├── risk/          # Risk motoru
│   ├── portfolio/     # Portfolio ve bakiye takibi
│   ├── execution/     # Order yönetimi (Hyperliquid)
│   ├── notifications/ # Push bildirim altyapısı
│   ├── web/           # FastAPI route'ları
│   └── cli/           # Terminal UI (Textual)
├── web/               # React frontend
├── mobile/            # Capacitor iOS wrapper
├── docker-compose.yml
├── Dockerfile
└── railway.toml
```

---

## Deploy (Railway)

```bash
railway up --service cryptoterminal --detach
```

**Kritik notlar:**
- `VITE_API_URL` Dockerfile'da `ARG` olarak tanımlanmalı
- `DATABASE_URL` ve `REDIS_URL` Railway'de elle set edilmeli
- `bcrypt>=3.0,<4.0` — bcrypt 4.x ile passlib 1.7 uyumsuz
- Production'da `API_BASE = ''` (relative URL) olmalı
