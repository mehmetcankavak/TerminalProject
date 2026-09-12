import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Search, ArrowRight, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { API_BASE } from '../config'
import { useWebSocket } from '../hooks/useWebSocket'
import AssetLogo from './AssetLogo'

// Real on-chain big transfers fed by backend trackers (BTC mempool, ETH/TRON stablecoins).
// One row per (chain, tx_hash, asset). Backend persists; we poll + listen on the WS.

const THRESHOLDS = [
  { v: 100_000,    label: 'All sizes' },
  { v: 500_000,    label: '$500K+' },
  { v: 1_000_000,  label: '$1M+' },
  { v: 5_000_000,  label: '$5M+' },
  { v: 10_000_000, label: '$10M+' },
]
const FLOW_FILTERS = [
  { id: 'ALL',         label: 'All' },
  { id: 'CEX_FLOW',    label: 'Exchange Flow' },
  { id: 'cex_inflow',  label: 'Inflow' },
  { id: 'cex_outflow', label: 'Outflow' },
  { id: 'mint',        label: 'Mint' },
]
const FLOW_BADGE = { cex_inflow: ['IN', 'ws-badge-pos'], cex_outflow: ['OUT', 'ws-badge-neg'], inflow: ['IN', 'ws-badge-pos'], outflow: ['OUT', 'ws-badge-neg'], mint: ['MINT', 'ws-badge-pos'], burn: ['BURN', 'ws-badge-neg'], cex_internal: ['INT', ''], unknown: ['—', ''] }
const STABLE_SYMS = new Set(['USDT', 'USDC', 'DAI', 'FDUSD', 'PYUSD', 'USDP', 'TUSD', 'BUSD'])
const CHAIN_NAME = { btc: 'Bitcoin', eth: 'Ethereum', tron: 'Tron', sol: 'Solana', arb: 'Arbitrum', base: 'Base', bsc: 'BNB Chain', bnb: 'BNB Chain' }
const CHAIN_LOGO = { btc: 'BTC', eth: 'ETH', tron: 'TRX', sol: 'SOL', arb: 'ARB', base: 'BASE', bsc: 'BNB', bnb: 'BNB' }
const PAGE_SIZE = 15

const fmtUSD = n => n == null || isNaN(n) ? '—' : n >= 1e9 ? '$' + (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? '$' + (n / 1e6).toFixed(1) + 'M' : '$' + Math.round(n).toLocaleString('en-US')
const fmtUSDFull = n => n == null || isNaN(n) ? '—' : '$' + Math.round(n).toLocaleString('en-US')
const fmtAmount = n => n == null || isNaN(n) ? '—' : n >= 1000 ? Math.round(n).toLocaleString('en-US') : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const shortAddr = a => !a ? '—' : a.length > 14 ? a.slice(0, 6) + '…' + a.slice(-4) : a
const fmtTime = ts => {
  if (!ts) return '—'
  const d = new Date(ts < 1e12 ? ts * 1000 : ts)
  return d.toISOString().slice(0, 10) + ' ' + d.toTimeString().slice(0, 8)
}
const fmtClock = () => { const d = new Date(); return d.toUTCString().replace(/^(\w+), (\d+) (\w+) (\d+) (\d+:\d+:\d+).*$/, '$1, $3 $2, $4  $5 UTC') }
const isBullish = t => (t.flow_category === 'cex_inflow') === STABLE_SYMS.has((t.asset || '').toUpperCase())

/* ── KPI strip ──────────────────────────────────────────────────────────── */
function KpiCards({ aggregates }) {
  const coin   = aggregates?.coin   || { inflow: 0, outflow: 0 }
  const stable = aggregates?.stable || { inflow: 0, outflow: 0 }
  const mint   = aggregates?.mint   || { count: 0, sum_usd: 0 }
  const burn   = aggregates?.burn   || { count: 0, sum_usd: 0 }
  const inflowCount  = aggregates?.cex_inflow?.count  || 0
  const outflowCount = aggregates?.cex_outflow?.count || 0
  const cards = [
    { label: 'COIN IN',    val: coin.inflow,    tone: 'ws-pos', sub: `${inflowCount} tx` },
    { label: 'COIN OUT',   val: coin.outflow,   tone: 'ws-neg', sub: `${outflowCount} tx` },
    { label: 'STABLE IN',  val: stable.inflow,  tone: 'ws-pos', sub: 'buying power' },
    { label: 'STABLE OUT', val: stable.outflow, tone: 'ws-neg', sub: 'power exit' },
    { label: 'MINT',       val: mint.sum_usd,   tone: 'ws-pos', sub: `${mint.count} tx` },
    { label: 'BURN',       val: burn.sum_usd,   tone: 'ws-neg', sub: `${burn.count} tx` },
  ]
  return (
    <div className="ws-kpi-strip ws-kpi-strip-bare bt-kpis">
      {cards.map(c => (
        <div key={c.label}>
          <div className="ws-kpi-label ws-caps">{c.label}</div>
          <div className={`ws-kpi-value ws-kpi-mono ${c.tone}`}>{aggregates ? fmtUSD(c.val) : '—'}</div>
          <div className="ws-kpi-sub"><span className={c.tone}>▲</span> {c.sub} <span className="ws-subtle">24h</span></div>
        </div>
      ))}
    </div>
  )
}

/* ── Flow table ─────────────────────────────────────────────────────────── */
function FlowTable({ rows, page, setPage }) {
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const cur = Math.min(page, pages)
  const slice = rows.slice((cur - 1) * PAGE_SIZE, cur * PAGE_SIZE)
  const pageNums = useMemo(() => {
    const s = new Set([1, 2, 3, 4, 5, pages, cur - 1, cur, cur + 1].filter(n => n >= 1 && n <= pages))
    return [...s].sort((a, b) => a - b)
  }, [pages, cur])

  return (
    <>
      <div className="ws-table-wrap">
        <table className="ws-table bt-table">
          <thead>
            <tr>
              <th>#</th><th>Asset</th><th className="ws-right">Amount</th><th className="ws-right">USD Value</th>
              <th>From</th><th /><th>To</th><th>Chain</th><th>Time</th><th className="ws-center">Flow</th>
            </tr>
          </thead>
          <tbody>
            {slice.length === 0 ? (
              <tr><td colSpan={10}><div className="ws-empty"><div className="ws-empty-title">No transfers match these filters yet.</div><div className="ws-empty-sub">Tracking BTC mempool and ETH / TRON stablecoins in real time.</div></div></td></tr>
            ) : slice.map((t, i) => {
              const [flowLabel, flowCls] = FLOW_BADGE[t.flow_category] || FLOW_BADGE.unknown
              const bullish = isBullish(t)
              return (
                <tr key={`${t.chain}:${t.asset}:${t.tx_hash}`} className={t.link ? 'ws-table-click' : ''} onClick={() => { if (t.link) window.open(t.link, '_blank') }}>
                  <td className="ws-muted">{(cur - 1) * PAGE_SIZE + i + 1}</td>
                  <td><div className="ws-asset"><span className="ws-asset-logo ws-asset-logo-sm"><AssetLogo symbol={t.asset} type="crypto" size={20} radius={10} /></span><span className="ws-asset-sym" style={{ fontWeight: 600 }}>{t.asset}</span></div></td>
                  <td className={`ws-right ws-mono ${bullish ? 'ws-pos' : 'ws-neg'}`}>{fmtAmount(t.amount)}</td>
                  <td className="ws-right ws-mono ws-ink">{fmtUSDFull(t.amount_usd)}</td>
                  <td className={t.from_label ? 'ws-ink' : 'ws-mono ws-text'}>{t.from_label || shortAddr(t.from)}</td>
                  <td className="ws-subtle"><ArrowRight size={14} /></td>
                  <td className={t.to_label ? 'ws-ink' : 'ws-mono ws-text'}>{t.to_label || shortAddr(t.to)}</td>
                  <td><div className="ws-asset"><span className="ws-asset-logo ws-asset-logo-sm"><AssetLogo symbol={CHAIN_LOGO[t.chain] || t.chain} type="crypto" size={20} radius={10} /></span><span>{CHAIN_NAME[t.chain] || String(t.chain || '').toUpperCase()}</span></div></td>
                  <td className="ws-mono ws-text">{fmtTime(t.ts)}</td>
                  <td className="ws-center"><span className={`ws-badge ws-badge-mono ${flowCls}`}>{flowLabel}</span></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="ws-row-between ws-mt-16">
        <span className="ws-text">Showing {rows.length ? (cur - 1) * PAGE_SIZE + 1 : 0} – {Math.min(cur * PAGE_SIZE, rows.length)} of {rows.length.toLocaleString('en-US')} transfers</span>
        <div className="ws-pager">
          <button disabled={cur <= 1} onClick={() => setPage(cur - 1)}><ChevronLeft size={16} /></button>
          {pageNums.map((n, i) => (
            <span key={n} style={{ display: 'contents' }}>
              {i > 0 && pageNums[i - 1] !== n - 1 && <span>…</span>}
              <button className={n === cur ? 'active' : ''} onClick={() => setPage(n)}>{n}</button>
            </span>
          ))}
          <button disabled={cur >= pages} onClick={() => setPage(cur + 1)}><ChevronRight size={16} /></button>
        </div>
      </div>
    </>
  )
}

/* ── Corridors / breakdown ─────────────────────────────────────────────── */
function CorridorsTab({ token }) {
  const [rows, setRows] = useState(null)
  useEffect(() => {
    if (!token) return
    let alive = true
    fetch(`${API_BASE}/api/big-transfers/corridors?window_sec=86400&min_count=3`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null).catch(() => null)
      .then(d => { if (alive) setRows(d?.corridors || []) })
    return () => { alive = false }
  }, [token])
  if (rows === null) return <div className="ws-loading"><span className="ws-spinner" /> Loading corridors…</div>
  return (
    <div className="ws-table-wrap">
      <table className="ws-table bt-table">
        <thead><tr><th>#</th><th>From</th><th /><th>To</th><th>Asset</th><th className="ws-right">Transfers</th><th className="ws-right">Total</th><th>Last</th><th>Read</th></tr></thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={9}><div className="ws-empty"><div className="ws-empty-title">No recurring corridors in the last 24 hours.</div><div className="ws-empty-sub">The same address pair with 3+ transfers will appear here.</div></div></td></tr>
          ) : rows.map((c, i) => (
            <tr key={i}>
              <td className="ws-muted">{i + 1}</td>
              <td className={c.from_label ? 'ws-ink' : 'ws-mono'}>{c.from_label || shortAddr(c.from_addr)}</td>
              <td className="ws-subtle"><ArrowRight size={14} /></td>
              <td className={c.to_label ? 'ws-ink' : 'ws-mono'}>{c.to_label || shortAddr(c.to_addr)}</td>
              <td className="ws-ink">{c.asset || '—'}</td>
              <td className="ws-right ws-mono">{c.count}×</td>
              <td className={`ws-right ws-mono ${c.tone === 'bull' ? 'ws-pos' : c.tone === 'bear' ? 'ws-neg' : 'ws-ink'}`}>{fmtUSD(c.total_usd)}</td>
              <td className="ws-mono ws-text">{fmtTime(c.last_ts)}</td>
              <td className="ws-muted" style={{ whiteSpace: 'normal', minWidth: 240 }}>{c.read}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function BreakdownTab({ token }) {
  const [data, setData] = useState(null)
  useEffect(() => {
    if (!token) return
    let alive = true
    fetch(`${API_BASE}/api/big-transfers/insights?window_sec=86400`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null).catch(() => null)
      .then(d => { if (alive) setData(d || {}) })
    return () => { alive = false }
  }, [token])
  if (data === null) return <div className="ws-loading"><span className="ws-spinner" /> Loading breakdown…</div>
  const exchanges = data.exchanges || []
  const maxAbs = Math.max(...exchanges.map(e => Math.abs(e.net)), 1)
  const net = data.coin_flow?.net
  return (
    <div className="ws-grid ws-grid-2">
      <div className="ws-card">
        <div className="ws-card-head"><h3 className="ws-h4">Coin netflow · BTC / ETH</h3>{data.sentiment && <span className={`ws-badge ${data.sentiment.verdict === 'BULLISH' ? 'ws-badge-pos' : data.sentiment.verdict === 'BEARISH' ? 'ws-badge-neg' : ''}`}>{data.sentiment.verdict}</span>}</div>
        <div className="ws-card-body">
          {net != null && <div className={`ws-kpi-value ws-kpi-mono ${net >= 0 ? 'ws-pos' : 'ws-neg'}`}>{net >= 0 ? '+' : '−'}{fmtUSD(Math.abs(net))}</div>}
          <div className="ws-muted ws-mt-8">{net == null ? 'No coin flow in this window.' : net >= 0 ? 'Net outflow → accumulation signal' : 'Net inflow → sell pressure signal'}</div>
          <ul className="mc-caution ws-mt-16">{(data.insights || []).map((ins, i) => <li key={i}><b className="ws-caps" style={{ marginRight: 6 }}>{ins.tag}</b>{ins.text}</li>)}</ul>
        </div>
      </div>
      <div className="ws-card">
        <div className="ws-card-head"><h3 className="ws-h4">Per-exchange net flow</h3></div>
        <div className="ws-card-body">
          {exchanges.length === 0 ? <div className="ws-muted">No exchange flow yet.</div> : exchanges.map((e, i) => {
            const pos = e.net >= 0
            return (
              <div key={i} className="ws-row" style={{ padding: '7px 0' }}>
                <span className="ws-ink" style={{ width: 110 }}>{e.venue}</span>
                <div className="ws-bar ws-flex-1"><div className={`ws-bar-fill ${pos ? '' : 'neg'}`} style={{ width: `${Math.max(4, Math.abs(e.net) / maxAbs * 100)}%` }} /></div>
                <span className={`ws-mono ${pos ? 'ws-pos' : 'ws-neg'}`} style={{ width: 80, textAlign: 'right' }}>{pos ? '+' : '−'}{fmtUSD(Math.abs(e.net))}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ── Page ──────────────────────────────────────────────────────────────── */
export default function BigTransfers() {
  const { token } = useAuth()
  const [transfers, setTransfers]   = useState([])
  const [aggregates, setAggregates] = useState(null)
  const [loading, setLoading]       = useState(true)
  const [tab, setTab]               = useState('flow')
  const [flowFilter, setFlowFilter] = useState('ALL')
  const [threshold, setThreshold]   = useState(500_000)
  const [query, setQuery]           = useState('')
  const [page, setPage]             = useState(1)
  const [clock, setClock]           = useState(fmtClock)
  const seenRef   = useRef(new Set())
  const lastTsRef = useRef(0)

  useEffect(() => { const id = setInterval(() => setClock(fmtClock()), 1000); return () => clearInterval(id) }, [])

  const ingest = useCallback(rows => {
    if (!Array.isArray(rows) || !rows.length) return
    setTransfers(prev => {
      const fresh = rows.filter(r => {
        if (!r || !r.tx_hash) return false
        const key = `${r.chain}:${r.asset}:${r.tx_hash}`
        if (seenRef.current.has(key)) return false
        seenRef.current.add(key)
        return true
      })
      if (!fresh.length) return prev
      const merged = [...fresh, ...prev]
      merged.sort((a, b) => (b.ts || 0) - (a.ts || 0))
      return merged.slice(0, 2000)
    })
  }, [])

  useEffect(() => {
    if (!token) return
    let alive = true
    async function pull() {
      try {
        const params = new URLSearchParams({ min_usd: '0', limit: '1000' })
        if (lastTsRef.current) params.set('since', String(lastTsRef.current))
        const r = await fetch(`${API_BASE}/api/big-transfers/feed?${params}`, { headers: { Authorization: `Bearer ${token}` } })
        if (!alive) return
        if (!r.ok) { setLoading(false); return }
        const rows = (await r.json())?.transfers || []
        if (rows.length) {
          ingest(rows)
          lastTsRef.current = rows.reduce((m, x) => Math.max(m, x.ts || 0), lastTsRef.current)
        }
        setLoading(false)
      } catch { /* retry on the next tick */ }
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
        const r = await fetch(`${API_BASE}/api/big-transfers/aggregates?window_sec=86400`, { headers: { Authorization: `Bearer ${token}` } })
        if (!alive || !r.ok) return
        const data = await r.json()
        if (data?.flows) setAggregates({ ...data.flows, coin: data.coin, stable: data.stable, sentiment: data.sentiment })
      } catch { /* retry on the next tick */ }
    }
    pullAgg()
    const id = setInterval(pullAgg, 30000)
    return () => { alive = false; clearInterval(id) }
  }, [token])

  const onWsMessage = useCallback(msg => {
    if (!msg || msg.type !== 'big_transfer') return
    ingest([{ chain: msg.chain, asset: msg.asset, tx_hash: msg.tx_hash, amount: msg.amount, amount_usd: msg.amount_usd, from: msg.from, to: msg.to, from_label: msg.from_label, to_label: msg.to_label, flow_category: msg.flow_category, ts: msg.ts, link: msg.link }])
  }, [ingest])
  useWebSocket(onWsMessage, [], { token })

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return transfers
      .filter(t => flowFilter === 'ALL' || (flowFilter === 'CEX_FLOW' ? ['cex_inflow', 'cex_outflow', 'mint', 'burn'].includes(t.flow_category) : t.flow_category === flowFilter))
      .filter(t => (t.amount_usd || 0) >= threshold)
      .filter(t => !q || [t.asset, t.from, t.to, t.from_label, t.to_label, CHAIN_NAME[t.chain]].some(v => String(v || '').toLowerCase().includes(q)))
  }, [transfers, flowFilter, threshold, query])

  useEffect(() => { setPage(1) }, [flowFilter, threshold, query])

  return (
    <div className="ws-page">
      <div className="ws-page-head" style={{ marginBottom: 0 }}>
        <div className="ws-page-head-left"><h1 className="ws-title">Big Transfers</h1></div>
        <div className="ws-page-head-right"><span className="ws-meta-stamp">{clock}</span></div>
      </div>

      <div className="ws-tabs ws-tabs-caps ws-mb-16">
        {[['flow', 'Flow'], ['corridors', 'Corridors'], ['breakdown', 'Breakdown']].map(([id, label]) => (
          <button key={id} className={`ws-tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {tab === 'flow' && (
        <>
          <KpiCards aggregates={aggregates} />
          <div className="bt-toolbar">
            <div className="ws-pills">
              {FLOW_FILTERS.map(f => <button key={f.id} className={`ws-pill ${flowFilter === f.id ? 'active' : ''}`} onClick={() => setFlowFilter(f.id)}>{f.label}</button>)}
            </div>
            <div className="ws-row" style={{ marginLeft: 'auto' }}>
              <div className="ws-search" style={{ width: 330 }}>
                <Search size={15} />
                <input className="ws-input" placeholder="Search asset, address, exchange..." value={query} onChange={e => setQuery(e.target.value)} />
              </div>
              <div className="ws-inline-select">
                {THRESHOLDS.find(t => t.v === threshold)?.label} <ChevronDown size={14} />
                <select value={threshold} onChange={e => setThreshold(Number(e.target.value))}>
                  {THRESHOLDS.map(t => <option key={t.v} value={t.v}>{t.label}</option>)}
                </select>
              </div>
            </div>
          </div>
          {loading ? <div className="ws-loading"><span className="ws-spinner" /> Loading transfers…</div> : <FlowTable rows={filtered} page={page} setPage={setPage} />}
        </>
      )}
      {tab === 'corridors' && <CorridorsTab token={token} />}
      {tab === 'breakdown' && <BreakdownTab token={token} />}
    </div>
  )
}
