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
const CHAIN_FILTERS = ['ALL', 'BTC', 'ETH', 'TRON']
const ASSET_FILTERS = ['ALL', 'BTC', 'ETH', 'USDT', 'USDC']

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

const STABLE_SYMS = new Set(['USDT', 'USDC', 'DAI', 'FDUSD', 'PYUSD', 'USDP', 'TUSD', 'BUSD'])
const BULL = { tone: '#00d992', bg: 'rgba(0,217,146,0.12)' }   // yeşil
const BEAR = { tone: '#f43f5e', bg: 'rgba(244,63,94,0.12)' }   // kırmızı

// Asset-aware flow styling. INFLOW/OUTFLOW label stays factual (para gerçekten
// borsaya girdi/çıktı); only the COLOUR reflects bullish/bearish meaning, which
// flips between coins and stablecoins:
//   coin   (BTC/ETH): INFLOW = satış baskısı (kırmızı) · OUTFLOW = biriktirme (yeşil)
//   stable (USDT/…):  INFLOW = alım gücü     (yeşil)   · OUTFLOW = güç çekiliyor (kırmızı)
function flowMeta(flowCat, asset) {
  const base = FLOW_META[flowCat] || FLOW_META.unknown
  if (flowCat === 'cex_inflow' || flowCat === 'cex_outflow') {
    const stable = STABLE_SYMS.has((asset || '').toUpperCase())
    const bullish = flowCat === 'cex_inflow' ? stable : !stable
    return { ...base, ...(bullish ? BULL : BEAR) }
  }
  return base
}

const ASSET_COLOR = {
  BTC:  '#f7931a',
  WBTC: '#f7931a',  // BTC on Ethereum — same brand colour
  ETH:  '#627eea',
  WETH: '#627eea',  // wrapped ETH — same brand colour
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
  if (chain === 'tron') return { label: 'TRON', color: '#eb0029' }
  return { label: chain.toUpperCase(), color: '#888' }
}

// ─── Transfer Row ────────────────────────────────────────────────────────────
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

function SentimentGauge({ aggregates, onOpen }) {
  const s = computeSentiment(aggregates)
  // Need both the raw totals (s) and the backend verdict (sentiment) before we
  // can draw anything — otherwise we'd flash a wrong number.
  if (!s || !aggregates?.sentiment) {
    return (
      <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <div style={{ fontSize: 10, color: '#555', fontWeight: 700, letterSpacing: 0.5 }}>
          SENTIMENT (24S) · veri yükleniyor…
        </div>
      </div>
    )
  }
  // Backend's coin/stablecoin-aware model is the SINGLE source of truth for
  // the verdict — the frontend never recomputes it (avoids two divergent
  // formulas). If it hasn't arrived yet we wait rather than show a guess.
  const bk = aggregates?.sentiment
  const score = bk.score
  const verdict = bk.verdict
  const tone = verdict === 'BULLISH' ? '#00d992'
             : verdict === 'BEARISH' ? '#f43f5e'
             :                          '#aaa'
  // Map [-1, +1] → [0%, 100%] for marker position
  const pct = Math.max(0, Math.min(100, (score + 1) * 50))
  // Asset-aware netflow — coin ve stablecoin TERS yönde okunur:
  //   coin:   borsadan çıkış (+) = biriktirme (bullish/yeşil)
  //   stable: borsaya giriş   (+) = alım gücü  (bullish/yeşil)
  const coinNet   = aggregates?.coin   ? (aggregates.coin.outflow  - aggregates.coin.inflow)   : 0
  const stableNet = aggregates?.stable ? (aggregates.stable.inflow - aggregates.stable.outflow) : 0
  const hasCoin   = aggregates?.coin   && (aggregates.coin.inflow   + aggregates.coin.outflow)   > 0
  const hasStable = aggregates?.stable && (aggregates.stable.inflow + aggregates.stable.outflow) > 0
  return (
    <div
      onClick={onOpen ? () => { haptic('light'); onOpen() } : undefined}
      style={{
        padding: '12px 16px 14px',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        cursor: onOpen ? 'pointer' : 'default',
      }}>
      {/* Header — label + score + verdict */}
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        marginBottom: 10,
      }}>
        <div style={{ fontSize: 10, color: '#888', fontWeight: 700, letterSpacing: 0.8 }}>
          SENTIMENT · 24S{onOpen && <span style={{ color: '#00d992', marginLeft: 6, fontWeight: 800 }}>· ANALİZ ›</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{
            fontSize: 12, fontWeight: 800, fontFamily: 'var(--mono)',
            color: tone,
          }}>
            {score >= 0 ? '+' : ''}{score.toFixed(2)}
          </span>
          <span style={{
            fontSize: 12, fontWeight: 900, letterSpacing: 0.6,
            color: tone,
          }}>
            {verdict}
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

      {/* Asset-aware summary — iki satır: üstte coin/stable, altta mint/burn */}
      <div style={{ fontSize: 11, fontFamily: 'var(--mono)', opacity: 0.9, lineHeight: 1.7 }}>
        {/* Satır 1 — coin & stable yan yana */}
        <div>
          <span style={{ color: '#888' }}>Coin </span>
          {hasCoin
            ? <span style={{ color: coinNet >= 0 ? '#00d992' : '#f43f5e' }}>
                {coinNet >= 0 ? '+' : '−'}{fmtUSD(Math.abs(coinNet))} {coinNet >= 0 ? 'çıkış' : 'giriş'}
              </span>
            : <span style={{ color: '#666' }}>—</span>}
          <span style={{ color: '#888' }}>{'  ·  '}Stable </span>
          {hasStable
            ? <span style={{ color: stableNet >= 0 ? '#00d992' : '#f43f5e' }}>
                {stableNet >= 0 ? '+' : '−'}{fmtUSD(Math.abs(stableNet))} {stableNet >= 0 ? 'giriş' : 'çıkış'}
              </span>
            : <span style={{ color: '#666' }}>—</span>}
        </div>
        {/* Satır 2 — mint & burn yan yana */}
        <div>
          <span style={{ color: '#888' }}>Mint </span>
          <span style={{ color: s.mint > 0 ? '#3b82f6' : '#666' }}>{s.mint > 0 ? '+' + fmtUSD(s.mint) : '—'}</span>
          <span style={{ color: '#888' }}>{'  ·  '}Burn </span>
          <span style={{ color: s.burn > 0 ? '#a855f7' : '#666' }}>{s.burn > 0 ? '−' + fmtUSD(s.burn) : '—'}</span>
        </div>
      </div>
    </div>
  )
}

// ─── Flow Insights Sheet ─────────────────────────────────────────────────────
// Full-screen rule-based analysis of 24h on-chain flow. Opened from the
// SentimentGauge header. Pure observation — no buy/sell calls. Mirrors the
// SmartMoney WhaleInsightsSheet pattern for a consistent UX.
function FlowInsightsSheet({ open, onClose, token }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState('flow') // 'flow' | 'breakdown' | 'corridors'
  const [corridors, setCorridors] = useState(null)
  const [corrLoading, setCorrLoading] = useState(false)

  useEffect(() => {
    if (!open || !token) return
    let alive = true
    setLoading(true)
    fetch(`${API_BASE}/api/big-transfers/insights?window_sec=86400`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .catch(() => null)
      .then(d => { if (alive) { setData(d); setLoading(false) } })
    return () => { alive = false }
  }, [open, token])

  // Corridors are lazy-loaded the first time the tab is opened.
  useEffect(() => {
    if (!open || !token || tab !== 'corridors' || corridors !== null) return
    let alive = true
    setCorrLoading(true)
    fetch(`${API_BASE}/api/big-transfers/corridors?window_sec=86400&min_count=3`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .catch(() => null)
      .then(d => { if (alive) { setCorridors(d?.corridors || []); setCorrLoading(false) } })
    return () => { alive = false }
  }, [open, token, tab, corridors])

  if (!open) return null

  const toneColor = t => t === 'bull' ? '#00d992' : t === 'bear' ? '#f43f5e' : t === 'warn' ? '#f59e0b' : '#888'
  const s = data?.sentiment
  const verdictColor = s?.verdict === 'BULLISH' ? '#00d992' : s?.verdict === 'BEARISH' ? '#f43f5e' : '#aaa'

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) { haptic('light'); onClose() } }}
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.92)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        padding: 'calc(env(safe-area-inset-top) + 14px) 16px 14px',
        borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'var(--bg-1)',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <button onClick={() => { haptic('light'); onClose() }}
          style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: 22, padding: 0, cursor: 'pointer', lineHeight: 1 }}>‹</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>Flow Analizi</div>
          <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>
            {tab === 'flow' ? 'Son 24 saat · para nereye aktı'
              : tab === 'corridors' ? 'Tekrar eden rotalar · kim kimi besliyor'
              : 'Sentiment skoru neden bu seviyede'}
          </div>
        </div>
        {s && (
          <span style={{ fontSize: 13, fontWeight: 900, letterSpacing: 0.6, color: verdictColor }}>
            {s.verdict}
          </span>
        )}
      </div>

      {/* Tab switcher */}
      <div style={{ display: 'flex', padding: '8px 16px 0', gap: 6, borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'var(--bg-1)' }}>
        {[{ id: 'flow', label: 'AKSİYON' }, { id: 'corridors', label: 'KORİDORLAR' }, { id: 'breakdown', label: 'KIRILIM' }].map(t => (
          <button key={t.id} onClick={() => { haptic('light'); setTab(t.id) }}
            style={{
              flex: 1, background: 'transparent', border: 'none', cursor: 'pointer',
              padding: '8px 4px 10px', fontSize: 10, fontWeight: 800, letterSpacing: 0.5,
              color: tab === t.id ? '#00d992' : '#666',
              borderBottom: `2px solid ${tab === t.id ? '#00d992' : 'transparent'}`,
            }}>{t.label}</button>
        ))}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: 'auto', padding: '14px 16px 40px' }}>
        {loading && <div style={{ color: '#666', fontSize: 12, textAlign: 'center', padding: 30 }}>Yükleniyor…</div>}
        {!loading && !data && <div style={{ color: '#666', fontSize: 12, textAlign: 'center', padding: 30 }}>Veri alınamadı.</div>}

        {!loading && data && tab === 'flow' && (
          <>
            {/* Coin netflow headline (BTC/ETH) — the textbook exchange-netflow */}
            {data.coin_flow && (data.coin_flow.inflow + data.coin_flow.outflow) > 0 && (() => {
              const net = data.coin_flow.net
              const pos = net >= 0
              return (
                <div style={{ marginBottom: 16, padding: '12px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: 10, border: `1px solid ${pos ? 'rgba(0,217,146,0.25)' : 'rgba(244,63,94,0.25)'}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                    <span style={{ fontSize: 10, color: '#888', fontWeight: 700, letterSpacing: 0.6 }}>COIN NETFLOW · BTC/ETH</span>
                    <span style={{ fontSize: 13, fontWeight: 900, fontFamily: 'var(--mono)', color: pos ? '#00d992' : '#f43f5e' }}>
                      {pos ? '+' : '−'}{fmtUSD(Math.abs(net))}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: '#bbb', lineHeight: 1.4 }}>
                    {pos ? 'Net borsadan çıkış → biriktirme sinyali' : 'Net borsaya giriş → satış baskısı sinyali'}
                  </div>
                  {data.coins?.length > 0 && (
                    <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
                      {data.coins.map((c, i) => (
                        <span key={i} style={{ fontSize: 11, fontFamily: 'var(--mono)' }}>
                          <span style={{ color: '#fff', fontWeight: 700 }}>{c.asset}</span>
                          <span style={{ color: c.net >= 0 ? '#00d992' : '#f43f5e', marginLeft: 4 }}>
                            {c.net >= 0 ? '+' : '−'}{fmtUSD(Math.abs(c.net))}
                          </span>
                        </span>
                      ))}
                    </div>
                  )}
                  <div style={{ fontSize: 9, color: '#555', marginTop: 6 }}>stablecoin hariç · etiketli borsa akışı (kapsam genişledikçe artar)</div>
                </div>
              )
            })()}

            {/* Hourly net-flow sparkline */}
            {data.hourly?.length > 0 && <FlowSparkline hourly={data.hourly} />}

            {/* Narrative insight cards */}
            {(data.insights || []).map((ins, i) => (
              <div key={i} style={{
                display: 'flex', gap: 10, padding: '12px 0',
                borderBottom: i < data.insights.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
              }}>
                <div style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, background: toneColor(ins.tone), flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.6, color: toneColor(ins.tone), marginBottom: 3 }}>{ins.tag}</div>
                  <div style={{ fontSize: 12, color: '#ddd', lineHeight: 1.45 }}>{ins.text}</div>
                </div>
              </div>
            ))}

            {/* Per-exchange net flow */}
            {data.exchanges?.length > 0 && (() => {
              const maxAbs = Math.max(...data.exchanges.map(e => Math.abs(e.net)), 1)
              return (
                <div style={{ marginTop: 18 }}>
                  <div style={{ fontSize: 10, color: '#888', fontWeight: 700, letterSpacing: 0.8, marginBottom: 8 }}>BORSA BAZINDA AKIŞ (net)</div>
                  {data.exchanges.map((e, i) => {
                    const pos = e.net >= 0
                    const w = Math.max(4, Math.round(Math.abs(e.net) / maxAbs * 100))
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#ddd', width: 78, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.venue}</span>
                        <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.04)', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ width: `${w}%`, height: '100%', background: pos ? '#00d992' : '#f43f5e', opacity: 0.8 }} />
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 800, fontFamily: 'var(--mono)', color: pos ? '#00d992' : '#f43f5e', width: 64, textAlign: 'right', flexShrink: 0 }}>
                          {pos ? '+' : '−'}{fmtUSD(Math.abs(e.net))}
                        </span>
                      </div>
                    )
                  })}
                  <div style={{ fontSize: 9, color: '#555', marginTop: 4 }}>+ çıkış (borsadan çekiliş) · − giriş (borsaya yatış)</div>
                </div>
              )
            })()}

            {/* Biggest single transfers */}
            {data.biggest?.length > 0 && (
              <div style={{ marginTop: 18 }}>
                <div style={{ fontSize: 10, color: '#888', fontWeight: 700, letterSpacing: 0.8, marginBottom: 8 }}>EN BÜYÜK TRANSFERLER</div>
                {data.biggest.slice(0, 5).map((b, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <div style={{ fontSize: 11, color: '#bbb', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <span style={{ fontWeight: 800, color: '#fff' }}>{b.asset}</span>
                      <span style={{ color: '#666' }}> · {b.from_label || b.chain} → {b.to_label || '?'}</span>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 800, fontFamily: 'var(--mono)', color: '#00d992', flexShrink: 0, marginLeft: 8 }}>{fmtUSD(b.amount_usd)}</span>
                  </div>
                ))}
              </div>
            )}

            <div style={{ marginTop: 18, fontSize: 9, color: '#555', lineHeight: 1.5 }}>
              Bu analiz yalnızca on-chain akış gözlemidir, yatırım tavsiyesi değildir.
            </div>
          </>
        )}

        {!loading && data && tab === 'breakdown' && s && (
          <>
            <SubGauge label="COIN AKIŞI · BTC/ETH (net)" value={s.has_coin ? s.coin_exch : 0}
              hint={!s.has_coin ? 'etiketli coin akışı yok' : (s.coin_exch >= 0 ? `${fmtUSD(data.coin_flow.net)} net çıkış → biriktirme (bullish)` : `${fmtUSD(Math.abs(data.coin_flow.net))} net giriş → satış baskısı (bearish)`)} weight="50%" />
            <SubGauge label="STABLECOIN LİKİDİTE (mint/burn)" value={s.has_liq ? s.liq : 0}
              hint={!s.has_liq ? 'mint/burn aktivitesi yok' : (s.liq >= 0 ? `${fmtUSD(data.totals.net_liquidity)} net mint → bullish` : `${fmtUSD(Math.abs(data.totals.net_liquidity))} net burn → bearish`)} weight="30%" />
            <SubGauge label="STABLECOIN → BORSA AKIŞI" value={s.has_stable ? s.stable_sig : 0}
              hint={!s.has_stable ? 'stablecoin borsa akışı yok' : (s.stable_sig >= 0 ? 'borsaya net giriş → alım gücü hazır (bullish)' : 'borsadan net çıkış → alım gücü azalıyor (bearish)')} weight="20%" />
            <div style={{ marginTop: 16, padding: '12px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
              <div style={{ fontSize: 10, color: '#888', fontWeight: 700, letterSpacing: 0.6, marginBottom: 4 }}>SONUÇ SKORU</div>
              <div style={{ fontSize: 11, color: '#aaa', lineHeight: 1.5 }}>
                Mevcut sinyallerin ağırlıklı ortalaması (coin 0.5 · likidite 0.3 · stablecoin 0.2)
                <span style={{ color: verdictColor, fontWeight: 800 }}> = {s.score >= 0 ? '+' : ''}{s.score.toFixed(2)} ({s.verdict})</span>
              </div>
              <div style={{ fontSize: 9, color: '#555', marginTop: 4 }}>coin akışı stablecoin'den ayrı — işaretleri ters olduğu için</div>
            </div>

            {data.top_assets?.length > 0 && (
              <div style={{ marginTop: 18 }}>
                <div style={{ fontSize: 10, color: '#888', fontWeight: 700, letterSpacing: 0.8, marginBottom: 8 }}>AKIŞI SÜRÜKLEYEN VARLIKLAR</div>
                {data.top_assets.map((a, i) => {
                  const bull = a.bullish !== undefined ? a.bullish : a.net >= 0
                  return (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <span style={{ fontSize: 12, fontWeight: 800, color: '#fff' }}>{a.asset}</span>
                      <span style={{ fontSize: 11, fontWeight: 800, fontFamily: 'var(--mono)', color: bull ? '#00d992' : '#f43f5e' }}>
                        {fmtUSD(Math.abs(a.net))} {a.net >= 0 ? 'çıkış' : 'giriş'}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}

        {!loading && tab === 'corridors' && (
          <>
            {corrLoading && <div style={{ color: '#666', fontSize: 12, textAlign: 'center', padding: 30 }}>Yükleniyor…</div>}
            {!corrLoading && (!corridors || corridors.length === 0) && (
              <div style={{ color: '#666', fontSize: 12, textAlign: 'center', padding: 30, lineHeight: 1.5 }}>
                Bu pencerede tekrar eden koridor yok.<br />
                <span style={{ fontSize: 10, color: '#555' }}>Aynı adres çifti 3+ kez transfer yapınca burada belirir.</span>
              </div>
            )}
            {!corrLoading && corridors?.length > 0 && (
              <>
                <div style={{ fontSize: 9, color: '#555', lineHeight: 1.5, marginBottom: 12 }}>
                  Son 24 saatte aynı (gönderen → alıcı) çiftinde tekrarlayan transferler. En çok hacim üstte.
                </div>
                {corridors.map((c, i) => {
                  const tone = toneColor(c.tone)
                  const frm = c.from_label || shortAddr(c.from_addr)
                  const dst = c.to_label || shortAddr(c.to_addr)
                  return (
                    <div key={i} style={{ display: 'flex', gap: 10, padding: '11px 0', borderBottom: i < corridors.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                      <div style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, background: tone, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 3 }}>
                          <span style={{ fontSize: 12, color: '#fff', fontWeight: 700, fontFamily: c.from_label ? 'inherit' : 'var(--mono)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {frm} <span style={{ color: tone, fontWeight: 900 }}>{c.arrow}</span> {dst}
                          </span>
                          <span style={{ fontSize: 12, fontWeight: 900, fontFamily: 'var(--mono)', color: tone, flexShrink: 0 }}>{fmtUSD(c.total_usd)}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 3, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 10, fontWeight: 800, color: '#fff', background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: 4 }}>{c.count}× transfer</span>
                          {c.asset && <span style={{ fontSize: 10, color: ASSET_COLOR[c.asset] || '#999', fontWeight: 700 }}>{c.asset}</span>}
                          {c.chain && <span style={{ fontSize: 9, color: chainBadge(c.chain).color, fontWeight: 700 }}>{chainBadge(c.chain).label}</span>}
                          <span style={{ fontSize: 9, color: '#555' }}>son {timeAgo(c.last_ts)} önce</span>
                        </div>
                        <div style={{ fontSize: 11, color: '#bbb', lineHeight: 1.4 }}>{c.read}</div>
                      </div>
                    </div>
                  )
                })}
                <div style={{ marginTop: 16, fontSize: 9, color: '#555', lineHeight: 1.5 }}>
                  Etiketsiz koridorlar genelde OTC masaları veya market maker rotalarıdır — yönü kesin değildir, ama tekrarı yapısal bir ilişkiye işaret eder.
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// Hourly net-flow timeline: green bars = net outflow (bullish), red = net inflow.
// Bars grow up/down from a centered zero line. Oldest (left) → newest (right).
function FlowSparkline({ hourly }) {
  const maxAbs = Math.max(...hourly.map(v => Math.abs(v)), 1)
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <span style={{ fontSize: 10, color: '#888', fontWeight: 700, letterSpacing: 0.8 }}>SAATLİK NET AKIŞ · 24S</span>
        <span style={{ fontSize: 9, color: '#555' }}>24s önce → şimdi</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, height: 48, position: 'relative' }}>
        {/* zero baseline */}
        <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: 1, background: 'rgba(255,255,255,0.1)' }} />
        {hourly.map((v, i) => {
          const h = Math.max(1, Math.round(Math.abs(v) / maxAbs * 22))
          const pos = v >= 0
          return (
            <div key={i} style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', position: 'relative' }}>
              <div style={{
                position: 'absolute', left: 1, right: 1,
                height: h,
                [pos ? 'bottom' : 'top']: '50%',
                background: pos ? '#00d992' : '#f43f5e',
                opacity: 0.85, borderRadius: 1,
              }} />
            </div>
          )
        })}
      </div>
      <div style={{ fontSize: 9, color: '#555', marginTop: 4 }}>yukarı yeşil = net çıkış · aşağı kırmızı = net giriş</div>
    </div>
  )
}

// Small horizontal sub-gauge used in the sentiment breakdown tab.
function SubGauge({ label, value, hint, weight }) {
  const tone = value > 0.05 ? '#00d992' : value < -0.05 ? '#f43f5e' : '#aaa'
  const pct = Math.max(0, Math.min(100, (value + 1) * 50))
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <span style={{ fontSize: 10, color: '#888', fontWeight: 700, letterSpacing: 0.4 }}>{label}</span>
        <span style={{ fontSize: 9, color: '#555', fontWeight: 700 }}>ağırlık {weight}</span>
      </div>
      <div style={{ position: 'relative', height: 6, marginBottom: 5 }}>
        <div style={{ position: 'absolute', inset: 0, borderRadius: 3, background: 'linear-gradient(to right, rgba(244,63,94,0.5), rgba(255,255,255,0.06) 50%, rgba(0,217,146,0.5))' }} />
        <div style={{ position: 'absolute', top: '50%', left: `${pct}%`, width: 10, height: 10, borderRadius: '50%', background: tone, border: '2px solid #000', transform: 'translate(-50%, -50%)' }} />
      </div>
      <div style={{ fontSize: 10, color: '#999', lineHeight: 1.4 }}>{hint}</div>
    </div>
  )
}

// ─── 24h Flow Summary (4-card dashboard) ─────────────────────────────────────
// Horizontally-scrolling dashboard cards — inflow/outflow split per asset class
// so each card carries ONE correct colour (coin & stablecoin read oppositely):
//   COIN IN  = satış baskısı (kırmızı) · COIN OUT  = biriktirme (yeşil)
//   STABLE IN = alım gücü     (yeşil)  · STABLE OUT = güç çıkışı (kırmızı)
//   MINT (mavi) · BURN (mor) = stablecoin arzı
// Clicking a card filters the feed to that asset-class + direction.
function FlowSummary({ aggregates, flowFilter, assetClass, setFlowFilter, setAssetClass }) {
  const coin   = aggregates?.coin   || { inflow: 0, outflow: 0 }
  const stable = aggregates?.stable || { inflow: 0, outflow: 0 }
  const mint = aggregates?.mint || { count: 0, sum_usd: 0 }
  const burn = aggregates?.burn || { count: 0, sum_usd: 0 }
  const GREEN = '#00d992', RED = '#f43f5e'
  const gBg = 'rgba(0,217,146,0.12)', rBg = 'rgba(244,63,94,0.12)'

  const cards = [
    { label: 'COIN IN',   val: coin.inflow,    color: RED,   bg: rBg, sub: 'satış',     ac: 'coin',   ff: 'cex_inflow'  },
    { label: 'COIN OUT',  val: coin.outflow,   color: GREEN, bg: gBg, sub: 'biriktirme', ac: 'coin',   ff: 'cex_outflow' },
    { label: 'STABLE IN', val: stable.inflow,  color: GREEN, bg: gBg, sub: 'alım gücü',  ac: 'stable', ff: 'cex_inflow'  },
    { label: 'STABLE OUT',val: stable.outflow, color: RED,   bg: rBg, sub: 'çıkış',      ac: 'stable', ff: 'cex_outflow' },
    { label: 'MINT', val: mint.sum_usd, color: FLOW_META.mint.tone, bg: FLOW_META.mint.bg, sub: `${mint.count} tx`, ac: null, ff: 'mint' },
    { label: 'BURN', val: burn.sum_usd, color: FLOW_META.burn.tone, bg: FLOW_META.burn.bg, sub: `${burn.count} tx`, ac: null, ff: 'burn' },
  ]

  const isActive = (c) => c.ac != null
    ? (assetClass === c.ac && flowFilter === c.ff)
    : (flowFilter === c.ff)

  const apply = (c) => {
    if (isActive(c)) { setAssetClass('ALL'); setFlowFilter('CEX_FLOW') }
    else { setAssetClass(c.ac || 'ALL'); setFlowFilter(c.ff) }
  }

  return (
    <div className="no-scrollbar" style={{
      display: 'flex', gap: 6, overflowX: 'auto', WebkitOverflowScrolling: 'touch',
      padding: '10px 16px 12px',
      borderBottom: '1px solid rgba(255,255,255,0.04)',
    }}>
      {cards.map(c => {
        const active = isActive(c)
        return (
          <button key={c.label}
            onClick={() => { haptic('light'); apply(c) }}
            style={{
              flex: '0 0 auto', minWidth: 84,
              background: active ? c.bg : 'rgba(255,255,255,0.03)',
              border: `1px solid ${active ? c.color + '60' : 'rgba(255,255,255,0.06)'}`,
              borderRadius: 10, padding: '8px 10px', cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2,
              transition: 'background 0.15s, border 0.15s',
            }}>
            <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.5, color: c.color, lineHeight: 1, whiteSpace: 'nowrap' }}>{c.label}</div>
            <div style={{ fontSize: 12, fontWeight: 800, fontFamily: 'var(--mono)', color: '#fff', lineHeight: 1.1, marginTop: 4, whiteSpace: 'nowrap' }}>{fmtUSD(c.val)}</div>
            <div style={{ fontSize: 9, color: c.color, fontFamily: 'var(--mono)', lineHeight: 1, whiteSpace: 'nowrap', opacity: 0.85 }}>{c.sub}</div>
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
  const [assetClass,  setAssetClass]  = useState('ALL')       // 'ALL' | 'coin' | 'stable'
  const [threshold,   setThreshold]   = useState(500_000)
  const [insightsOpen, setInsightsOpen] = useState(false)
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
        // Keep flow buckets at top level (computeSentiment + count reducer read
        // aggregates.cex_inflow etc.) and attach the asset-aware extras so the
        // cards/gauge can read aggregates.coin / .stable / .sentiment.
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
    .filter(t => {
      if (assetFilter === 'ALL') return true
      // Fold wrapped assets so the BTC/ETH coin filters also catch WBTC/WETH.
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
              {connected ? 'On-chain · BTC · ETH · TRON · Canlı' : 'Bağlanıyor…'}
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
        <div className="no-scrollbar" style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 4, marginBottom: 4 }}>
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
        <div className="no-scrollbar" style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 2 }}>
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
      <SentimentGauge aggregates={aggregates} onOpen={() => setInsightsOpen(true)} />
      <FlowInsightsSheet open={insightsOpen} onClose={() => setInsightsOpen(false)} token={token} />

      {/* 24h flow summary — tap a card to filter feed by that flow.
          Only mount once aggregates exist so the first paint already carries
          real values (iOS WebView defers repainting until a touch otherwise). */}
      {aggregates?.coin && (
        <FlowSummary aggregates={aggregates} flowFilter={flowFilter} assetClass={assetClass}
          setFlowFilter={setFlowFilter} setAssetClass={setAssetClass} />
      )}

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
