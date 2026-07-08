# CryptoTerminal

Haber bazlı kripto trading terminali. Web uygulaması, iOS native app ve Python CLI olarak çalışır.

**Production:** http://51.20.93.124 (AWS EC2 — Railway'deki eski production kapatıldı,
`railway.toml`/`render.yaml`/`fly.toml` artık kullanılmayan geçmiş deneme dosyaları)

---

## Stack

| Katman | Teknoloji |
|--------|-----------|
| Backend | Python 3.12, FastAPI, asyncpg, structlog, slowapi (rate limit) |
| Frontend | React 18, Vite, TanStack Query |
| CLI | Textual (terminal UI) |
| Mobile | Capacitor (iOS) |
| Exchange / DEX | ccxt, Hyperliquid SDK, eth-account |
| Web3 | wagmi, viem, WalletConnect |
| Haber kaynakları | feedparser, Telethon (Telegram) |
| Veritabanı | PostgreSQL, Redis |
| CI/CD | GitHub Actions (OIDC), gitleaks, Trivy |
| Altyapı | Terraform, AWS (EC2, RDS, ElastiCache, ECR), Docker |

---

## Mimari — AWS DevOps Altyapısı

Production, Terraform ile kod olarak tanımlanmış (`terraform/` dizini) bir AWS ortamında
çalışır: **http://51.20.93.124**. Projenin ilk sürümü Railway'de barındırılıyordu; CI/CD
ve Infrastructure as Code pratiklerini gerçek bir üretim ortamında uygulamak için altyapı
tamamen AWS'e taşındı ve Railway kapatıldı.

```mermaid
flowchart TB
    subgraph GH["GitHub"]
        Push["git push (main)"] --> Test["test + ruff + pytest"]
        Push --> Secrets["secrets-scan (gitleaks)"]
        Test --> Build["Docker build"]
        Secrets --> Build
        Build --> Scan["Trivy: CRITICAL CVE taraması"]
    end

    subgraph AWS["AWS (eu-north-1)"]
        Scan -->|"OIDC - anahtarsiz kimlik dogrulama"| ECR["ECR\ncryptoterminal:sha + latest"]
        Scan --> Deploy["SSM Run Command\n(deploy job)"]

        Deploy -->|"pull + up + /healthz kontrolü\nbaşarısızsa otomatik rollback"| EC2["EC2 t3.micro\nnginx + app container"]
        ECR --> EC2

        EC2 --> RDS[("RDS PostgreSQL\nprivate subnet")]
        EC2 --> Redis[("ElastiCache Redis\nprivate subnet")]
        EC2 -->|awslogs driver| Logs["CloudWatch Logs\n/cryptoterminal/app"]

        RDS --> Alarms["CloudWatch Alarms\n(CPU, disk, status-check,\napp error rate)"]
        EC2 --> Alarms
        Logs --> Alarms
        Alarms --> SNS["SNS"] --> Mail["E-posta bildirimi"]
    end

    User(("Kullanıcı")) -->|HTTP :80| EC2

    TF["Terraform\n(terraform/*.tf)"] -.->|"import + apply\n(state = gerçeklik)"| AWS
```

**Akış:** `main`'e her push → test/lint/pytest + gitleaks secret taraması paralel çalışır →
Docker image build edilir → Trivy CRITICAL açık ararsa push durur → image ECR'a gider →
GitHub Actions, OIDC ile aldığı geçici AWS rolüyle SSM üzerinden EC2'ye yeni image'ı
çektirir. Deploy script'i `/healthz` endpoint'ini birkaç kez dener; sağlıklı cevap
gelmezse bir önceki image'a otomatik geri döner. Hiçbir SSH key'i veya AWS access key'i
GitHub'da secret olarak saklanmaz. Tüm altyapı (`network.tf`, `compute.tf`, `database.tf`,
`iam.tf`, `monitoring.tf`) Terraform ile kod olarak tanımlıdır ve `terraform plan` sıfır
fark gösterir.

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
├── terraform/         # AWS altyapısı (IaC) — network, compute, database, iam, monitoring
├── .github/workflows/ # CI/CD pipeline (test, secrets-scan, build, deploy)
├── docker-compose.yml
├── Dockerfile
└── nginx/nginx.conf   # Reverse proxy, rate limiting
```

---

## Deploy (AWS — otomatik)

Deploy manuel değildir: `main` dalına push edildiğinde `.github/workflows/ci.yml`
pipeline'ı otomatik olarak test eder, tarar, image build edip ECR'a gönderir ve SSM
üzerinden EC2'ye dağıtır (yukarıdaki mimari akışa bakın). Manuel deploy gerekmez.

Altyapıda değişiklik yapmak için (`terraform/` dizininden):

```bash
terraform plan     # ne değişecek göster
terraform apply    # uygula
```

**Kritik notlar:**
- `VITE_API_URL` Dockerfile'da `ARG` olarak tanımlanmalı ve CI'da `--build-arg` ile geçilmeli
- `DATABASE_URL`/`REDIS_URL` EC2 üzerindeki `.env` dosyasında tutulur, Terraform state'ine veya Git'e girmez
- `bcrypt>=3.0,<4.0` — bcrypt 4.x ile passlib 1.7 uyumsuz
- Production'da `API_BASE = ''` (relative URL) olmalı
