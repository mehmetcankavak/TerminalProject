import { useState, useEffect, useRef, useCallback } from 'react'
import { haptic } from '../../capacitor'
import { API_BASE } from '../../config'
import { useAuth } from '../../context/AuthContext'
import { useWebSocket } from '../../hooks/useWebSocket'

// Honest data architecture:
//   • Global 24H total + per-coin breakdown → CMC public liquidation API
//     (no key, real numbers, refreshed every 3min)
//   • Live ticker (real-time individual liquidations) → backend WS broadcast
//     from OKX + Bybit perp streams (the only two CEXes still publishing
//     public liquidation events as of 2026). Anything below $10K filtered.
//   • No per-exchange breakdown: Binance/HL/others don't publish public liq
//     data anymore; showing some-but-not-all would be misleading.

function fmtM(v) {
  if (!v) return '$0'
  if (v >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B'
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'M'
  if (v >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'K'
  return '$' + v.toFixed(0)
}

function ago(ts) {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000))
  if (s < 60)   return s + 's'
  if (s < 3600) return Math.floor(s / 60) + 'd'
  return Math.floor(s / 3600) + 'sa'
}

const PERIODS = [
  { key: 'h1',  label: '1H'  },
  { key: 'h4',  label: '4H'  },
  { key: 'h12', label: '12H' },
  { key: 'h24', label: '24H' },
]

// ─── Liquidation Sentiment Gauge ────────────────────────────────────────────
// Contrarian reading — standard interpretation:
//   • lots of LONG liq  → longs flushed → bottom likely → BULLISH
//   • lots of SHORT liq → shorts squeezed → top likely → BEARISH
//   score = (long_liq - short_liq) / total                  range -1..+1
// > +0.3 BULLISH (capitulation), < -0.3 BEARISH (squeeze).
function LiqSentiment({ stats, h1Pressure }) {
  if (!stats?.h24) {
    return (
      <div style={{ padding: '12px 16px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <div style={{ fontSize: 10, color: '#555', fontWeight: 700, letterSpacing: 0.5 }}>
          SENTIMENT · LİKİDASYON · yükleniyor…
        </div>
      </div>
    )
  }
  const longL  = stats.h24.long  || 0
  const shortL = stats.h24.short || 0
  const total  = longL + shortL
  const score  = total > 0 ? (longL - shortL) / total : 0
  const verdict = score >  0.3 ? 'BULLISH'
                : score < -0.3 ? 'BEARISH'
                :                'NEUTRAL'
  const tone = verdict === 'BULLISH' ? '#00d992'
             : verdict === 'BEARISH' ? '#f43f5e'
             :                          '#aaa'
  const pct = Math.max(0, Math.min(100, (score + 1) * 50))
  const dominant = longL > shortL * 1.5 ? 'LONG WIPED'
                 : shortL > longL * 1.5 ? 'SHORT SQUEEZE'
                 :                        'BALANCED'

  return (
    <div style={{ padding: '12px 16px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 10, color: '#888', fontWeight: 700, letterSpacing: 0.8 }}>
          SENTIMENT · LİKİDASYON · 24H
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 800, fontFamily: 'var(--mono)', color: tone }}>
            {score >= 0 ? '+' : ''}{score.toFixed(2)}
          </span>
          <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: 0.6, color: tone }}>
            {verdict}
          </span>
        </div>
      </div>

      {/* Gauge bar */}
      <div style={{ position: 'relative', height: 8, marginBottom: 8 }}>
        <div style={{
          position: 'absolute', inset: 0, borderRadius: 4,
          background: 'linear-gradient(to right, rgba(244,63,94,0.5) 0%, rgba(244,63,94,0.15) 35%, rgba(255,255,255,0.06) 50%, rgba(0,217,146,0.15) 65%, rgba(0,217,146,0.5) 100%)',
        }} />
        <div style={{
          position: 'absolute', top: -2, bottom: -2, left: '50%',
          width: 1, background: 'rgba(255,255,255,0.18)', transform: 'translateX(-50%)',
        }} />
        <div style={{
          position: 'absolute', top: '50%', left: pct + '%',
          width: 12, height: 12, borderRadius: '50%', background: tone,
          boxShadow: '0 0 10px ' + tone + '99',
          border: '2px solid #000', transform: 'translate(-50%, -50%)',
          transition: 'left 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        }} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, color: '#555', fontWeight: 700, letterSpacing: 0.5, marginBottom: 10 }}>
        <span>BEARISH</span>
        <span>NÖTR</span>
        <span>BULLISH</span>
      </div>

      {/* 4-card sub-panel */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
        <div style={{
          background: 'rgba(244,63,94,0.06)', border: '1px solid rgba(244,63,94,0.15)',
          borderRadius: 10, padding: '8px 8px',
        }}>
          <div style={{ fontSize: 9, fontWeight: 800, color: '#f43f5e', letterSpacing: 0.5 }}>LONG LIQ</div>
          <div style={{ fontSize: 13, fontWeight: 800, fontFamily: 'var(--mono)', color: '#fff', marginTop: 3 }}>{fmtM(longL)}</div>
          <div style={{ fontSize: 9, color: '#888', fontFamily: 'var(--mono)', marginTop: 1 }}>longlar acı çekti</div>
        </div>
        <div style={{
          background: 'rgba(0,217,146,0.06)', border: '1px solid rgba(0,217,146,0.15)',
          borderRadius: 10, padding: '8px 8px',
        }}>
          <div style={{ fontSize: 9, fontWeight: 800, color: '#00d992', letterSpacing: 0.5 }}>SHORT LIQ</div>
          <div style={{ fontSize: 13, fontWeight: 800, fontFamily: 'var(--mono)', color: '#fff', marginTop: 3 }}>{fmtM(shortL)}</div>
          <div style={{ fontSize: 9, color: '#888', fontFamily: 'var(--mono)', marginTop: 1 }}>shortlar acı çekti</div>
        </div>
        <div style={{
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 10, padding: '8px 8px',
        }}>
          <div style={{ fontSize: 9, fontWeight: 800, color: '#aaa', letterSpacing: 0.5 }}>DOMINANT</div>
          <div style={{ fontSize: 11, fontWeight: 800, fontFamily: 'var(--mono)', color: tone, marginTop: 3 }}>{dominant}</div>
          <div style={{ fontSize: 9, color: '#888', fontFamily: 'var(--mono)', marginTop: 1 }}>
            {longL > 0 && shortL > 0
              ? (longL > shortL ? (longL / shortL).toFixed(1) + 'x long' : (shortL / longL).toFixed(1) + 'x short')
              : '—'}
          </div>
        </div>
        <div style={{
          background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.15)',
          borderRadius: 10, padding: '8px 8px',
        }}>
          <div style={{ fontSize: 9, fontWeight: 800, color: '#fbbf24', letterSpacing: 0.5 }}>1H BASKI</div>
          <div style={{ fontSize: 13, fontWeight: 800, fontFamily: 'var(--mono)', color: '#fff', marginTop: 3 }}>{fmtM(h1Pressure)}</div>
          <div style={{ fontSize: 9, color: '#888', fontFamily: 'var(--mono)', marginTop: 1 }}>son saat hızı</div>
        </div>
      </div>
    </div>
  )
}

const EX_BADGE = {
  binance: { label: 'BIN', tone: '#f0b90b' },
  okx:     { label: 'OKX', tone: '#e8e8e8' },
  bybit:   { label: 'BBT', tone: '#f7a600' },
}

// ─── Period Stat Card ─────────────────────────────────────────────────────────
function PeriodCard({ label, total, long, short, active, onPress }) {
  const longPct = total > 0 ? (long / total) * 100 : 50
  return (
    <div onClick={onPress} style={{
      flex: 1, minWidth: 0, padding: '12px 10px', cursor: 'pointer',
      background: 'rgba(255,255,255,0.03)', borderRadius: 14,
    }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: active ? '#fff' : '#666', letterSpacing: 0.5, marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontSize: 15, fontWeight: 900, fontFamily: 'var(--mono)', color: '#fff', marginBottom: 7 }}>
        {fmtM(total)}
      </div>
      <div style={{ height: 3, borderRadius: 2, background: 'rgba(244,63,94,0.3)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: longPct + '%', background: '#00d992', borderRadius: 2, transition: 'width 0.5s' }} />
      </div>
    </div>
  )
}

// ─── Hot Coin Row ─────────────────────────────────────────────────────────────
function HotCoinRow({ rank, coin, long, short }) {
  const total = long + short
  const longPct = total > 0 ? (long / total) * 100 : 50
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)',
    }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: '#666', width: 18, textAlign: 'center', fontFamily: 'var(--mono)' }}>
        {rank}
      </div>
      <div style={{ fontSize: 13, fontWeight: 800, color: '#fff', width: 56, fontFamily: 'var(--mono)' }}>{coin}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          height: 4, borderRadius: 2, background: 'rgba(244,63,94,0.25)',
          overflow: 'hidden', marginBottom: 3,
        }}>
          <div style={{
            height: '100%', width: longPct + '%', background: '#00d992',
            borderRadius: 2, transition: 'width 0.5s',
          }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--mono)' }}>
          <span style={{ fontSize: 10, color: '#00d992', fontWeight: 700 }}>L {fmtM(long)}</span>
          <span style={{ fontSize: 10, color: '#f43f5e', fontWeight: 700 }}>S {fmtM(short)}</span>
        </div>
      </div>
      <div style={{ fontSize: 12, fontWeight: 800, fontFamily: 'var(--mono)', color: '#fff', textAlign: 'right' }}>
        {fmtM(total)}
      </div>
    </div>
  )
}

// ─── Live Feed Row ────────────────────────────────────────────────────────────
function LiveRow({ ev }) {
  const tone = ev.side === 'long' ? '#f43f5e' : '#00d992'  // long liquidated = red, short = green
  const badge = EX_BADGE[ev.exchange] || { label: ev.exchange.slice(0, 3).toUpperCase(), tone: '#888' }
  const label = ev.side === 'long' ? 'LONG LIQ' : 'SHORT LIQ'
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '9px 14px',
      borderBottom: '1px solid rgba(255,255,255,0.04)',
      borderLeft: `3px solid ${tone}`,
    }}>
      <div style={{
        width: 34, fontSize: 9, fontWeight: 900, letterSpacing: 0.5,
        color: badge.tone, textAlign: 'center',
        background: `${badge.tone}15`, borderRadius: 5, padding: '2px 0',
      }}>
        {badge.label}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', fontFamily: 'var(--mono)' }}>
          {ev.symbol}
        </div>
        <div style={{ fontSize: 10, fontWeight: 700, color: tone, letterSpacing: 0.5 }}>
          {label}
        </div>
      </div>
      <div style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: tone }}>{fmtM(ev.usd)}</div>
        <div style={{ fontSize: 9, color: '#888' }}>{ago(ev.ts)}</div>
      </div>
    </div>
  )
}

function CardSkeleton() {
  return (
    <div style={{ flex: 1, padding: '12px 10px' }}>
      <div style={{ height: 13, width: 24, borderRadius: 4, background: 'rgba(255,255,255,0.06)', marginBottom: 8 }} />
      <div style={{ height: 15, width: 56, borderRadius: 4, background: 'rgba(255,255,255,0.08)', marginBottom: 9 }} />
      <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.05)' }} />
    </div>
  )
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function LiquidationsStreamScreen() {
  const { token } = useAuth()
  const [stats,        setStats]        = useState(null)
  const [coinMap,      setCoinMap]      = useState({})  // coin → {long, short}
  const [activePeriod, setActivePeriod] = useState('h24')
  const [feed,         setFeed]         = useState([])  // live events, newest first
  const [live,         setLive]         = useState(false)
  const feedSeenRef = useRef(new Set())

  // Pull aggregates (CMC + WS) every 3 minutes
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

  // Live feed via backend WS — OKX + Bybit liquidations stream here.
  // The backend filters everything below $10K so the feed is signal, not noise.
  const onWsMessage = useCallback((msg) => {
    if (!msg) return
    if (msg.type === 'ws_connected') setLive(true)
    if (msg.type === 'ws_disconnected') setLive(false)
    if (msg.type !== 'liquidation') return
    const key = `${msg.exchange}:${msg.symbol}:${msg.ts}:${msg.usd}`
    if (feedSeenRef.current.has(key)) return
    feedSeenRef.current.add(key)
    setFeed(prev => {
      const next = [msg, ...prev].slice(0, 80)
      return next
    })
  }, [])
  useWebSocket(onWsMessage, [], { token })

  // Top hot coins by 24h liquidation
  const topCoins = Object.entries(coinMap)
    .map(([coin, v]) => ({ coin, long: v.long || 0, short: v.short || 0, total: (v.long || 0) + (v.short || 0) }))
    .filter(x => x.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 10)

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
    <div style={{ background: 'var(--bg)', minHeight: '100%', color: 'var(--text)', paddingBottom: 32 }}>

      {/* Header */}
      <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800 }}>Liquidation Stream</div>
            <div style={{ fontSize: 11, color: '#fff', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{
                display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
                background: live ? '#00d992' : '#555',
                boxShadow: live ? '0 0 6px #00d992' : 'none',
                animation: live ? 'pulse-dot 1.6s ease-in-out infinite' : 'none',
              }} />
              {live ? 'OKX + Bybit · Canlı' : 'Bağlanıyor…'}
            </div>
            <div style={{ fontSize: 9, color: '#666', marginTop: 4, fontFamily: 'var(--mono)', letterSpacing: 0.3 }}>
              KAYNAK · CMC public + OKX/Bybit WS · key yok
            </div>
          </div>
          {total24 > 0 && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 10, color: '#666', fontWeight: 700, letterSpacing: 0.5 }}>24H GLOBAL</div>
              <div style={{ fontSize: 18, fontWeight: 900, fontFamily: 'var(--mono)', color: '#fff' }}>{fmtM(total24)}</div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 3, fontFamily: 'var(--mono)' }}>
                <span style={{ fontSize: 10, color: '#00d992', fontWeight: 700 }}>Long {fmtM(long24)}</span>
                <span style={{ fontSize: 10, color: '#f43f5e', fontWeight: 700 }}>Short {fmtM(short24)}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Sentiment gauge — contrarian read on long vs short liquidations */}
      <LiqSentiment stats={stats} h1Pressure={(stats?.h1?.long || 0) + (stats?.h1?.short || 0)} />

      {/* Period cards */}
      <div style={{ padding: '14px 16px 0' }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: '#666', letterSpacing: 1, marginBottom: 6 }}>
          DÖNEM ÖZETİ · GLOBAL
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
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
                  onPress={() => { haptic('light'); setActivePeriod(c.key) }}
                />
              ))
          }
        </div>
      </div>

      {/* Hot coins */}
      <div style={{ padding: '20px 16px 0' }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
          marginBottom: 8,
        }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: '#666', letterSpacing: 1 }}>
            EN ÇOK LİKİDE OLAN · 24H
          </div>
          <div style={{ fontSize: 9, color: '#555', fontFamily: 'var(--mono)' }}>{topCoins.length} coin</div>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden' }}>
          {topCoins.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: '#555', fontSize: 12 }}>
              Veri yükleniyor…
            </div>
          ) : (
            topCoins.map((c, i) => (
              <HotCoinRow key={c.coin} rank={i + 1} coin={c.coin} long={c.long} short={c.short} />
            ))
          )}
        </div>
      </div>

      {/* Live feed */}
      <div style={{ padding: '20px 16px 0' }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
          marginBottom: 8,
        }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: '#666', letterSpacing: 1 }}>
            CANLI AKIŞ · OKX + BYBIT · $10K+
          </div>
          <div style={{ fontSize: 9, color: '#555', fontFamily: 'var(--mono)' }}>{feed.length} event</div>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden' }}>
          {feed.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: '#555', fontSize: 12, lineHeight: 1.5 }}>
              $10K+ likidasyon bekleniyor…
              <div style={{ fontSize: 10, color: '#444', marginTop: 4 }}>
                Sakin piyasada saatlerce olmayabilir.
              </div>
            </div>
          ) : (
            feed.map(ev => (
              <LiveRow key={`${ev.exchange}:${ev.symbol}:${ev.ts}:${ev.usd}`} ev={ev} />
            ))
          )}
        </div>
      </div>

    </div>
  )
}
