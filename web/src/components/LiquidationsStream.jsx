import { useState, useEffect, useCallback } from 'react'
import { API_BASE } from '../config'
import FeatureSpotlight from './FeatureSpotlight'

// Honest data architecture:
//   • Global 24H total + per-coin breakdown → CMC public liquidation API (no key, real numbers, 3min refresh)
//   • Live ticker → backend WS broadcast from OKX + Bybit perp streams (only CEXes still publishing
//     public liquidation events as of 2026). Anything below $10K filtered.

function fmtM(v) {
  if (!v) return '$0'
  if (v >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B'
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'M'
  if (v >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'K'
  return '$' + v.toFixed(0)
}

const PERIODS = [
  { key: 'h1',  label: '1H'  },
  { key: 'h4',  label: '4H'  },
  { key: 'h12', label: '12H' },
  { key: 'h24', label: '24H' },
]

// Contrarian reading: long liq = longs flushed = BULLISH; short liq = shorts squeezed = BEARISH
// score = (long - short) / total, range -1..+1
function LiqSentiment({ stats, h1Pressure }) {
  if (!stats?.h24) {
    return (
      <div className="liq-sentiment-wrap liq-sentiment-loading">
        <div className="liq-section-hdr">SENTIMENT · LOADING…</div>
      </div>
    )
  }
  const longL  = stats.h24.long  || 0
  const shortL = stats.h24.short || 0
  const total  = longL + shortL
  const score  = total > 0 ? (longL - shortL) / total : 0
  const verdict = score >  0.3 ? 'BULLISH' : score < -0.3 ? 'BEARISH' : 'NEUTRAL'
  const tone    = verdict === 'BULLISH' ? '#00e87a' : verdict === 'BEARISH' ? '#f43f5e' : '#aaa'
  const pct     = Math.max(0, Math.min(100, (score + 1) * 50))
  const dominant = longL > shortL * 1.5 ? 'LONG WIPED'
                 : shortL > longL * 1.5 ? 'SHORT SQUEEZE'
                 :                        'BALANCED'

  return (
    <div className="liq-sentiment-wrap">
      <div className="liq-sentiment-top">
        <div className="liq-section-hdr">SENTIMENT · LIQUIDATION · 24H</div>
        <div className="liq-sentiment-verdict" style={{ color: tone }}>
          <span className="liq-sentiment-score">{score >= 0 ? '+' : ''}{score.toFixed(2)}</span>
          <span className="liq-sentiment-label">{verdict}</span>
        </div>
      </div>

      <div className="liq-gauge-wrap">
        <div className="liq-gauge-track">
          <div className="liq-gauge-gradient" />
          <div className="liq-gauge-center-line" />
          <div className="liq-gauge-dot" style={{ left: pct + '%', background: tone, boxShadow: `0 0 10px ${tone}99` }} />
        </div>
        <div className="liq-gauge-labels">
          <span>BEARISH</span>
          <span>NEUTRAL</span>
          <span>BULLISH</span>
        </div>
      </div>

      <div className="liq-sub-cards">
        <div className="liq-sub-card" style={{ background: 'rgba(244,63,94,0.06)', border: '1px solid rgba(244,63,94,0.15)' }}>
          <div className="liq-sub-card-title" style={{ color: '#f43f5e' }}>LONG LIQ</div>
          <div className="liq-sub-card-value">{fmtM(longL)}</div>
          <div className="liq-sub-card-note">longs flushed</div>
        </div>
        <div className="liq-sub-card" style={{ background: 'rgba(0,232,122,0.06)', border: '1px solid rgba(0,232,122,0.15)' }}>
          <div className="liq-sub-card-title" style={{ color: '#00e87a' }}>SHORT LIQ</div>
          <div className="liq-sub-card-value">{fmtM(shortL)}</div>
          <div className="liq-sub-card-note">shorts squeezed</div>
        </div>
        <div className="liq-sub-card" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="liq-sub-card-title" style={{ color: '#aaa' }}>DOMINANT</div>
          <div className="liq-sub-card-value" style={{ color: tone, fontSize: 13 }}>{dominant}</div>
          <div className="liq-sub-card-note">
            {longL > 0 && shortL > 0
              ? (longL > shortL ? (longL / shortL).toFixed(1) + 'x long' : (shortL / longL).toFixed(1) + 'x short')
              : '—'}
          </div>
        </div>
        <div className="liq-sub-card" style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.15)' }}>
          <div className="liq-sub-card-title" style={{ color: '#fbbf24' }}>1H PRESSURE</div>
          <div className="liq-sub-card-value">{fmtM(h1Pressure)}</div>
          <div className="liq-sub-card-note">last hour pace</div>
        </div>
      </div>
    </div>
  )
}

function PeriodCard({ label, total, long, short, active, onClick }) {
  const longPct = total > 0 ? (long / total) * 100 : 50
  return (
    <button className={`liq-period-card ${active ? 'active' : ''}`} onClick={onClick}>
      <div className="liq-period-label">{label}</div>
      <div className="liq-period-total">{fmtM(total)}</div>
      <div className="liq-period-bar-track">
        <div className="liq-period-bar-fill" style={{ width: longPct + '%' }} />
      </div>
      <div className="liq-period-bar-labels">
        <span style={{ color: '#00e87a' }}>L {Math.round(longPct)}%</span>
        <span style={{ color: '#f43f5e' }}>S {Math.round(100 - longPct)}%</span>
      </div>
    </button>
  )
}

function HotCoinRow({ rank, coin, long, short }) {
  const total   = long + short
  const longPct = total > 0 ? (long / total) * 100 : 50
  return (
    <div className="liq-hot-row">
      <div className="liq-hot-rank">#{rank}</div>
      <div className="liq-hot-coin">{coin}</div>
      <div className="liq-hot-bar-col">
        <div className="liq-hot-bar-track">
          <div className="liq-hot-bar-fill" style={{ width: longPct + '%' }} />
        </div>
        <div className="liq-hot-bar-subs">
          <span style={{ color: '#00e87a' }}>Long {fmtM(long)}</span>
          <span style={{ color: '#f43f5e' }}>Short {fmtM(short)}</span>
        </div>
      </div>
      <div className="liq-hot-total">{fmtM(total)}</div>
    </div>
  )
}

function CardSkeleton() {
  return (
    <div className="liq-period-card">
      <div style={{ height: 13, width: 24, borderRadius: 4, background: 'rgba(255,255,255,0.06)', marginBottom: 8 }} />
      <div style={{ height: 16, width: 52, borderRadius: 4, background: 'rgba(255,255,255,0.08)', marginBottom: 9 }} />
      <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.05)' }} />
    </div>
  )
}

export default function LiquidationsStream() {
  const [stats,        setStats]        = useState(null)
  const [coinMap,      setCoinMap]      = useState({})
  const [activePeriod, setActivePeriod] = useState('h24')

  const fetchStats = useCallback(async () => {
    try {
      const res  = await fetch(`${API_BASE}/api/liq-stats`)
      const data = await res.json()
      if (data?.stats) setStats(data.stats)
      if (data?.coins) setCoinMap(data.coins)
    } catch {}
  }, [])

  useEffect(() => {
    fetchStats()
    const id = setInterval(fetchStats, 3 * 60_000)
    return () => clearInterval(id)
  }, [fetchStats])

  const topCoins = Object.entries(coinMap)
    .map(([coin, v]) => ({ coin, long: v.long || 0, short: v.short || 0, total: (v.long || 0) + (v.short || 0) }))
    .filter(x => x.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 20)

  const periodCards = PERIODS.map(({ key, label }) => ({
    key, label,
    total: (stats?.[key]?.long || 0) + (stats?.[key]?.short || 0),
    long:   stats?.[key]?.long  || 0,
    short:  stats?.[key]?.short || 0,
  }))

  const total24 = (stats?.h24?.long || 0) + (stats?.h24?.short || 0)
  const long24  = stats?.h24?.long  || 0
  const short24 = stats?.h24?.short || 0

  return (
    <div className="liq-page">

      <FeatureSpotlight
        featureKey="liquidations"
        title="Likidasyonlar Akışı"
        description="Binance, OKX ve Bybit'ten anlık long/short likidasyon verilerini takip edin. Büyük likidasyon dalgaları kısa vadeli trend dönüşlerini işaret edebilir."
      />

      {/* Header */}
      <div className="liq-page-header">
        <div>
          <div className="liq-page-title">Liquidation Stream</div>
          <div className="liq-page-subtitle">
            <span className="liq-page-source">CMC public liquidation data · refreshes every 3 min</span>
          </div>
        </div>
        {total24 > 0 && (
          <div className="liq-page-24h">
            <div className="liq-page-24h-label">24H GLOBAL</div>
            <div className="liq-page-24h-total">{fmtM(total24)}</div>
            <div className="liq-page-24h-subs">
              <span style={{ color: '#00e87a' }}>Long {fmtM(long24)}</span>
              <span style={{ color: '#f43f5e' }}>Short {fmtM(short24)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Sentiment gauge */}
      <LiqSentiment stats={stats} h1Pressure={(stats?.h1?.long || 0) + (stats?.h1?.short || 0)} />

      {/* Period cards */}
      <div className="liq-section">
        <div className="liq-section-hdr liq-section-hdr-row">
          <span>PERIOD SUMMARY · GLOBAL</span>
        </div>
        <div className="liq-period-row">
          {stats === null
            ? PERIODS.map(p => <CardSkeleton key={p.key} />)
            : periodCards.map(c => (
                <PeriodCard
                  key={c.key}
                  label={c.label}
                  total={c.total}
                  long={c.long}
                  short={c.short}
                  active={activePeriod === c.key}
                  onClick={() => setActivePeriod(c.key)}
                />
              ))
          }
        </div>
      </div>

      {/* Most liquidated — full width expanded */}
      <div className="liq-section liq-section-expanded">
        <div className="liq-section-hdr liq-section-hdr-row">
          <span>MOST LIQUIDATED · 24H</span>
          <span className="liq-section-count">{topCoins.length} coins</span>
        </div>
        <div className="liq-panel">
          {topCoins.length === 0 ? (
            <div className="liq-empty">Loading data…</div>
          ) : (
            <div className="liq-hot-grid">
              {topCoins.map((c, i) => (
                <HotCoinRow key={c.coin} rank={i + 1} coin={c.coin} long={c.long} short={c.short} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
