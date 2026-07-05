import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext'
import { haptic } from '../../capacitor'
import { API_BASE } from '../../config'
import { useWebSocket } from '../../hooks/useWebSocket'

// Real on-chain big transfers fed by backend trackers:
//   • BTC: mempool.space WebSocket (free, no key)
//   • ETH USDT/USDC: dRPC/PublicNode WSS RPC (free, no key)
// One row per (chain, tx_hash, asset). Backend persists; we poll + listen WS.

const THRESHOLDS    = [500_000, 1_000_000, 5_000_000, 10_000_000]
const CHAIN_FILTERS = ['ALL', 'BTC', 'ETH']
const ASSET_FILTERS = ['ALL', 'BTC', 'USDT', 'USDC']

// Flow filter — actionability ranked by signal quality
const FLOW_FILTERS = [
  { id: 'ALL',         label: 'Tümü',         desc: 'Tüm transferler' },
  { id: 'CEX_FLOW',    label: 'Exchange Flow', desc: 'Sadece exchange giriş/çıkışları' },
  { id: 'cex_inflow',  label: 'Inflow',        desc: 'Exchange\'e gelen (satış sinyali)' },
  { id: 'cex_outflow', label: 'Outflow',       desc: 'Exchange\'den çıkan (alım/HODL)' },
  { id: 'mint',        label: 'Mint',          desc: 'Yeni stablecoin basıldı' },
]

const FLOW_META = {
  cex_inflow:   { label: 'INFLOW',   tone: '#f43f5e', bg: 'rgba(244,63,94,0.12)',  arrow: '→' },
  cex_outflow:  { label: 'OUTFLOW',  tone: '#00d992', bg: 'rgba(0,217,146,0.12)',  arrow: '←' },
  cex_internal: { label: 'INTERNAL', tone: '#888',    bg: 'rgba(255,255,255,0.05)', arrow: '⇄' },
  mint:         { label: 'MINT',     tone: '#3b82f6', bg: 'rgba(59,130,246,0.12)', arrow: '✨' },
  burn:         { label: 'BURN',     tone: '#a855f7', bg: 'rgba(168,85,247,0.12)', arrow: '🔥' },
  unknown:      { label: '',         tone: '#666',    bg: 'transparent',           arrow: '→' },
}

const ASSET_COLOR = {
  BTC:  '#f7931a',
  ETH:  '#627eea',
  USDT: '#26a17b',
  USDC: '#2775ca',
}

function fmtUSD(n) {
  if (n == null || isNaN(n)) return '—'
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B'
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M'
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K'
  return '$' + n.toFixed(0)
}

function timeAgo(ts) {
  const s = Math.floor(Date.now() / 1000 - ts)
  if (s < 0)    return 'şimdi'
  if (s < 60)   return s + 's'
  if (s < 3600) return Math.floor(s / 60) + 'd'
  return Math.floor(s / 3600) + 'sa'
}

function shortAddr(a) {
  if (!a) return '—'
  return a.slice(0, 6) + '…' + a.slice(-4)
}

function chainBadge(chain) {
  if (chain === 'btc') return { label: 'BTC', color: '#f7931a' }
  if (chain === 'eth') return { label: 'ETH', color: '#627eea' }
  return { label: chain.toUpperCase(), color: '#888' }
}

// ─── Transfer Row ────────────────────────────────────────────────────────────
function TransferRow({ t }) {
  const cb         = chainBadge(t.chain)
  const assetColor = ASSET_COLOR[t.asset] || '#fff'
  const flow       = FLOW_META[t.flow_category] || FLOW_META.unknown
  const fromText   = t.from_label || shortAddr(t.from)
  const toText     = t.to_label   || shortAddr(t.to)
  const fromBold   = !!t.from_label
  const toBold     = !!t.to_label

  return (
    <div
      onClick={() => { if (t.link) window.open(t.link, '_blank') }}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '11px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        borderLeft: `3px solid ${flow.tone}55`,
        cursor: t.link ? 'pointer' : 'default',
      }}
    >
      {/* Chain badge */}
      <div style={{
        width: 36, flexShrink: 0, textAlign: 'center',
        padding: '3px 0', borderRadius: 6,
        background: `${cb.color}22`,
        fontSize: 10, fontWeight: 900, letterSpacing: 0.5,
        color: cb.color,
      }}>
        {cb.label}
      </div>

      {/* Asset */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: 52, flexShrink: 0 }}>
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: assetColor, flexShrink: 0 }} />
        <div style={{ fontSize: 13, fontWeight: 800, color: '#fff', lineHeight: 1 }}>{t.asset}</div>
      </div>

      {/* Amount + (label-aware from→to) + flow badge */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, lineHeight: 1.1 }}>
          <div style={{ fontSize: 14, fontWeight: 800, fontFamily: 'var(--mono)', color: '#fff' }}>
            {fmtUSD(t.amount_usd)}
          </div>
          {flow.label && (
            <div style={{
              fontSize: 9, fontWeight: 900, letterSpacing: 0.5,
              padding: '2px 6px', borderRadius: 4,
              background: flow.bg, color: flow.tone,
            }}>
              {flow.label}
            </div>
          )}
        </div>
        <div style={{
          fontSize: 10, fontFamily: 'var(--mono)', marginTop: 2,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          <span style={{ color: fromBold ? flow.tone : '#fff', fontWeight: fromBold ? 700 : 400 }}>
            {fromText}
          </span>
          <span style={{ color: '#666' }}> {flow.arrow} </span>
          <span style={{ color: toBold ? flow.tone : '#fff', fontWeight: toBold ? 700 : 400 }}>
            {toText}
          </span>
        </div>
      </div>

      {/* Time */}
      <div style={{ fontSize: 11, color: '#fff', fontFamily: 'var(--mono)', flexShrink: 0 }}>
        {timeAgo(t.ts)}
      </div>
    </div>
  )
}

// ─── 24h Sentiment Gauge ─────────────────────────────────────────────────────
// Derives a single directional score from inflow/outflow/mint/burn totals.
// Standard trader interpretation (CryptoQuant/Glassnode style):
//   exchange_net = (outflow - inflow) / (outflow + inflow)   -1..+1
//   liquidity_net = (mint - burn) / (mint + burn)            -1..+1
//   sentiment = 0.6*exchange + 0.4*liquidity                 -1..+1
// > +0.3 BULLISH, < -0.3 BEARISH, else NEUTRAL.
function computeSentiment(aggregates) {
  if (!aggregates) return null
  const inflow  = aggregates.cex_inflow?.sum_usd  || 0
  const outflow = aggregates.cex_outflow?.sum_usd || 0
  const mint    = aggregates.mint?.sum_usd        || 0
  const burn    = aggregates.burn?.sum_usd        || 0
  const exch    = (outflow + inflow)  > 0 ? (outflow - inflow) / (outflow + inflow) : 0
  const liq     = (mint + burn)       > 0 ? (mint - burn)      / (mint + burn)       : 0
  // If no liquidity activity at all, fall back to pure exchange flow signal
  const hasLiq  = (mint + burn) > 0
  const score   = hasLiq ? (0.6 * exch + 0.4 * liq) : exch
  const verdict = score >  0.3 ? 'BULLISH'
                : score < -0.3 ? 'BEARISH'
                :                'NEUTRAL'
  return { score, verdict, exch, liq, inflow, outflow, mint, burn }
}

function SentimentGauge({ aggregates }) {
  const s = computeSentiment(aggregates)
  if (!s) {
    return (
      <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <div style={{ fontSize: 10, color: '#555', fontWeight: 700, letterSpacing: 0.5 }}>
          SENTIMENT (24S) · veri yükleniyor…
        </div>
      </div>
    )
  }
  const tone = s.verdict === 'BULLISH' ? '#00d992'
             : s.verdict === 'BEARISH' ? '#f43f5e'
             :                            '#aaa'
  // Map [-1, +1] → [0%, 100%] for marker position
  const pct = Math.max(0, Math.min(100, (s.score + 1) * 50))
  const net = s.outflow - s.inflow
  const netStr = (net >= 0 ? '+' : '') + fmtUSD(Math.abs(net))
  const mintNet = s.mint - s.burn
  return (
    <div style={{
      padding: '12px 16px 14px',
      borderBottom: '1px solid rgba(255,255,255,0.04)',
    }}>
      {/* Header — label + score + verdict */}
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        marginBottom: 10,
      }}>
        <div style={{ fontSize: 10, color: '#888', fontWeight: 700, letterSpacing: 0.8 }}>
          SENTIMENT · 24S
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{
            fontSize: 12, fontWeight: 800, fontFamily: 'var(--mono)',
            color: tone,
          }}>
            {s.score >= 0 ? '+' : ''}{s.score.toFixed(2)}
          </span>
          <span style={{
            fontSize: 12, fontWeight: 900, letterSpacing: 0.6,
            color: tone,
          }}>
            {s.verdict}
          </span>
        </div>
      </div>

      {/* Gauge bar — red→neutral→green gradient with marker */}
      <div style={{ position: 'relative', height: 8, marginBottom: 8 }}>
        {/* Track */}
        <div style={{
          position: 'absolute', inset: 0, borderRadius: 4,
          background: 'linear-gradient(to right, rgba(244,63,94,0.5) 0%, rgba(244,63,94,0.15) 35%, rgba(255,255,255,0.06) 50%, rgba(0,217,146,0.15) 65%, rgba(0,217,146,0.5) 100%)',
        }} />
        {/* Center tick */}
        <div style={{
          position: 'absolute', top: -2, bottom: -2, left: '50%',
          width: 1, background: 'rgba(255,255,255,0.18)',
          transform: 'translateX(-50%)',
        }} />
        {/* Marker */}
        <div style={{
          position: 'absolute', top: '50%', left: `${pct}%`,
          width: 12, height: 12, borderRadius: '50%',
          background: tone,
          boxShadow: `0 0 10px ${tone}99`,
          border: '2px solid #000',
          transform: 'translate(-50%, -50%)',
          transition: 'left 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        }} />
      </div>

      {/* Axis labels */}
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        fontSize: 8, color: '#555', fontWeight: 700, letterSpacing: 0.5,
        marginBottom: 8,
      }}>
        <span>BEARISH</span>
        <span>NÖTR</span>
        <span>BULLISH</span>
      </div>

      {/* One-line summary */}
      <div style={{
        fontSize: 11, color: '#fff', fontFamily: 'var(--mono)',
        opacity: 0.85, lineHeight: 1.4,
      }}>
        <span style={{ color: net >= 0 ? '#00d992' : '#f43f5e' }}>{netStr}</span>
        <span style={{ color: '#888' }}> net {net >= 0 ? 'outflow' : 'inflow'} · </span>
        {mintNet > 0 && (
          <>
            <span style={{ color: '#3b82f6' }}>+{fmtUSD(mintNet)}</span>
            <span style={{ color: '#888' }}> mint</span>
          </>
        )}
        {mintNet < 0 && (
          <>
            <span style={{ color: '#a855f7' }}>{fmtUSD(Math.abs(mintNet))}</span>
            <span style={{ color: '#888' }}> burn</span>
          </>
        )}
        {mintNet === 0 && <span style={{ color: '#666' }}>no mint/burn</span>}
      </div>
    </div>
  )
}

// ─── 24h Flow Summary (4-card dashboard) ─────────────────────────────────────
function FlowSummary({ aggregates, activeFilter, onSelect }) {
  const cells = [
    { id: 'cex_inflow',  label: 'INFLOW',  ...FLOW_META.cex_inflow  },
    { id: 'cex_outflow', label: 'OUTFLOW', ...FLOW_META.cex_outflow },
    { id: 'mint',        label: 'MINT',    ...FLOW_META.mint        },
    { id: 'burn',        label: 'BURN',    ...FLOW_META.burn        },
  ]
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
      gap: 6, padding: '10px 16px 12px',
      borderBottom: '1px solid rgba(255,255,255,0.04)',
    }}>
      {cells.map(c => {
        const v = aggregates?.[c.id] || { count: 0, sum_usd: 0 }
        const active = activeFilter === c.id
        return (
          <button key={c.id}
            onClick={() => { haptic('light'); onSelect(active ? 'ALL' : c.id) }}
            style={{
              background: active ? c.bg : 'rgba(255,255,255,0.03)',
              border: `1px solid ${active ? c.tone + '60' : 'rgba(255,255,255,0.06)'}`,
              borderRadius: 10, padding: '8px 6px', cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2,
              transition: 'background 0.15s, border 0.15s',
            }}>
            <div style={{
              fontSize: 9, fontWeight: 800, letterSpacing: 0.5,
              color: c.tone, lineHeight: 1,
            }}>
              {c.label}
            </div>
            <div style={{
              fontSize: 12, fontWeight: 800, fontFamily: 'var(--mono)',
              color: '#fff', lineHeight: 1.1, marginTop: 4,
            }}>
              {fmtUSD(v.sum_usd)}
            </div>
            <div style={{
              fontSize: 9, color: '#888', fontFamily: 'var(--mono)', lineHeight: 1,
            }}>
              {v.count} tx
            </div>
          </button>
        )
      })}
    </div>
  )
}

function Skeleton() {
  return (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <div style={{ width: 36, height: 20, borderRadius: 6, background: 'rgba(255,255,255,0.06)', flexShrink: 0 }} />
          <div style={{ width: 56, flexShrink: 0 }}>
            <div style={{ height: 13, width: 38, borderRadius: 4, background: 'rgba(255,255,255,0.07)' }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ height: 14, width: 80, borderRadius: 4, background: 'rgba(255,255,255,0.08)', marginBottom: 4 }} />
            <div style={{ height: 10, width: 140, borderRadius: 4, background: 'rgba(255,255,255,0.05)' }} />
          </div>
          <div style={{ height: 11, width: 24, borderRadius: 4, background: 'rgba(255,255,255,0.04)', flexShrink: 0 }} />
        </div>
      ))}
    </>
  )
}

export default function BigTransfersScreen() {
  const { token } = useAuth()
  const [transfers,   setTransfers]   = useState([])
  const [aggregates,  setAggregates]  = useState(null)  // {cex_inflow: {count,sum_usd}, ...}
  const [loading,     setLoading]     = useState(true)
  const [connected,   setConnected]   = useState(false)
  const [chainFilter, setChainFilter] = useState('ALL')
  const [assetFilter, setAssetFilter] = useState('ALL')
  const [flowFilter,  setFlowFilter]  = useState('CEX_FLOW')  // default: hide unknown→unknown noise
  const [threshold,   setThreshold]   = useState(500_000)
  const seenRef = useRef(new Set())

  const ingest = useCallback((rows) => {
    if (!Array.isArray(rows) || !rows.length) return
    setTransfers(prev => {
      const seen = seenRef.current
      const fresh = rows.filter(r => {
        if (!r || !r.tx_hash) return false
        const key = `${r.chain}:${r.asset}:${r.tx_hash}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      if (!fresh.length) return prev
      const merged = [...fresh, ...prev]
      merged.sort((a, b) => (b.ts || 0) - (a.ts || 0))
      // Keep enough for filtered views — at $500K threshold we see ~700/24h
      return merged.slice(0, 1000)
    })
  }, [])

  // Initial + periodic poll. Backend keeps 24h history; we fetch since-last-ts
  // after the first load so we don't re-pull thousands of rows.
  const lastTsRef = useRef(0)
  useEffect(() => {
    if (!token) return
    let alive = true
    async function pull() {
      try {
        const params = new URLSearchParams({
          min_usd: '0', // we filter client-side so users can scrub threshold instantly
          limit:   '1000',  // ~700 rows expected in 24h at $500K threshold
        })
        if (lastTsRef.current) params.set('since', String(lastTsRef.current))
        const r = await fetch(`${API_BASE}/api/big-transfers/feed?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!alive) return
        if (!r.ok) { setLoading(false); return }
        const data = await r.json()
        const rows = data?.transfers || []
        if (rows.length) {
          ingest(rows)
          const maxTs = rows.reduce((m, x) => Math.max(m, x.ts || 0), lastTsRef.current)
          if (maxTs > lastTsRef.current) lastTsRef.current = maxTs
        }
        setLoading(false)
        setConnected(true)
      } catch {
        setConnected(false)
      }
    }
    pull()
    const id = setInterval(pull, 10000)
    return () => { alive = false; clearInterval(id) }
  }, [token, ingest])

  // 24h aggregates — drives the 4-card dashboard. Refreshes on a slower
  // cadence than the feed since totals barely shift second-to-second.
  useEffect(() => {
    if (!token) return
    let alive = true
    async function pullAgg() {
      try {
        const r = await fetch(`${API_BASE}/api/big-transfers/aggregates?window_sec=86400`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!alive || !r.ok) return
        const data = await r.json()
        if (data?.flows) setAggregates(data.flows)
      } catch {}
    }
    pullAgg()
    const id = setInterval(pullAgg, 30000)
    return () => { alive = false; clearInterval(id) }
  }, [token])

  // Live WS push — each new on-chain transfer arrives within milliseconds
  // of the EVM/BTC tracker emitting it.
  const onWsMessage = useCallback((msg) => {
    if (!msg) return
    if (msg.type === 'ws_connected') setConnected(true)
    if (msg.type === 'ws_disconnected') setConnected(false)
    if (msg.type !== 'big_transfer') return
    ingest([{
      chain: msg.chain, asset: msg.asset, tx_hash: msg.tx_hash,
      amount: msg.amount, amount_usd: msg.amount_usd,
      from: msg.from, to: msg.to,
      from_label: msg.from_label, to_label: msg.to_label,
      flow_category: msg.flow_category,
      ts: msg.ts, link: msg.link,
    }])
    haptic('light')
  }, [ingest])
  useWebSocket(onWsMessage, [], { token })

  const filtered = transfers
    .filter(t => chainFilter === 'ALL' || t.chain === chainFilter.toLowerCase())
    .filter(t => assetFilter === 'ALL' || t.asset === assetFilter)
    .filter(t => {
      if (flowFilter === 'ALL') return true
      if (flowFilter === 'CEX_FLOW') {
        return t.flow_category === 'cex_inflow' || t.flow_category === 'cex_outflow' || t.flow_category === 'mint' || t.flow_category === 'burn'
      }
      return t.flow_category === flowFilter
    })
    .filter(t => t.amount_usd >= threshold)
    .slice(0, 200)

  return (
    <div style={{ background: '#000', minHeight: '100%', color: '#fff', paddingBottom: 24 }}>
      {/* Header */}
      <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800 }}>Big Transfers</div>
            <div style={{ fontSize: 11, color: '#fff', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{
                display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
                background: connected ? '#00d992' : '#555',
                boxShadow: connected ? '0 0 6px #00d992' : 'none',
              }} />
              {connected ? 'On-chain · BTC · ETH · Canlı' : 'Bağlanıyor…'}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 9, color: '#666', fontWeight: 700, letterSpacing: 0.5 }}>SON 24S</div>
            <div style={{ fontSize: 14, fontWeight: 800, fontFamily: 'var(--mono)', color: '#fff' }}>
              {aggregates
                ? Object.values(aggregates).reduce((s, v) => s + (v.count || 0), 0)
                : transfers.length}
            </div>
          </div>
        </div>

        {/* Threshold pills */}
        <div style={{ display: 'flex', gap: 14, marginBottom: 8, flexWrap: 'wrap' }}>
          {THRESHOLDS.map(v => (
            <button key={v}
              onClick={() => { haptic('light'); setThreshold(v) }}
              style={{
                padding: 0, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700,
                background: 'transparent',
                color: threshold === v ? '#fff' : '#666',
              }}>
              {v >= 1_000_000 ? `${v / 1_000_000}M+` : `${v / 1000}K+`}
            </button>
          ))}
        </div>

        {/* Flow filter — most actionable knob */}
        <div style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 4, marginBottom: 4 }}>
          {FLOW_FILTERS.map(f => (
            <button key={f.id}
              onClick={() => { haptic('light'); setFlowFilter(f.id) }}
              style={{
                padding: 0, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, flexShrink: 0,
                background: 'transparent',
                color: flowFilter === f.id ? '#fff' : '#666',
              }}>
              {f.label}
            </button>
          ))}
        </div>

        {/* Chain + asset filters */}
        <div style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 2 }}>
          {CHAIN_FILTERS.map(c => (
            <button key={c}
              onClick={() => { haptic('light'); setChainFilter(c) }}
              style={{
                padding: 0, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, flexShrink: 0,
                background: 'transparent',
                color: chainFilter === c ? '#fff' : '#666',
              }}>
              {c === 'ALL' ? 'Tüm Zincir' : c}
            </button>
          ))}
          <div style={{ width: 1, background: 'rgba(255,255,255,0.1)', flexShrink: 0 }} />
          {ASSET_FILTERS.map(a => (
            <button key={a}
              onClick={() => { haptic('light'); setAssetFilter(a) }}
              style={{
                padding: 0, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, flexShrink: 0,
                background: 'transparent',
                color: assetFilter === a ? '#fff' : '#666',
              }}>
              {a === 'ALL' ? 'Tüm Coin' : a}
            </button>
          ))}
        </div>
      </div>

      {/* Sentiment gauge — derived from the same 4 numbers shown below */}
      <SentimentGauge aggregates={aggregates} />

      {/* 24h flow summary — tap a card to filter feed by that flow */}
      <FlowSummary aggregates={aggregates} activeFilter={flowFilter} onSelect={setFlowFilter} />

      {/* Column labels */}
      <div style={{ display: 'flex', padding: '7px 16px', fontSize: 10, fontWeight: 700, color: '#666', letterSpacing: 0.5 }}>
        <div style={{ width: 36, marginRight: 10 }}>ZİNCİR</div>
        <div style={{ width: 56, marginRight: 0 }}>COIN</div>
        <div style={{ flex: 1 }}>TUTAR · ADRES</div>
        <div>ZAMAN</div>
      </div>

      {/* Feed */}
      {loading
        ? <Skeleton />
        : filtered.length === 0
          ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 20px', gap: 12 }}>
              <div style={{ fontSize: 32 }}>🐋</div>
              <div style={{ fontSize: 14, color: '#888', textAlign: 'center' }}>
                {fmtUSD(threshold)}+ on-chain transfer bekleniyor…
              </div>
              <div style={{ fontSize: 11, color: '#555', textAlign: 'center', maxWidth: 280, lineHeight: 1.5 }}>
                Mempool.space (BTC) ve dRPC (ETH USDT/USDC) gerçek zamanlı dinleniyor.
                Threshold'u düşürerek daha fazla görebilirsiniz.
              </div>
            </div>
          )
          : filtered.map(t => <TransferRow key={`${t.chain}:${t.asset}:${t.tx_hash}`} t={t} />)
      }
    </div>
  )
}
