import { useState, useEffect, useCallback, useMemo } from 'react'
import { API_BASE } from '../config'
import { useAuth } from '../context/AuthContext'
import DataState from './DataState'

/* ── Formatters ─────────────────────────────────────────────────── */
const fmt      = (n, dec = 2) => n == null ? '—' : Number(n).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })
const fmtUsd   = (n, dec = 2) => n == null ? '—' : Number(n).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: dec, maximumFractionDigits: dec })
const fmtPnl   = (n) => n == null ? '—' : (n >= 0 ? '+$' : '-$') + fmt(Math.abs(n))
const fmtPct   = (n) => n == null ? '—' : (n >= 0 ? '+' : '') + Number(n).toFixed(2) + '%'
const normSide = (s) => String(s || '').trim().toLowerCase()
const isLong   = (s) => { const n = normSide(s); return n === 'long' || n === 'buy' }
const sideLabel= (s) => { const n = normSide(s); if (n==='long'||n==='buy') return 'LONG'; if (n==='short'||n==='sell') return 'SHORT'; return String(s||'—').toUpperCase() }
const timeAgo  = (iso) => {
  if (!iso) return '—'
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60)    return `${s}s ago`
  if (s < 3600)  return `${Math.floor(s/60)}m ago`
  if (s < 86400) return `${Math.floor(s/3600)}h ago`
  return `${Math.floor(s/86400)}d ago`
}
function formatHold(mins) {
  if (mins == null) return '—'
  if (mins < 60) return `${mins.toFixed(0)}m`
  const h = mins / 60
  if (h < 24) return `${h.toFixed(1)}h`
  return `${(h / 24).toFixed(1)}d`
}

/* ── Equity Chart ───────────────────────────────────────────────── */
function EquityChart({ points, isUp }) {
  const W = 800, H = 180
  if (!points || points.length < 2) {
    return <div className="pfx-chart-empty">No chart data</div>
  }
  const xs = points.map(p => p.x ?? p.cum ?? 0)
  const ys = points.map(p => p.y ?? p.cum ?? 0)
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minY = Math.min(0, ...ys), maxY = Math.max(0, ...ys)
  const xScale = (x) => ((x - minX) / Math.max(maxX - minX, 1)) * W
  const yScale = (y) => H - ((y - minY) / Math.max(maxY - minY, 0.01)) * (H - 12) - 6
  const path = points.map((p, i) => {
    const x = xScale(p.x ?? i)
    const y = yScale(p.y ?? p.cum ?? 0)
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`
  }).join(' ')
  const lastX = xScale(points[points.length-1].x ?? points.length-1)
  const areaPath = `${path} L${lastX},${H} L0,${H} Z`
  const stroke = isUp ? '#00e87a' : '#f43f5e'
  const zeroY  = yScale(0)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="180" preserveAspectRatio="none" style={{ display: 'block' }}>
      <defs>
        <linearGradient id="pfx-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={stroke} stopOpacity="0.3" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Zero line */}
      <line x1="0" y1={zeroY} x2={W} y2={zeroY} stroke="rgba(255,255,255,0.08)" strokeWidth="1" strokeDasharray="4 4" />
      {/* Area fill */}
      <path d={areaPath} fill="url(#pfx-grad)" />
      {/* Line */}
      <path d={path} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

/* ── Send/Withdraw Modal ────────────────────────────────────────── */
function HlModal({ type, onClose, available, onDone, token }) {
  const [dest,    setDest]    = useState('')
  const [amount,  setAmount]  = useState('')
  const [busy,    setBusy]    = useState(false)
  const [msg,     setMsg]     = useState(null) // { ok, text }

  const submit = async () => {
    const amt = parseFloat(amount)
    if (!isFinite(amt) || amt <= 0) { setMsg({ ok: false, text: 'Enter a valid amount' }); return }
    if (type === 'send' && !dest.trim()) { setMsg({ ok: false, text: 'Destination address is required' }); return }
    setBusy(true); setMsg(null)
    try {
      const endpoint = type === 'withdraw' ? '/api/hl/withdraw' : '/api/hl/send'
      const body = type === 'withdraw' ? { amount: amt } : { destination: dest.trim(), amount: amt }
      const res  = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      })
      const d = await res.json()
      if (d.ok) {
        setMsg({ ok: true, text: type === 'withdraw' ? `$${amt} withdrawal sent` : `$${amt} USDC sent` })
        setTimeout(() => { onDone?.(); onClose() }, 1600)
      } else {
        setMsg({ ok: false, text: d.error || 'Transaction failed' })
      }
    } catch (e) {
      setMsg({ ok: false, text: e.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="pfx-modal-overlay" onClick={onClose}>
      <div className="pfx-modal" onClick={e => e.stopPropagation()}>
        <div className="pfx-modal-title">
          {type === 'withdraw' ? 'Withdraw to Arbitrum' : 'Send USDC'}
        </div>
        <div className="pfx-modal-sub">
          {type === 'withdraw'
            ? 'Withdraw USDC from Hyperliquid to Arbitrum One.'
            : 'Send USDC to another Hyperliquid address. Free and instant.'}
        </div>

        {type === 'send' && (
          <div className="pfx-modal-field">
            <div className="pfx-modal-label">DESTINATION ADDRESS</div>
            <input
              className="pfx-modal-input"
              value={dest}
              onChange={e => setDest(e.target.value)}
              placeholder="0x…"
              autoCorrect="off" autoCapitalize="off" spellCheck={false}
            />
          </div>
        )}

        <div className="pfx-modal-field">
          <div className="pfx-modal-label-row">
            <span className="pfx-modal-label">AMOUNT (USDC)</span>
            {available != null && (
              <button className="pfx-modal-max" onClick={() => setAmount(String(available))}>
                MAX ${fmt(available)}
              </button>
            )}
          </div>
          <input
            className="pfx-modal-input pfx-modal-input-lg"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            type="number" inputMode="decimal" placeholder="0.00"
            onKeyDown={e => { if (e.key === 'Enter') submit() }}
          />
        </div>

        {msg && (
          <div className={`pfx-modal-msg ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</div>
        )}

        <div className="pfx-modal-btns">
          <button className="pfx-modal-cancel" onClick={onClose}>Cancel</button>
          <button
            className={`pfx-modal-submit ${type === 'withdraw' ? 'amber' : 'green'}`}
            disabled={busy}
            onClick={submit}
          >
            {busy ? 'Processing…' : type === 'withdraw' ? 'Withdraw' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Stat Card ──────────────────────────────────────────────────── */
function StatCard({ label, value, tone }) {
  return (
    <div className="pfx-stat-card">
      <div className="pfx-stat-label">{label}</div>
      <div className="pfx-stat-val" style={tone ? { color: tone } : {}}>{value}</div>
    </div>
  )
}

/* ── Perf Row ───────────────────────────────────────────────────── */
function PerfRow({ label, value, tone }) {
  return (
    <div className="pfx-perf-row">
      <span className="pfx-perf-label">{label}</span>
      <span className="pfx-perf-val" style={tone ? { color: tone } : {}}>{value}</span>
    </div>
  )
}

/* ── Main ───────────────────────────────────────────────────────── */
const RANGES = [
  { key: '24h', label: '1D' },
  { key: '7d',  label: '1W' },
  { key: '30d', label: '1M' },
  { key: 'all', label: 'All' },
]

export default function PortfolioPage() {
  const { token } = useAuth()
  const [data,       setData]       = useState(null)
  const [liveData,   setLiveData]   = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [errorMsg,   setErrorMsg]   = useState(null)
  const [activeTab,  setActiveTab]  = useState('positions')
  const [range,      setRange]      = useState('all')
  const [modal,      setModal]      = useState(null)   // null | 'send' | 'withdraw'
  const [perfOpen,   setPerfOpen]   = useState(true)
  const [hoverPt,    setHoverPt]    = useState(null)

  const load = useCallback(() =>
    fetch(`${API_BASE}/api/portfolio`, token ? { headers: { Authorization: `Bearer ${token}` } } : {})
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(d => { setData(d); setErrorMsg(null); setLoading(false) })
      .catch(e => { setErrorMsg(e.message); setLoading(false) }), [token])

  const loadLive = useCallback(() => {
    if (!token) return
    fetch(`${API_BASE}/api/balances`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setLiveData(d) })
      .catch(() => {})
  }, [token])

  useEffect(() => { load(); const id = setInterval(load, 30_000); return () => clearInterval(id) }, [load])
  useEffect(() => { loadLive(); const id = setInterval(loadLive, 15_000); return () => clearInterval(id) }, [loadLive])

  /* ── Derived values ── */
  const balance        = data?.balance ?? 0
  const available      = data?.available ?? 0
  const marginUsed     = data?.margin_used ?? liveData?.balances?.total_margin_used ?? 0
  const isHL           = data?.source === 'hyperliquid'
  const realizedPnl    = isHL ? (data?.all_time_pnl ?? data?.realized_pnl ?? null) : (data?.realized_pnl ?? null)
  const unrealizedPnl  = data?.unrealized_pnl ?? null
  const netPnlNow      = data?.net_pnl_now ?? null
  const fundingClosed  = data?.funding_closed ?? 0
  const fundingOpen    = data?.funding_open ?? 0
  const totalFees      = data?.total_fees ?? 0
  const positions      = data?.positions || []
  const trades         = data?.trades || []
  const pnlWindows     = data?.pnl_windows || {}
  const mode           = data?.mode || 'PAPER'
  const source         = data?.source || 'paper'
  const liveSource     = liveData?.source
  const liveBalances   = liveData?.balances
  const isLiveConn     = liveSource && liveSource !== 'paper' && liveBalances
  const canHlTransfer  = isLiveConn && liveSource === 'hyperliquid'

  /* Performance */
  const tradeCount     = data?.trade_count ?? 0
  const winCount       = data?.win_count ?? 0
  const lossCount      = data?.loss_count ?? 0
  const breakevenCount = data?.breakeven_count ?? 0
  const winRate        = data?.win_rate ?? null
  const avgWin         = data?.avg_win ?? null
  const avgLoss        = data?.avg_loss ?? null
  const bestTrade      = data?.best_trade ?? null
  const worstTrade     = data?.worst_trade ?? null
  const sharpe         = data?.sharpe ?? null
  const sortino        = data?.sortino ?? null
  const maxDrawdown    = data?.max_drawdown ?? null
  const maxDrawdownPct = data?.max_drawdown_pct ?? null
  const expectancy     = data?.expectancy ?? null
  const profitFactor   = data?.profit_factor ?? null
  const avgHoldMin     = data?.avg_hold_minutes ?? null

  /* Chart */
  const rangeHistory = pnlWindows?.[range] || []
  const useHlChart   = isHL && rangeHistory.length > 0
  const chartPoints  = useMemo(() => {
    if (useHlChart) {
      return rangeHistory
        .filter(p => p?.timestamp != null && p?.pnl != null)
        .map(p => ({ x: Number(p.timestamp), y: Number(p.pnl) }))
    }
    let cum = 0
    const pts = trades.reduce((acc, t) => {
      cum += (t.total_pnl ?? t.realized_pnl ?? 0)
      acc.push({ x: acc.length, y: cum })
      return acc
    }, [])
    if (positions.length > 0) pts.push({ x: pts.length, y: cum + (unrealizedPnl || 0) })
    if (pts.length === 1) pts.unshift({ x: 0, y: 0 })
    return pts
  }, [useHlChart, rangeHistory, trades, positions, unrealizedPnl])

  const lastY   = chartPoints[chartPoints.length - 1]?.y ?? 0
  const firstY  = chartPoints[0]?.y ?? 0
  const rangePnl = lastY - firstY
  const isUp     = rangePnl >= 0

  /* hover */
  const hoveredPt = hoverPt?.idx != null ? chartPoints[hoverPt.idx] : null
  const displayPnl = hoveredPt ? hoveredPt.y : (realizedPnl ?? 0)

  /* ── Render ── */
  if (loading || errorMsg) {
    return (
      <div className="pfx-page">
        <DataState loading={loading} error={errorMsg} onRetry={load} minHeight={300} />
      </div>
    )
  }

  return (
    <div className="pfx-page">

      {/* ── Header ── */}
      <div className="pfx-page-header">
        <div>
          <div className="pfx-page-title">Portfolio</div>
          <div className="pfx-page-subtitle">
            <span className="pfx-live-dot" />
            {source === 'hyperliquid' ? `Hyperliquid · ${mode}` : 'Paper Trading'}
          </div>
        </div>
        <div className="pfx-header-actions">
          {canHlTransfer && (
            <>
              <button className="pfx-action-btn" onClick={() => setModal('send')}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
                Send
              </button>
              <button className="pfx-action-btn" onClick={() => setModal('withdraw')}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>
                Withdraw
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Live Banner ── */}
      {isLiveConn && (
        <div className="pfx-live-banner">
          <span className="pfx-live-banner-dot" />
          <span className="pfx-live-banner-src">
            {liveSource === 'hyperliquid' ? 'Hyperliquid' : 'Binance Futures'} · Live
          </span>
          <div className="pfx-live-banner-stats">
            {[
              ['Account Value',  liveBalances.account_value ?? liveBalances.total],
              ['Available',      liveBalances.withdrawable ?? liveBalances.available],
              ['Margin Used',    liveBalances.total_margin_used],
              ['Unrealized P&L', liveBalances.unrealized_pnl],
            ].filter(([, v]) => v != null).map(([label, val]) => (
              <div key={label} className="pfx-live-stat">
                <span className="pfx-live-stat-label">{label}</span>
                <span className={`pfx-live-stat-val ${label.includes('P&L') ? (val >= 0 ? 'up' : 'dn') : ''}`}>
                  {label.includes('P&L') && val >= 0 ? '+' : ''}${fmt(val)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Hero ── */}
      <div className="pfx-hero">
        <div className="pfx-equity-row">
          <div>
            <div className="pfx-equity-label">TOTAL EQUITY</div>
            <div className="pfx-equity-val">{fmtUsd(balance)}</div>
            <div className="pfx-equity-pnl">
              <span style={{ color: isUp ? '#00e87a' : '#f43f5e' }}>
                {isUp ? '+' : ''}{fmtUsd(rangePnl)}
              </span>
              <span className="pfx-equity-pct" style={{ color: isUp ? '#00e87a' : '#f43f5e' }}>
                ({isUp ? '+' : ''}{((rangePnl / Math.max(Math.abs(balance - rangePnl), 1)) * 100).toFixed(2)}%)
              </span>
              <span className="pfx-equity-range">{RANGES.find(r => r.key === range)?.label}</span>
            </div>
          </div>
          {/* Mini stats */}
          <div className="pfx-hero-mini">
            <div className="pfx-hero-mini-item">
              <span className="pfx-hero-mini-label">Available</span>
              <span className="pfx-hero-mini-val">{fmtUsd(available)}</span>
            </div>
            <div className="pfx-hero-mini-item">
              <span className="pfx-hero-mini-label">Margin</span>
              <span className="pfx-hero-mini-val">{fmtUsd(marginUsed)}</span>
            </div>
            <div className="pfx-hero-mini-item">
              <span className="pfx-hero-mini-label">Positions</span>
              <span className="pfx-hero-mini-val">{positions.length}</span>
            </div>
          </div>
        </div>

        {/* Chart */}
        <div className="pfx-chart-wrap"
          onMouseMove={e => {
            const rect = e.currentTarget.getBoundingClientRect()
            const pct  = (e.clientX - rect.left) / rect.width
            const idx  = Math.min(chartPoints.length - 1, Math.max(0, Math.round(pct * (chartPoints.length - 1))))
            setHoverPt({ idx })
          }}
          onMouseLeave={() => setHoverPt(null)}
        >
          <EquityChart points={chartPoints} isUp={isUp} />
        </div>

        {/* Range selector */}
        <div className="pfx-range-tabs">
          {RANGES.map(r => (
            <button
              key={r.key}
              className={`pfx-range-tab ${range === r.key ? 'active' : ''}`}
              onClick={() => setRange(r.key)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Stats Grid ── */}
      <div className="pfx-stats-grid">
        <StatCard label="Realized PnL"  value={fmtPnl(realizedPnl)}   tone={realizedPnl  != null ? (realizedPnl  >= 0 ? '#00e87a' : '#f43f5e') : undefined} />
        <StatCard label="Unrealized"    value={fmtPnl(unrealizedPnl)} tone={unrealizedPnl != null ? (unrealizedPnl >= 0 ? '#00e87a' : '#f43f5e') : undefined} />
        <StatCard label="Net PnL"       value={fmtPnl(netPnlNow)}     tone={netPnlNow     != null ? (netPnlNow     >= 0 ? '#00e87a' : '#f43f5e') : undefined} />
        <StatCard label="Total Fees"    value={totalFees ? '-' + fmtUsd(Math.abs(totalFees)) : '—'} tone={totalFees ? '#f43f5e' : undefined} />
        {fundingClosed !== 0 && <StatCard label="Funding (Closed)" value={fmtPnl(fundingClosed)} tone={fundingClosed >= 0 ? '#00e87a' : '#f43f5e'} />}
        {fundingOpen   !== 0 && <StatCard label="Funding (Open)"   value={fmtPnl(fundingOpen)}   tone={fundingOpen   >= 0 ? '#00e87a' : '#f43f5e'} />}
      </div>

      {/* ── Performance ── */}
      {isHL && tradeCount > 0 && (
        <div className="pfx-perf-section">
          <button className="pfx-perf-toggle" onClick={() => setPerfOpen(v => !v)}>
            <span className="pfx-perf-toggle-chevron">{perfOpen ? '▾' : '▸'}</span>
            <span>PERFORMANCE METRICS</span>
            <span className="pfx-perf-toggle-count">{tradeCount} trades</span>
          </button>
          {perfOpen && (
            <div className="pfx-perf-body">
              <div className="pfx-perf-col">
                <PerfRow label="Win / Loss / BE"  value={`${winCount}W · ${lossCount}L${breakevenCount ? ` · ${breakevenCount}BE` : ''}`} />
                {winRate      != null && <PerfRow label="Win Rate"      value={`${winRate.toFixed(1)}%`}    tone={winRate >= 50 ? '#00e87a' : '#f43f5e'} />}
                {profitFactor != null && <PerfRow label="Profit Factor" value={profitFactor.toFixed(2)}    tone={profitFactor >= 1 ? '#00e87a' : '#f43f5e'} />}
                {expectancy   != null && <PerfRow label="Expectancy"    value={fmtPnl(expectancy)}          tone={expectancy >= 0 ? '#00e87a' : '#f43f5e'} />}
                {avgHoldMin   != null && <PerfRow label="Avg Hold"      value={formatHold(avgHoldMin)} />}
              </div>
              <div className="pfx-perf-col">
                {avgWin      != null && <PerfRow label="Avg Win"        value={'+' + fmtUsd(avgWin)}   tone="#00e87a" />}
                {avgLoss     != null && <PerfRow label="Avg Loss"       value={fmtUsd(avgLoss)}         tone="#f43f5e" />}
                {bestTrade   != null && <PerfRow label="Best Trade"     value={'+' + fmtUsd(bestTrade?.realized_pnl || bestTrade)} tone="#00e87a" />}
                {worstTrade  != null && <PerfRow label="Worst Trade"    value={fmtUsd(worstTrade?.realized_pnl || worstTrade)} tone="#f43f5e" />}
                {sharpe      != null && <PerfRow label="Sharpe"         value={sharpe.toFixed(2)}       tone={sharpe >= 1 ? '#00e87a' : sharpe >= 0 ? undefined : '#f43f5e'} />}
                {sortino     != null && <PerfRow label="Sortino"        value={sortino.toFixed(2)}      tone={sortino >= 1 ? '#00e87a' : sortino >= 0 ? undefined : '#f43f5e'} />}
                {maxDrawdown != null && maxDrawdown > 0 && <PerfRow label="Max Drawdown" value={`-${fmtUsd(maxDrawdown)} (${maxDrawdownPct}%)`} tone="#f43f5e" />}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="pfx-tabs-bar">
        {[
          { key: 'positions', label: `Positions (${positions.length})` },
          { key: 'history',   label: `History (${trades.length})` },
        ].map(t => (
          <button
            key={t.key}
            className={`pfx-tab ${activeTab === t.key ? 'active' : ''}`}
            onClick={() => setActiveTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Table ── */}
      <div className="pfx-table-wrap">
        {activeTab === 'positions' && (
          <table className="pfx-table">
            <thead>
              <tr>
                <th>Coin</th>
                <th>Side</th>
                <th>Size</th>
                <th>Pos. Value</th>
                <th>Entry</th>
                <th>Mark</th>
                <th>Unreal. PnL</th>
                <th>ROE %</th>
                <th>Funding</th>
                <th>Liq Dist</th>
                <th>Leverage</th>
                <th>TP / SL</th>
              </tr>
            </thead>
            <tbody>
              {positions.length === 0 ? (
                <tr><td colSpan={12} className="pfx-td-empty">No open positions</td></tr>
              ) : positions.map((p, i) => {
                const ep   = p.entry_price
                const lev  = p.leverage || 1
                const tp   = p.take_profit || ''
                const sl   = p.stop_loss || ''
                const calcPnl = (target) => {
                  const t = parseFloat(target)
                  if (!t || !ep || !p.quantity) return null
                  const raw = isLong(p.side) ? (t - ep) * p.quantity : (ep - t) * p.quantity
                  const pct = ep ? (raw / (ep * p.quantity)) * lev * 100 : 0
                  return { usd: raw, pct }
                }
                const tpPnl = tp ? calcPnl(tp) : null
                const slPnl = sl ? calcPnl(sl) : null
                return (
                  <tr key={i} className="pfx-tr">
                    <td>
                      <div className="pfx-pair-col">
                        <span className="pfx-pair-sym">{p.symbol.replace('USDT','')}</span>
                        <span className={`pfx-lev-badge ${isLong(p.side) ? 'long' : 'short'}`}>{lev}x</span>
                      </div>
                    </td>
                    <td><span className={`pfx-side-badge ${isLong(p.side) ? 'long' : 'short'}`}>{sideLabel(p.side)}</span></td>
                    <td className="pfx-td-mono">{p.quantity?.toFixed(4)}</td>
                    <td className="pfx-td-mono">${fmt(p.quantity * p.current_price)}</td>
                    <td className="pfx-td-mono">${fmt(ep, 3)}</td>
                    <td className="pfx-td-mono">${fmt(p.current_price, 3)}</td>
                    <td><span className={p.unrealized_pnl >= 0 ? 'pfx-val-up' : 'pfx-val-dn'}>{fmtPnl(p.unrealized_pnl)}</span></td>
                    <td><span className={p.unrealized_pnl_pct >= 0 ? 'pfx-val-up' : 'pfx-val-dn'}>{fmtPct(p.unrealized_pnl_pct)}</span></td>
                    <td><span className={p.accumulated_funding >= 0 ? 'pfx-val-up' : 'pfx-val-dn'}>{fmtPnl(p.accumulated_funding)}</span></td>
                    <td>
                      {p.liq_distance_pct == null
                        ? <span className="pfx-td-dim">—</span>
                        : <span className={p.liq_distance_pct < 5 ? 'pfx-val-dn' : p.liq_distance_pct < 12 ? '' : 'pfx-val-up'}>
                            {fmtPct(p.liq_distance_pct)}
                          </span>
                      }
                    </td>
                    <td><span className={isLong(p.side) ? 'pfx-val-up' : 'pfx-val-dn'}>{lev}x</span></td>
                    <td>
                      <div className="pfx-tpsl">
                        <span className="pfx-td-dim">TP: {tp ? `$${fmt(tp, 3)}` : '—'}</span>
                        <span className="pfx-td-dim">SL: {sl ? `$${fmt(sl, 3)}` : '—'}</span>
                        {tpPnl && <span className="pfx-val-up">+${Math.abs(tpPnl.usd).toFixed(2)} (+{Math.abs(tpPnl.pct).toFixed(1)}%)</span>}
                        {slPnl && <span className="pfx-val-dn">-${Math.abs(slPnl.usd).toFixed(2)} (-{Math.abs(slPnl.pct).toFixed(1)}%)</span>}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        {activeTab === 'history' && (
          <table className="pfx-table">
            <thead>
              <tr>
                <th>Coin</th>
                <th>Side</th>
                <th>Lev</th>
                <th>Qty</th>
                <th>Entry</th>
                <th>Exit</th>
                <th>Trade PnL</th>
                <th>Funding</th>
                <th>Net PnL</th>
                <th>ROE %</th>
                <th>Closed</th>
              </tr>
            </thead>
            <tbody>
              {trades.length === 0 ? (
                <tr><td colSpan={11} className="pfx-td-empty">No trade history yet</td></tr>
              ) : [...trades].reverse().map((t, i) => (
                <tr key={i} className="pfx-tr">
                  <td><span className="pfx-pair-sym">{t.symbol.replace('USDT','')}</span></td>
                  <td><span className={`pfx-side-badge ${isLong(t.side) ? 'long' : 'short'}`}>{sideLabel(t.side)}</span></td>
                  <td className="pfx-td-mono">{t.leverage}x</td>
                  <td className="pfx-td-mono">{t.quantity?.toFixed(4)}</td>
                  <td className="pfx-td-mono">${fmt(t.entry_price, 3)}</td>
                  <td className="pfx-td-mono">${fmt(t.exit_price, 3)}</td>
                  <td><span className={t.realized_pnl >= 0 ? 'pfx-val-up' : 'pfx-val-dn'}>{fmtPnl(t.realized_pnl)}</span></td>
                  <td><span className={(t.funding_pnl||0) >= 0 ? 'pfx-val-up' : 'pfx-val-dn'}>{fmtPnl(t.funding_pnl||0)}</span></td>
                  <td><span className={(t.total_pnl??t.realized_pnl) >= 0 ? 'pfx-val-up' : 'pfx-val-dn'}>{fmtPnl(t.total_pnl??t.realized_pnl)}</span></td>
                  <td><span className={t.pnl_pct >= 0 ? 'pfx-val-up' : 'pfx-val-dn'}>{fmtPct(t.pnl_pct)}</span></td>
                  <td className="pfx-td-dim pfx-td-mono">{timeAgo(t.closed_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Modal ── */}
      {modal && (
        <HlModal
          type={modal}
          onClose={() => setModal(null)}
          available={liveData?.balances?.withdrawable}
          onDone={load}
          token={token}
        />
      )}
    </div>
  )
}
