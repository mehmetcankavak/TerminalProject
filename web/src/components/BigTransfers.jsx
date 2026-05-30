import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { API_BASE } from '../config'
import { useWebSocket } from '../hooks/useWebSocket'

// Real on-chain big transfers fed by backend trackers:
//   • BTC: mempool.space WebSocket (free, no key)
//   • ETH USDT/USDC: dRPC/PublicNode WSS RPC (free, no key)
// One row per (chain, tx_hash, asset). Backend persists; we poll + listen WS.

const THRESHOLDS    = [500_000, 1_000_000, 5_000_000, 10_000_000]
const CHAIN_FILTERS = ['ALL', 'BTC', 'ETH', 'TRON']
const ASSET_FILTERS = ['ALL', 'BTC', 'ETH', 'USDT', 'USDC']

const FLOW_FILTERS = [
  { id: 'ALL',         label: 'All'           },
  { id: 'CEX_FLOW',    label: 'Exchange Flow' },
  { id: 'cex_inflow',  label: 'Inflow'        },
  { id: 'cex_outflow', label: 'Outflow'       },
  { id: 'mint',        label: 'Mint'          },
]

const FLOW_META = {
  cex_inflow:   { label: 'INFLOW',   tone: '#f43f5e', bg: 'rgba(244,63,94,0.12)',   arrow: '→' },
  cex_outflow:  { label: 'OUTFLOW',  tone: '#00e87a', bg: 'rgba(0,232,122,0.12)',   arrow: '←' },
  cex_internal: { label: 'INTERNAL', tone: '#888',    bg: 'rgba(255,255,255,0.05)', arrow: '⇄' },
  mint:         { label: 'MINT',     tone: '#3b82f6', bg: 'rgba(59,130,246,0.12)',  arrow: '✦' },
  burn:         { label: 'BURN',     tone: '#a855f7', bg: 'rgba(168,85,247,0.12)',  arrow: '✦' },
  unknown:      { label: '',         tone: '#666',    bg: 'transparent',            arrow: '→' },
}

const STABLE_SYMS = new Set(['USDT', 'USDC', 'DAI', 'FDUSD', 'PYUSD', 'USDP', 'TUSD', 'BUSD'])
const BULL = { tone: '#00e87a', bg: 'rgba(0,232,122,0.12)' }
const BEAR = { tone: '#f43f5e', bg: 'rgba(244,63,94,0.12)' }

function flowMeta(flowCat, asset) {
  const base = FLOW_META[flowCat] || FLOW_META.unknown
  if (flowCat === 'cex_inflow' || flowCat === 'cex_outflow') {
    const stable   = STABLE_SYMS.has((asset || '').toUpperCase())
    const bullish  = flowCat === 'cex_inflow' ? stable : !stable
    return { ...base, ...(bullish ? BULL : BEAR) }
  }
  return base
}

const ASSET_COLOR = {
  BTC:  '#f7931a', WBTC: '#f7931a',
  ETH:  '#627eea', WETH: '#627eea',
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
  if (s < 0)    return 'just now'
  if (s < 60)   return s + 's'
  if (s < 3600) return Math.floor(s / 60) + 'm'
  return Math.floor(s / 3600) + 'h'
}

function shortAddr(a) {
  if (!a) return '—'
  return a.slice(0, 6) + '…' + a.slice(-4)
}

function chainBadge(chain) {
  if (chain === 'btc')  return { label: 'BTC',  color: '#f7931a' }
  if (chain === 'eth')  return { label: 'ETH',  color: '#627eea' }
  if (chain === 'tron') return { label: 'TRON', color: '#eb0029' }
  return { label: (chain || '').toUpperCase().slice(0, 4), color: '#888' }
}

// ─── Transfer Row ─────────────────────────────────────────────────────────────
function TransferRow({ t }) {
  const cb         = chainBadge(t.chain)
  const assetColor = ASSET_COLOR[t.asset] || '#fff'
  const flow       = flowMeta(t.flow_category, t.asset)
  const fromText   = t.from_label || shortAddr(t.from)
  const toText     = t.to_label   || shortAddr(t.to)
  const fromBold   = !!t.from_label
  const toBold     = !!t.to_label

  return (
    <div
      onClick={() => { if (t.link) window.open(t.link, '_blank') }}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 20px',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        borderLeft: `3px solid ${flow.tone}55`,
        cursor: t.link ? 'pointer' : 'default',
        transition: 'background 0.15s',
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      {/* Chain badge */}
      <div style={{
        width: 40, flexShrink: 0, textAlign: 'center',
        padding: '3px 0', borderRadius: 6,
        background: `${cb.color}22`,
        fontSize: 10, fontWeight: 900, letterSpacing: 0.5,
        color: cb.color,
      }}>
        {cb.label}
      </div>

      {/* Asset */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: 60, flexShrink: 0 }}>
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: assetColor, flexShrink: 0 }} />
        <div style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>{t.asset}</div>
      </div>

      {/* Amount + flow + address */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ fontSize: 14, fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#fff' }}>
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
          fontSize: 10, fontFamily: 'var(--font-mono)', marginTop: 2, color: 'rgba(255,255,255,0.4)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          <span style={{ color: fromBold ? flow.tone : 'rgba(255,255,255,0.5)', fontWeight: fromBold ? 700 : 400 }}>
            {fromText}
          </span>
          <span style={{ color: '#555' }}> {flow.arrow} </span>
          <span style={{ color: toBold ? flow.tone : 'rgba(255,255,255,0.5)', fontWeight: toBold ? 700 : 400 }}>
            {toText}
          </span>
        </div>
      </div>

      {/* Time */}
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
        {timeAgo(t.ts)}
      </div>
    </div>
  )
}

// ─── Sentiment Gauge ──────────────────────────────────────────────────────────
function SentimentGauge({ aggregates, onOpen }) {
  if (!aggregates?.sentiment) {
    return (
      <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.22)', fontWeight: 700, letterSpacing: 0.5 }}>
          SENTIMENT (24H) · loading…
        </div>
      </div>
    )
  }
  const bk      = aggregates.sentiment
  const score   = bk.score
  const verdict = bk.verdict
  const tone    = verdict === 'BULLISH' ? '#00e87a' : verdict === 'BEARISH' ? '#f43f5e' : '#aaa'
  const pct     = Math.max(0, Math.min(100, (score + 1) * 50))

  const coinNet   = aggregates?.coin   ? (aggregates.coin.outflow  - aggregates.coin.inflow)   : 0
  const stableNet = aggregates?.stable ? (aggregates.stable.inflow - aggregates.stable.outflow) : 0
  const hasCoin   = aggregates?.coin   && (aggregates.coin.inflow   + aggregates.coin.outflow)   > 0
  const hasStable = aggregates?.stable && (aggregates.stable.inflow + aggregates.stable.outflow) > 0
  const mint      = aggregates?.mint?.sum_usd || 0
  const burn      = aggregates?.burn?.sum_usd || 0

  return (
    <div
      onClick={onOpen}
      style={{
        padding: '14px 20px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)', fontWeight: 700, letterSpacing: 0.8 }}>
          SENTIMENT · 24H
          <span style={{ color: '#00e87a', marginLeft: 8, fontWeight: 800 }}>· ANALYSIS ›</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 800, fontFamily: 'var(--font-mono)', color: tone }}>
            {score >= 0 ? '+' : ''}{score.toFixed(2)}
          </span>
          <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: 0.6, color: tone }}>{verdict}</span>
        </div>
      </div>

      <div style={{ position: 'relative', height: 8, marginBottom: 8 }}>
        <div style={{
          position: 'absolute', inset: 0, borderRadius: 4,
          background: 'linear-gradient(to right, rgba(244,63,94,0.5) 0%, rgba(244,63,94,0.15) 35%, rgba(255,255,255,0.06) 50%, rgba(0,232,122,0.15) 65%, rgba(0,232,122,0.5) 100%)',
        }} />
        <div style={{
          position: 'absolute', top: -2, bottom: -2, left: '50%',
          width: 1, background: 'rgba(255,255,255,0.18)', transform: 'translateX(-50%)',
        }} />
        <div style={{
          position: 'absolute', top: '50%', left: `${pct}%`,
          width: 12, height: 12, borderRadius: '50%', background: tone,
          boxShadow: `0 0 10px ${tone}99`, border: '2px solid #000',
          transform: 'translate(-50%, -50%)',
          transition: 'left 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        }} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, color: 'rgba(255,255,255,0.2)', fontWeight: 700, letterSpacing: 0.5, marginBottom: 8 }}>
        <span>BEARISH</span><span>NEUTRAL</span><span>BULLISH</span>
      </div>

      <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', lineHeight: 1.7, color: 'rgba(255,255,255,0.55)' }}>
        <span style={{ color: 'rgba(255,255,255,0.3)' }}>Coin </span>
        {hasCoin
          ? <span style={{ color: coinNet >= 0 ? '#00e87a' : '#f43f5e' }}>
              {coinNet >= 0 ? '+' : '−'}{fmtUSD(Math.abs(coinNet))} {coinNet >= 0 ? 'outflow' : 'inflow'}
            </span>
          : <span style={{ color: '#555' }}>—</span>}
        <span style={{ color: 'rgba(255,255,255,0.3)' }}>{'  ·  '}Stable </span>
        {hasStable
          ? <span style={{ color: stableNet >= 0 ? '#00e87a' : '#f43f5e' }}>
              {stableNet >= 0 ? '+' : '−'}{fmtUSD(Math.abs(stableNet))} {stableNet >= 0 ? 'inflow' : 'outflow'}
            </span>
          : <span style={{ color: '#555' }}>—</span>}
        <br />
        <span style={{ color: 'rgba(255,255,255,0.3)' }}>Mint </span>
        <span style={{ color: mint > 0 ? '#3b82f6' : '#555' }}>{mint > 0 ? '+' + fmtUSD(mint) : '—'}</span>
        <span style={{ color: 'rgba(255,255,255,0.3)' }}>{'  ·  '}Burn </span>
        <span style={{ color: burn > 0 ? '#a855f7' : '#555' }}>{burn > 0 ? '−' + fmtUSD(burn) : '—'}</span>
      </div>
    </div>
  )
}

// ─── Flow Summary Cards ───────────────────────────────────────────────────────
function FlowSummary({ aggregates, flowFilter, assetClass, setFlowFilter, setAssetClass }) {
  const coin   = aggregates?.coin   || { inflow: 0, outflow: 0 }
  const stable = aggregates?.stable || { inflow: 0, outflow: 0 }
  const mint   = aggregates?.mint   || { count: 0, sum_usd: 0 }
  const burn   = aggregates?.burn   || { count: 0, sum_usd: 0 }
  const GREEN = '#00e87a', RED = '#f43f5e'
  const gBg = 'rgba(0,232,122,0.1)', rBg = 'rgba(244,63,94,0.1)'

  const cards = [
    { label: 'COIN IN',    val: coin.inflow,    color: RED,                      bg: rBg,                       sub: 'sell pressure',  ac: 'coin',   ff: 'cex_inflow'  },
    { label: 'COIN OUT',   val: coin.outflow,   color: GREEN,                    bg: gBg,                       sub: 'accumulation',   ac: 'coin',   ff: 'cex_outflow' },
    { label: 'STABLE IN',  val: stable.inflow,  color: GREEN,                    bg: gBg,                       sub: 'buying power',   ac: 'stable', ff: 'cex_inflow'  },
    { label: 'STABLE OUT', val: stable.outflow, color: RED,                      bg: rBg,                       sub: 'power exit',     ac: 'stable', ff: 'cex_outflow' },
    { label: 'MINT',       val: mint.sum_usd,   color: FLOW_META.mint.tone,      bg: FLOW_META.mint.bg,         sub: `${mint.count} tx`, ac: null, ff: 'mint'       },
    { label: 'BURN',       val: burn.sum_usd,   color: FLOW_META.burn.tone,      bg: FLOW_META.burn.bg,         sub: `${burn.count} tx`, ac: null, ff: 'burn'       },
  ]

  const isActive = (c) => c.ac != null
    ? (assetClass === c.ac && flowFilter === c.ff)
    : (flowFilter === c.ff)

  const apply = (c) => {
    if (isActive(c)) { setAssetClass('ALL'); setFlowFilter('CEX_FLOW') }
    else { setAssetClass(c.ac || 'ALL'); setFlowFilter(c.ff) }
  }

  return (
    <div style={{
      display: 'flex', gap: 8, flexWrap: 'wrap',
      padding: '12px 20px 14px',
      borderBottom: '1px solid rgba(255,255,255,0.04)',
    }}>
      {cards.map(c => {
        const active = isActive(c)
        return (
          <button key={c.label}
            onClick={() => apply(c)}
            style={{
              flex: '1 1 calc(33% - 8px)', minWidth: 90, maxWidth: 160,
              background: active ? c.bg : 'rgba(255,255,255,0.025)',
              border: `1px solid ${active ? c.color + '55' : 'rgba(255,255,255,0.07)'}`,
              borderRadius: 10, padding: '10px 12px', cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2,
              transition: 'background 0.15s, border-color 0.15s',
            }}>
            <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.5, color: c.color, whiteSpace: 'nowrap' }}>{c.label}</div>
            <div style={{ fontSize: 13, fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#fff', marginTop: 4, whiteSpace: 'nowrap' }}>{fmtUSD(c.val)}</div>
            <div style={{ fontSize: 9, color: c.color, fontFamily: 'var(--font-mono)', opacity: 0.8, whiteSpace: 'nowrap' }}>{c.sub}</div>
          </button>
        )
      })}
    </div>
  )
}

// ─── Flow Insights Sheet (desktop modal) ─────────────────────────────────────
function FlowInsightsSheet({ open, onClose, token }) {
  const [data,        setData]        = useState(null)
  const [loading,     setLoading]     = useState(false)
  const [tab,         setTab]         = useState('flow')
  const [corridors,   setCorridors]   = useState(null)
  const [corrLoading, setCorrLoading] = useState(false)

  useEffect(() => {
    if (!open || !token) return
    let alive = true
    setLoading(true)
    fetch(`${API_BASE}/api/big-transfers/insights?window_sec=86400`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null).catch(() => null)
      .then(d => { if (alive) { setData(d); setLoading(false) } })
    return () => { alive = false }
  }, [open, token])

  useEffect(() => {
    if (!open || !token || tab !== 'corridors' || corridors !== null) return
    let alive = true
    setCorrLoading(true)
    fetch(`${API_BASE}/api/big-transfers/corridors?window_sec=86400&min_count=3`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null).catch(() => null)
      .then(d => { if (alive) { setCorridors(d?.corridors || []); setCorrLoading(false) } })
    return () => { alive = false }
  }, [open, token, tab, corridors])

  if (!open) return null

  const toneColor = t => t === 'bull' ? '#00e87a' : t === 'bear' ? '#f43f5e' : t === 'warn' ? '#f59e0b' : '#888'
  const s = data?.sentiment
  const verdictColor = s?.verdict === 'BULLISH' ? '#00e87a' : s?.verdict === 'BEARISH' ? '#f43f5e' : '#aaa'

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div style={{ width: '90%', maxWidth: 640, maxHeight: '85vh', background: '#0a0a0a', borderRadius: 16, border: '1px solid rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '16px 20px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#aaa', fontSize: 20, padding: 0, cursor: 'pointer', lineHeight: 1 }}>✕</button>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>Flow Analysis</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>
              {tab === 'flow' ? 'Last 24h · where money moved'
                : tab === 'corridors' ? 'Recurring routes · who feeds who'
                : 'Why the sentiment score is here'}
            </div>
          </div>
          {s && <span style={{ fontSize: 13, fontWeight: 900, letterSpacing: 0.6, color: verdictColor }}>{s.verdict}</span>}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', padding: '8px 20px 0', gap: 6, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          {[{ id: 'flow', label: 'FLOW' }, { id: 'corridors', label: 'CORRIDORS' }, { id: 'breakdown', label: 'BREAKDOWN' }].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{
                flex: 1, background: 'transparent', border: 'none', cursor: 'pointer',
                padding: '8px 4px 10px', fontSize: 10, fontWeight: 800, letterSpacing: 0.5,
                color: tab === t.id ? '#00e87a' : 'rgba(255,255,255,0.28)',
                borderBottom: `2px solid ${tab === t.id ? '#00e87a' : 'transparent'}`,
              }}>{t.label}</button>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 24px' }}>
          {loading && <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, textAlign: 'center', padding: 30 }}>Loading…</div>}
          {!loading && !data && <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, textAlign: 'center', padding: 30 }}>No data available.</div>}

          {!loading && data && tab === 'flow' && (
            <>
              {data.coin_flow && (data.coin_flow.inflow + data.coin_flow.outflow) > 0 && (() => {
                const net = data.coin_flow.net
                const pos = net >= 0
                return (
                  <div style={{ marginBottom: 16, padding: '12px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: 10, border: `1px solid ${pos ? 'rgba(0,232,122,0.25)' : 'rgba(244,63,94,0.25)'}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontWeight: 700, letterSpacing: 0.6 }}>COIN NETFLOW · BTC/ETH</span>
                      <span style={{ fontSize: 13, fontWeight: 900, fontFamily: 'var(--font-mono)', color: pos ? '#00e87a' : '#f43f5e' }}>
                        {pos ? '+' : '−'}{fmtUSD(Math.abs(net))}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', lineHeight: 1.4 }}>
                      {pos ? 'Net outflow → accumulation signal' : 'Net inflow → sell pressure signal'}
                    </div>
                  </div>
                )
              })()}

              {(data.insights || []).map((ins, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, padding: '12px 0', borderBottom: i < data.insights.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                  <div style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, background: toneColor(ins.tone), flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.6, color: toneColor(ins.tone), marginBottom: 3 }}>{ins.tag}</div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', lineHeight: 1.45 }}>{ins.text}</div>
                  </div>
                </div>
              ))}

              {data.exchanges?.length > 0 && (() => {
                const maxAbs = Math.max(...data.exchanges.map(e => Math.abs(e.net)), 1)
                return (
                  <div style={{ marginTop: 18 }}>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontWeight: 700, letterSpacing: 0.8, marginBottom: 8 }}>PER-EXCHANGE NET FLOW</div>
                    {data.exchanges.map((e, i) => {
                      const pos = e.net >= 0
                      const w = Math.max(4, Math.round(Math.abs(e.net) / maxAbs * 100))
                      return (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.75)', width: 90, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.venue}</span>
                          <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.04)', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ width: `${w}%`, height: '100%', background: pos ? '#00e87a' : '#f43f5e', opacity: 0.8 }} />
                          </div>
                          <span style={{ fontSize: 10, fontWeight: 800, fontFamily: 'var(--font-mono)', color: pos ? '#00e87a' : '#f43f5e', width: 64, textAlign: 'right', flexShrink: 0 }}>
                            {pos ? '+' : '−'}{fmtUSD(Math.abs(e.net))}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
            </>
          )}

          {!loading && tab === 'corridors' && (
            <>
              {corrLoading && <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, textAlign: 'center', padding: 30 }}>Loading…</div>}
              {!corrLoading && (!corridors || corridors.length === 0) && (
                <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, textAlign: 'center', padding: 30, lineHeight: 1.5 }}>
                  No recurring corridors in this window.<br />
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.18)' }}>Same address pair with 3+ transfers will appear here.</span>
                </div>
              )}
              {!corrLoading && corridors?.length > 0 && corridors.map((c, i) => {
                const tone = toneColor(c.tone)
                return (
                  <div key={i} style={{ display: 'flex', gap: 10, padding: '11px 0', borderBottom: i < corridors.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                    <div style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, background: tone, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 3 }}>
                        <span style={{ fontSize: 12, color: '#fff', fontWeight: 700, fontFamily: c.from_label ? 'inherit' : 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.from_label || shortAddr(c.from_addr)} <span style={{ color: tone, fontWeight: 900 }}>{c.arrow}</span> {c.to_label || shortAddr(c.to_addr)}
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 900, fontFamily: 'var(--font-mono)', color: tone, flexShrink: 0 }}>{fmtUSD(c.total_usd)}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 3 }}>
                        <span style={{ fontSize: 10, fontWeight: 800, color: '#fff', background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: 4 }}>{c.count}× transfers</span>
                        {c.asset && <span style={{ fontSize: 10, color: ASSET_COLOR[c.asset] || '#999', fontWeight: 700 }}>{c.asset}</span>}
                        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)' }}>last {timeAgo(c.last_ts)} ago</span>
                      </div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', lineHeight: 1.4 }}>{c.read}</div>
                    </div>
                  </div>
                )
              })}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Skeleton() {
  return (
    <>
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <div style={{ width: 40, height: 22, borderRadius: 6, background: 'rgba(255,255,255,0.06)', flexShrink: 0 }} />
          <div style={{ width: 60, flexShrink: 0 }}>
            <div style={{ height: 13, width: 36, borderRadius: 4, background: 'rgba(255,255,255,0.07)' }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ height: 14, width: 90, borderRadius: 4, background: 'rgba(255,255,255,0.08)', marginBottom: 5 }} />
            <div style={{ height: 10, width: 180, borderRadius: 4, background: 'rgba(255,255,255,0.04)' }} />
          </div>
          <div style={{ height: 11, width: 28, borderRadius: 4, background: 'rgba(255,255,255,0.04)', flexShrink: 0 }} />
        </div>
      ))}
    </>
  )
}

export default function BigTransfers() {
  const { token } = useAuth()
  const [transfers,    setTransfers]    = useState([])
  const [aggregates,   setAggregates]   = useState(null)
  const [loading,      setLoading]      = useState(true)
  const [connected,    setConnected]    = useState(false)
  const [chainFilter,  setChainFilter]  = useState('ALL')
  const [assetFilter,  setAssetFilter]  = useState('ALL')
  const [flowFilter,   setFlowFilter]   = useState('CEX_FLOW')
  const [assetClass,   setAssetClass]   = useState('ALL')
  const [threshold,    setThreshold]    = useState(500_000)
  const [insightsOpen, setInsightsOpen] = useState(false)
  const seenRef    = useRef(new Set())
  const lastTsRef  = useRef(0)

  const ingest = useCallback((rows) => {
    if (!Array.isArray(rows) || !rows.length) return
    setTransfers(prev => {
      const seen  = seenRef.current
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
      return merged.slice(0, 1000)
    })
  }, [])

  useEffect(() => {
    if (!token) return
    let alive = true
    async function pull() {
      try {
        const params = new URLSearchParams({ min_usd: '0', limit: '1000' })
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
      } catch { setConnected(false) }
    }
    pull()
    const id = setInterval(pull, 10000)
    return () => { alive = false; clearInterval(id) }
  }, [token, ingest])

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
        if (data?.flows) setAggregates({
          ...data.flows,
          coin: data.coin, stable: data.stable, sentiment: data.sentiment,
        })
      } catch {}
    }
    pullAgg()
    const id = setInterval(pullAgg, 30000)
    return () => { alive = false; clearInterval(id) }
  }, [token])

  const onWsMessage = useCallback((msg) => {
    if (!msg) return
    if (msg.type === 'ws_connected')    { setConnected(true);  return }
    if (msg.type === 'ws_disconnected') { setConnected(false); return }
    if (msg.type !== 'big_transfer') return
    ingest([{
      chain: msg.chain, asset: msg.asset, tx_hash: msg.tx_hash,
      amount: msg.amount, amount_usd: msg.amount_usd,
      from: msg.from, to: msg.to,
      from_label: msg.from_label, to_label: msg.to_label,
      flow_category: msg.flow_category,
      ts: msg.ts, link: msg.link,
    }])
  }, [ingest])
  useWebSocket(onWsMessage, [], { token })

  const filtered = transfers
    .filter(t => chainFilter === 'ALL' || t.chain === chainFilter.toLowerCase())
    .filter(t => {
      if (assetFilter === 'ALL') return true
      const a = t.asset === 'WETH' ? 'ETH' : t.asset === 'WBTC' ? 'BTC' : t.asset
      return a === assetFilter
    })
    .filter(t => {
      if (assetClass === 'ALL') return true
      const stable = STABLE_SYMS.has((t.asset || '').toUpperCase())
      return assetClass === 'stable' ? stable : !stable
    })
    .filter(t => {
      if (flowFilter === 'ALL') return true
      if (flowFilter === 'CEX_FLOW') return ['cex_inflow', 'cex_outflow', 'mint', 'burn'].includes(t.flow_category)
      return t.flow_category === flowFilter
    })
    .filter(t => t.amount_usd >= threshold)
    .slice(0, 200)

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-0)', color: 'var(--text-0)', overflowY: 'auto' }}>

      {/* Header */}
      <div style={{ padding: '20px 20px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-0)', letterSpacing: -0.3 }}>Whale Transfers</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{
                display: 'inline-block', width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                background: connected ? '#00e87a' : '#555',
                boxShadow: connected ? '0 0 6px #00e87a88' : 'none',
              }} />
              {connected ? 'On-chain · BTC · ETH · TRON · Live' : 'Connecting…'}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', fontWeight: 700, letterSpacing: 0.8, fontFamily: 'var(--font-mono)' }}>24H TRANSFERS</div>
            <div style={{ fontSize: 20, fontWeight: 900, fontFamily: 'var(--font-mono)', color: 'var(--text-0)' }}>{transfers.length}</div>
          </div>
        </div>

        {/* Threshold pills */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 10, flexWrap: 'wrap' }}>
          {THRESHOLDS.map(v => (
            <button key={v} onClick={() => setThreshold(v)}
              style={{
                padding: 0, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700,
                background: 'transparent',
                color: threshold === v ? 'var(--text-0)' : 'rgba(255,255,255,0.28)',
                transition: 'color 0.15s',
              }}>
              {v >= 1_000_000 ? `$${v / 1_000_000}M+` : `$${v / 1000}K+`}
            </button>
          ))}
        </div>

        {/* Flow filter */}
        <div style={{ display: 'flex', gap: 16, overflowX: 'auto', paddingBottom: 4, marginBottom: 4, scrollbarWidth: 'none' }}>
          {FLOW_FILTERS.map(f => (
            <button key={f.id} onClick={() => setFlowFilter(f.id)}
              style={{
                padding: 0, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, flexShrink: 0,
                background: 'transparent',
                color: flowFilter === f.id ? 'var(--text-0)' : 'rgba(255,255,255,0.28)',
                transition: 'color 0.15s',
              }}>
              {f.label}
            </button>
          ))}
        </div>

        {/* Chain + asset filters */}
        <div style={{ display: 'flex', gap: 14, overflowX: 'auto', scrollbarWidth: 'none' }}>
          {CHAIN_FILTERS.map(c => (
            <button key={c} onClick={() => setChainFilter(c)}
              style={{
                padding: 0, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, flexShrink: 0,
                background: 'transparent',
                color: chainFilter === c ? 'var(--text-0)' : 'rgba(255,255,255,0.28)',
              }}>
              {c === 'ALL' ? 'All Chains' : c}
            </button>
          ))}
          <div style={{ width: 1, background: 'rgba(255,255,255,0.08)', flexShrink: 0 }} />
          {ASSET_FILTERS.map(a => (
            <button key={a} onClick={() => setAssetFilter(a)}
              style={{
                padding: 0, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, flexShrink: 0,
                background: 'transparent',
                color: assetFilter === a ? 'var(--text-0)' : 'rgba(255,255,255,0.28)',
              }}>
              {a === 'ALL' ? 'All Assets' : a}
            </button>
          ))}
        </div>
      </div>

      {/* Sentiment gauge */}
      <SentimentGauge aggregates={aggregates} onOpen={() => setInsightsOpen(true)} />
      <FlowInsightsSheet open={insightsOpen} onClose={() => setInsightsOpen(false)} token={token} />

      {/* Flow summary cards */}
      {aggregates?.coin && (
        <FlowSummary
          aggregates={aggregates}
          flowFilter={flowFilter}
          assetClass={assetClass}
          setFlowFilter={setFlowFilter}
          setAssetClass={setAssetClass}
        />
      )}

      {/* Column labels */}
      <div style={{ display: 'flex', padding: '8px 20px', fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.2)', letterSpacing: 0.8, flexShrink: 0 }}>
        <div style={{ width: 40, marginRight: 12 }}>CHAIN</div>
        <div style={{ width: 60 }}>ASSET</div>
        <div style={{ flex: 1 }}>AMOUNT · ADDRESS</div>
        <div>TIME</div>
      </div>

      {/* Feed */}
      {loading
        ? <Skeleton />
        : filtered.length === 0
          ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 20px', gap: 12 }}>
              <div style={{ fontSize: 40 }}>🐋</div>
              <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>
                Waiting for {fmtUSD(threshold)}+ on-chain transfers…
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', textAlign: 'center', maxWidth: 300, lineHeight: 1.5 }}>
                Tracking BTC mempool, ETH USDT/USDC in real-time. Lower the threshold to see more.
              </div>
            </div>
          )
          : filtered.map(t => <TransferRow key={`${t.chain}:${t.asset}:${t.tx_hash}`} t={t} />)
      }
    </div>
  )
}
