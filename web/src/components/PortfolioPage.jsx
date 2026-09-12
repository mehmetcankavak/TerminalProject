import { useState, useEffect, useCallback, useMemo } from 'react'
import { ChevronDown, MoreVertical } from 'lucide-react'
import { API_BASE } from '../config'
import { useAuth } from '../context/AuthContext'
import DataState from './DataState'
import AssetLogo from './AssetLogo'

/* ── Formatters ─────────────────────────────────────────────────── */
const fmt    = (n, dec = 2) => n == null ? '—' : Number(n).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })
const fmtUsd = (n, dec = 2) => n == null ? '—' : '$' + fmt(n, dec)
const fmtPnl = n => n == null ? '—' : (n >= 0 ? '+$' : '-$') + fmt(Math.abs(n))
const fmtPct = n => n == null ? '—' : (n >= 0 ? '+' : '') + Number(n).toFixed(2) + '%'
const normSide = s => String(s || '').trim().toLowerCase()
const isLong = s => ['long', 'buy'].includes(normSide(s))
const sideLabel = s => isLong(s) ? 'Long' : ['short', 'sell'].includes(normSide(s)) ? 'Short' : String(s || '—')
const fmtQty = (q, sym) => q == null ? '—' : (q >= 1000 ? Math.round(q).toLocaleString('en-US') : q.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')) + ' ' + sym
const timeAgo = iso => {
  if (!iso) return '—'
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}
const SOURCES = { binance: 'Binance', hyperliquid: 'Hyperliquid', paper: 'Paper Trading' }

/* ── Equity chart ───────────────────────────────────────────────── */
function EquityChart({ points, base }) {
  const W = 1000, H = 200, padL = 0, padR = 8, padT = 8, padB = 8
  if (!points || points.length < 2) return <div className="ws-empty"><div className="ws-empty-title">No chart data for this range.</div></div>
  const ys = points.map(p => base + p.y)
  const minY = Math.min(...ys), maxY = Math.max(...ys)
  const span = Math.max(maxY - minY, Math.abs(maxY) * 0.02, 1)
  const lo = minY - span * 0.15, hi = maxY + span * 0.15
  const x = i => padL + (i / (points.length - 1)) * (W - padL - padR)
  const y = v => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB)
  const path = ys.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const up = ys[ys.length - 1] >= ys[0]
  const stroke = up ? '#16a34a' : '#dc2626'
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(t => lo + (hi - lo) * t)
  const labelEvery = Math.max(1, Math.round(points.length / 6))
  return (
    <div className="lsr-chart">
      <div className="lsr-chart-y" style={{ height: H, minWidth: 54 }}>{[...ticks].reverse().map((v, i) => <span key={i}>{v >= 1000 ? Math.round(v).toLocaleString('en-US') : v.toFixed(0)}</span>)}</div>
      <div className="lsr-chart-plot">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height={H}>
          <defs><linearGradient id="pf-grad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={stroke} stopOpacity="0.22" /><stop offset="100%" stopColor={stroke} stopOpacity="0" /></linearGradient></defs>
          {ticks.map((v, i) => <line key={i} x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="#e5e7eb" strokeDasharray="3 4" />)}
          {[0.25, 0.5, 0.75].map(t => <line key={t} x1={x(Math.round((points.length - 1) * t))} x2={x(Math.round((points.length - 1) * t))} y1={padT} y2={H - padB} stroke="#e5e7eb" strokeDasharray="3 4" />)}
          <path d={`${path} L${x(points.length - 1)},${H - padB} L${x(0)},${H - padB} Z`} fill="url(#pf-grad)" />
          <path d={path} fill="none" stroke={stroke} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        </svg>
        <div className="lsr-chart-x" style={{ right: 0 }}>
          {points.map((p, i) => i % labelEvery === 0 ? <span key={i} style={{ left: `${(x(i) / W) * 100}%` }}>{p.label}</span> : null)}
        </div>
      </div>
    </div>
  )
}

/* ── Send / withdraw modal (Hyperliquid) ────────────────────────── */
function HlModal({ type, onClose, available, onDone, token }) {
  const [dest, setDest] = useState('')
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const submit = async () => {
    const amt = parseFloat(amount)
    if (!isFinite(amt) || amt <= 0) { setMsg({ ok: false, text: 'Enter a valid amount' }); return }
    if (type === 'send' && !dest.trim()) { setMsg({ ok: false, text: 'Destination address is required' }); return }
    setBusy(true); setMsg(null)
    try {
      const res = await fetch(`${API_BASE}${type === 'withdraw' ? '/api/hl/withdraw' : '/api/hl/send'}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(type === 'withdraw' ? { amount: amt } : { destination: dest.trim(), amount: amt }),
      })
      const d = await res.json()
      if (d.ok) { setMsg({ ok: true, text: type === 'withdraw' ? `$${amt} withdrawal sent` : `$${amt} USDC sent` }); setTimeout(() => { onDone?.(); onClose() }, 1600) }
      else setMsg({ ok: false, text: d.error || 'Transaction failed' })
    } catch (e) { setMsg({ ok: false, text: e.message }) }
    finally { setBusy(false) }
  }
  return (
    <div className="ws-modal-overlay" onClick={onClose}>
      <div className="ws-modal" onClick={e => e.stopPropagation()}>
        <div className="ws-modal-head"><h3 className="ws-h3">{type === 'withdraw' ? 'Withdraw to Arbitrum' : 'Send USDC'}</h3></div>
        <div className="ws-modal-body ws-form">
          <p className="ws-muted" style={{ margin: 0 }}>{type === 'withdraw' ? 'Withdraw USDC from Hyperliquid to Arbitrum One.' : 'Send USDC to another Hyperliquid address. Free and instant.'}</p>
          {type === 'send' && <div className="ws-field"><label>Destination address</label><input className="ws-input ws-mono" value={dest} onChange={e => setDest(e.target.value)} placeholder="0x…" spellCheck={false} /></div>}
          <div className="ws-field">
            <div className="ws-row-between"><label>Amount (USDC)</label>{available != null && <button className="ws-link ws-small" onClick={() => setAmount(String(available))}>MAX ${fmt(available)}</button>}</div>
            <input className="ws-input ws-mono" value={amount} onChange={e => setAmount(e.target.value)} type="number" inputMode="decimal" placeholder="0.00" onKeyDown={e => e.key === 'Enter' && submit()} />
          </div>
          {msg && <div className={`ws-note ${msg.ok ? 'ws-note-ok' : 'ws-note-err'}`}>{msg.text}</div>}
          <div className="ws-row" style={{ justifyContent: 'flex-end' }}>
            <button className="ws-btn" onClick={onClose}>Cancel</button>
            <button className="ws-btn ws-btn-primary" disabled={busy} onClick={submit}>{busy ? 'Processing…' : type === 'withdraw' ? 'Withdraw' : 'Send'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Page ───────────────────────────────────────────────────────── */
const RANGES = [['24h', '1D'], ['7d', '1W'], ['30d', '1M'], ['all', 'All']]

export default function PortfolioPage() {
  const { token } = useAuth()
  const [data, setData]         = useState(null)
  const [liveData, setLiveData] = useState(null)
  const [loading, setLoading]   = useState(true)
  const [errorMsg, setErrorMsg] = useState(null)
  const [tab, setTab]           = useState('positions')
  const [range, setRange]       = useState('24h')
  const [modal, setModal]       = useState(null)

  const load = useCallback(() =>
    fetch(`${API_BASE}/api/portfolio`, token ? { headers: { Authorization: `Bearer ${token}` } } : {})
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(d => { setData(d); setErrorMsg(null); setLoading(false) })
      .catch(e => { setErrorMsg(e.message); setLoading(false) }), [token])
  const loadLive = useCallback(() => {
    if (!token) return
    fetch(`${API_BASE}/api/balances`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.ok ? r.json() : null).then(d => { if (d) setLiveData(d) }).catch(() => {})
  }, [token])
  useEffect(() => { load(); const id = setInterval(load, 30_000); return () => clearInterval(id) }, [load])
  useEffect(() => { loadLive(); const id = setInterval(loadLive, 15_000); return () => clearInterval(id) }, [loadLive])

  const balance = data?.balance ?? 0
  const available = data?.available ?? 0
  const isHL = data?.source === 'hyperliquid'
  const realizedPnl = isHL ? (data?.all_time_pnl ?? data?.realized_pnl ?? null) : (data?.realized_pnl ?? null)
  const unrealizedPnl = data?.unrealized_pnl ?? null
  const positions = data?.positions || []
  const trades = data?.trades || []
  const pnlWindows = data?.pnl_windows || {}
  const liveSource = liveData?.source && liveData.source !== 'paper' ? liveData.source : (data?.source || 'paper')
  const canHlTransfer = liveSource === 'hyperliquid' && liveData?.balances

  const chartPoints = useMemo(() => {
    const hist = pnlWindows?.[range] || []
    if (isHL && hist.length) return hist.filter(p => p?.timestamp != null && p?.pnl != null).map(p => ({ y: Number(p.pnl), label: new Date(Number(p.timestamp)).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) }))
    const cutoff = range === '24h' ? 86400e3 : range === '7d' ? 7 * 86400e3 : range === '30d' ? 30 * 86400e3 : Infinity
    const rows = [...trades].filter(t => !t.closed_at || Date.now() - new Date(t.closed_at).getTime() <= cutoff).sort((a, b) => new Date(a.closed_at || 0) - new Date(b.closed_at || 0))
    let cum = 0
    const pts = rows.map(t => { cum += (t.total_pnl ?? t.realized_pnl ?? 0); return { y: cum, label: t.closed_at ? new Date(t.closed_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) : '' } })
    if (positions.length) pts.push({ y: cum + (unrealizedPnl || 0), label: 'now' })
    if (pts.length === 1) pts.unshift({ y: 0, label: '' })
    return pts
  }, [pnlWindows, range, isHL, trades, positions, unrealizedPnl])

  const rangePnl = chartPoints.length ? chartPoints[chartPoints.length - 1].y - chartPoints[0].y : 0
  const rangePct = balance ? (rangePnl / Math.max(Math.abs(balance - rangePnl), 1)) * 100 : 0
  const base = balance - (chartPoints.length ? chartPoints[chartPoints.length - 1].y : 0)

  if (loading || errorMsg) return <div className="ws-page"><DataState loading={loading} error={errorMsg} onRetry={load} minHeight={300} /></div>

  const kpis = [
    ['Total Equity', fmtUsd(balance), rangePnl, `${fmtPct(rangePct)}  ${fmtPnl(rangePnl)}`],
    ['Available Balance', fmtUsd(available), null, null],
    ['Unrealized PnL', fmtPnl(unrealizedPnl), unrealizedPnl, unrealizedPnl != null && balance ? fmtPct((unrealizedPnl / balance) * 100) : null],
    ['Realized PnL', fmtPnl(realizedPnl), realizedPnl, realizedPnl != null && balance ? fmtPct((realizedPnl / Math.max(balance - realizedPnl, 1)) * 100) : null],
  ]

  return (
    <div className="ws-page">
      <div className="ws-page-head">
        <div className="ws-page-head-left"><h1 className="ws-title">Portfolio</h1></div>
        <div className="ws-page-head-right">
          {canHlTransfer && <><button className="ws-btn" onClick={() => setModal('send')}>Send</button><button className="ws-btn" onClick={() => setModal('withdraw')}>Withdraw</button></>}
          <span className="ws-text">Connected Exchange</span>
          <div className="ws-inline-select" style={{ minWidth: 200, height: 44 }}>
            <span className="ws-asset-logo ws-asset-logo-sm"><AssetLogo symbol={liveSource === 'hyperliquid' ? 'HYPE' : liveSource === 'binance' ? 'BNB' : 'USDT'} type="crypto" size={20} radius={10} /></span>
            <span className="ws-flex-1">{SOURCES[liveSource] || liveSource}</span><ChevronDown size={15} />
            <select value={liveSource} onChange={() => window.dispatchEvent(new CustomEvent('tt-navigate', { detail: { page: 'terminal' } }))}>
              {Object.entries(SOURCES).map(([k, l]) => <option key={k} value={k}>{l}{k !== liveSource ? ' · connect in Terminal' : ''}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="ws-grid ws-grid-4">
        {kpis.map(([label, val, tone, sub]) => (
          <div key={label} className="ws-kpi">
            <div className="ws-kpi-label" style={{ fontSize: 14 }}>{label}</div>
            <div className={`ws-kpi-value ws-kpi-mono ${tone == null ? '' : tone >= 0 ? 'ws-pos' : 'ws-neg'}`} style={{ fontSize: 26, fontWeight: 600 }}>{val}</div>
            {sub && <div className={`ws-kpi-sub ws-mono ${tone >= 0 ? 'ws-pos' : 'ws-neg'}`} style={{ whiteSpace: 'pre' }}>{sub}</div>}
          </div>
        ))}
      </div>

      <div className="ws-card ws-mt-16">
        <div className="ws-card-head">
          <div className="ws-row" style={{ gap: 12 }}><h3 className="ws-h3">Equity Curve</h3><span className="ws-mono ws-ink" style={{ fontSize: 16 }}>{fmtUsd(balance)}</span><span className={`ws-mono ${rangePnl >= 0 ? 'ws-pos' : 'ws-neg'}`}>{fmtPct(rangePct)}</span></div>
          <div className="ws-pills">{RANGES.map(([k, l]) => <button key={k} className={`ws-pill ws-pill-sm ${range === k ? 'active' : ''}`} style={{ height: 32, minWidth: 48, justifyContent: 'center' }} onClick={() => setRange(k)}>{l}</button>)}</div>
        </div>
        <div className="ws-card-body"><EquityChart points={chartPoints} base={base} /></div>
      </div>

      <div className="ws-tabs ws-tabs-lg ws-mt-16">
        <button className={`ws-tab ${tab === 'positions' ? 'active' : ''}`} onClick={() => setTab('positions')}>Positions</button>
        <button className={`ws-tab ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>History</button>
      </div>

      <div className="ws-table-wrap">
        {tab === 'positions' ? (
          <table className="ws-table ws-table-tall pf-table">
            <thead><tr><th>Coin</th><th>Side</th><th>Size</th><th>Pos. Value</th><th>Entry</th><th>Mark</th><th>Unreal. PnL</th><th>ROE %</th><th>Funding</th><th>Liq Dist</th><th>Leverage</th><th>TP / SL</th><th /></tr></thead>
            <tbody>
              {positions.length === 0 ? <tr><td colSpan={13}><div className="ws-empty"><div className="ws-empty-title">No open positions</div></div></td></tr> : positions.map((p, i) => {
                const sym = p.symbol.replace('USDT', '')
                return (
                  <tr key={i}>
                    <td><div className="ws-asset"><span className="ws-asset-logo ws-asset-logo-lg"><AssetLogo symbol={sym} type="crypto" size={36} radius={18} /></span><div className="ws-asset-stack"><span className="ws-asset-sym">{sym}</span><span className="ws-asset-name">{p.symbol}</span></div></div></td>
                    <td className={`ws-bold ${isLong(p.side) ? 'ws-pos' : 'ws-neg'}`}>{sideLabel(p.side)}</td>
                    <td className="ws-num ws-ink">{fmtQty(p.quantity, sym)}</td>
                    <td className="ws-num ws-ink">{fmtUsd(p.quantity * p.current_price)}</td>
                    <td className="ws-num ws-ink">{fmtUsd(p.entry_price, p.entry_price < 10 ? 4 : 2)}</td>
                    <td className="ws-num ws-ink">{fmtUsd(p.current_price, p.current_price < 10 ? 4 : 2)}</td>
                    <td className={`ws-num ${p.unrealized_pnl >= 0 ? 'ws-pos' : 'ws-neg'}`}>{fmtPnl(p.unrealized_pnl)}</td>
                    <td className={`ws-num ${p.unrealized_pnl_pct >= 0 ? 'ws-pos' : 'ws-neg'}`}>{fmtPct(p.unrealized_pnl_pct)}</td>
                    <td className={`ws-num ${(p.accumulated_funding || 0) >= 0 ? 'ws-pos' : 'ws-neg'}`}>{fmtPnl(p.accumulated_funding || 0)}</td>
                    <td className="ws-num ws-ink">{p.liq_distance_pct == null ? '—' : p.liq_distance_pct.toFixed(1) + '%'}</td>
                    <td className="ws-num ws-ink">{p.leverage || 1}x</td>
                    <td className="ws-num ws-ink"><div className="ws-col" style={{ gap: 2 }}><span>{p.take_profit ? fmtUsd(p.take_profit, 0) : '—'}</span><span>{p.stop_loss ? fmtUsd(p.stop_loss, 0) : '—'}</span></div></td>
                    <td className="ws-right"><button className="ws-iconbtn" onClick={() => window.dispatchEvent(new CustomEvent('tt-navigate', { detail: { page: 'terminal' } }))} title="Manage in Terminal"><MoreVertical size={18} /></button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : (
          <table className="ws-table ws-table-tall pf-table">
            <thead><tr><th>Coin</th><th>Side</th><th>Lev</th><th>Qty</th><th>Entry</th><th>Exit</th><th>Trade PnL</th><th>Funding</th><th>Net PnL</th><th>ROE %</th><th>Closed</th></tr></thead>
            <tbody>
              {trades.length === 0 ? <tr><td colSpan={11}><div className="ws-empty"><div className="ws-empty-title">No trade history yet</div></div></td></tr> : [...trades].reverse().map((t, i) => {
                const sym = t.symbol.replace('USDT', '')
                const net = t.total_pnl ?? t.realized_pnl
                return (
                  <tr key={i}>
                    <td><div className="ws-asset"><span className="ws-asset-logo"><AssetLogo symbol={sym} type="crypto" size={28} radius={14} /></span><span className="ws-asset-sym">{sym}</span></div></td>
                    <td className={`ws-bold ${isLong(t.side) ? 'ws-pos' : 'ws-neg'}`}>{sideLabel(t.side)}</td>
                    <td className="ws-num">{t.leverage}x</td>
                    <td className="ws-num">{fmtQty(t.quantity, sym)}</td>
                    <td className="ws-num">{fmtUsd(t.entry_price, t.entry_price < 10 ? 4 : 2)}</td>
                    <td className="ws-num">{fmtUsd(t.exit_price, t.exit_price < 10 ? 4 : 2)}</td>
                    <td className={`ws-num ${t.realized_pnl >= 0 ? 'ws-pos' : 'ws-neg'}`}>{fmtPnl(t.realized_pnl)}</td>
                    <td className={`ws-num ${(t.funding_pnl || 0) >= 0 ? 'ws-pos' : 'ws-neg'}`}>{fmtPnl(t.funding_pnl || 0)}</td>
                    <td className={`ws-num ${net >= 0 ? 'ws-pos' : 'ws-neg'}`}>{fmtPnl(net)}</td>
                    <td className={`ws-num ${t.pnl_pct >= 0 ? 'ws-pos' : 'ws-neg'}`}>{fmtPct(t.pnl_pct)}</td>
                    <td className="ws-muted">{timeAgo(t.closed_at)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {modal && <HlModal type={modal} onClose={() => setModal(null)} available={liveData?.balances?.withdrawable} onDone={load} token={token} />}
    </div>
  )
}
