import { workspaceTextColor } from '../utils/workspaceTheme'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { API_BASE } from '../config'
import { useWebSocket } from '../hooks/useWebSocket'
import { UserPlus, UserMinus, Copy, Search, ChevronDown, BarChart3, BarChart2, TrendingUp, Users } from 'lucide-react'
import AssetLogo from './AssetLogo'

const API   = `${API_BASE}/api/smart-money`
const HL_WS = 'wss://api.hyperliquid.xyz/ws'

function fmtUSD(n) {
  if (n == null || isNaN(n)) return '—'
  const abs = Math.abs(n), sign = n < 0 ? '-' : ''
  if (abs >= 1e9) return sign + '$' + (abs / 1e9).toFixed(2) + 'B'
  if (abs >= 1e6) return sign + '$' + (abs / 1e6).toFixed(2) + 'M'
  if (abs >= 1e3) return sign + '$' + (abs / 1e3).toFixed(1) + 'K'
  return sign + '$' + abs.toFixed(0)
}
function fmtPct(n) {
  if (n == null || isNaN(n)) return '—'
  return (n >= 0 ? '+' : '') + (n * 100).toFixed(1) + '%'
}
function fmtPrice(n) {
  if (n == null || isNaN(n)) return '—'
  if (n >= 1000) return n.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  if (n >= 1) return n.toFixed(3)
  return n.toFixed(5)
}
function shortAddr(addr) {
  if (!addr) return '—'
  return addr.slice(0, 6) + '…' + addr.slice(-4)
}

/* ── Trader WebSocket Tracker ────────────────────────────────────────────── */
function useTraderWatcher(followed, onAlert, onCopyTrade) {
  const wsMap    = useRef({})
  const prevPos  = useRef({})
  const pingMap  = useRef({})

  useEffect(() => {
    const addresses = Object.keys(followed)

    addresses.forEach(addr => {
      if (wsMap.current[addr]) return
      const traderName = followed[addr]?.displayName || shortAddr(addr)
      let retries = 0

      function connect() {
        if (retries >= 6) return
        const ws = new WebSocket(HL_WS)
        wsMap.current[addr] = ws

        ws.onopen = () => {
          retries = 0
          ws.send(JSON.stringify({ method: 'subscribe', subscription: { type: 'webData2', user: addr } }))
          pingMap.current[addr] = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ method: 'ping' }))
          }, 30000)
        }

        ws.onmessage = (e) => {
          try {
            const msg = JSON.parse(e.data)
            if (msg.channel !== 'webData2') return
            const curr = {}
            ;(msg.data?.clearinghouseState?.assetPositions || []).forEach(p => {
              const szi = parseFloat(p.position.szi || 0)
              if (szi === 0) return
              const entry = parseFloat(p.position.entryPx || 0)
              curr[p.position.coin] = { side: szi > 0 ? 'LONG' : 'SHORT', notional: Math.abs(szi) * entry }
            })
            const prev = prevPos.current[addr]
            if (!prev) { prevPos.current[addr] = curr; return }

            const settings = followed[addr]
            Object.keys(curr).forEach(coin => {
              if (!prev[coin]) {
                onAlert({ type: 'open', traderName, addr, message: `${coin} ${curr[coin].side} ${fmtUSD(curr[coin].notional)} açtı`, coin })
                if (settings?.copyEnabled && onCopyTrade)
                  onCopyTrade(addr, coin, curr[coin].side, curr[coin].notional, settings, 'open')
              } else {
                const chg = prev[coin].notional > 0 ? Math.abs(curr[coin].notional - prev[coin].notional) / prev[coin].notional : 0
                if (chg >= 0.15) {
                  const dir = curr[coin].notional > prev[coin].notional ? 'büyüttü' : 'küçülttü'
                  onAlert({ type: 'change', traderName, addr, message: `${coin} ${curr[coin].side} pozisyonunu ${dir}`, coin })
                }
              }
            })
            Object.keys(prev).forEach(coin => {
              if (!curr[coin]) {
                onAlert({ type: 'close', traderName, addr, message: `${coin} ${prev[coin].side} kapattı`, coin })
                if (settings?.copyEnabled && settings?.autoClose && onCopyTrade)
                  onCopyTrade(addr, coin, prev[coin].side, prev[coin].notional, settings, 'close')
              }
            })
            prevPos.current[addr] = curr
          } catch {}
        }

        ws.onclose = () => {
          clearInterval(pingMap.current[addr])
          if (followed[addr]) { retries++; setTimeout(connect, Math.min(2000 * Math.pow(2, retries - 1), 30000)) }
        }
        ws.onerror = () => ws.close()
      }
      connect()
    })

    Object.keys(wsMap.current).forEach(addr => {
      if (!followed[addr]) {
        wsMap.current[addr]?.close()
        delete wsMap.current[addr]
        delete prevPos.current[addr]
        clearInterval(pingMap.current[addr])
      }
    })
  }, [followed, onAlert, onCopyTrade])

  useEffect(() => () => {
    Object.values(wsMap.current).forEach(ws => ws?.close())
    Object.values(pingMap.current).forEach(id => clearInterval(id))
  }, [])
}

/* ── Alert Banner ─────────────────────────────────────────────────────────── */

/* ── Alert banner ─────────────────────────────────────────────────────────── */
function AlertBanner({ alerts, onDismiss }) {
  if (!alerts.length) return null
  const a = alerts[0]
  const cls = a.type === 'open' ? 'ws-note-ok' : a.type === 'close' ? 'ws-note-err' : 'ws-note-warn'
  return (
    <div className={`ws-note ${cls} smx-banner`}>
      <div className="ws-flex-1"><b>{a.traderName}</b> · {a.message}</div>
      {alerts.length > 1 && <span className="ws-small">+{alerts.length - 1}</span>}
      <button className="ws-iconbtn" onClick={() => onDismiss(a.id)}>✕</button>
    </div>
  )
}

/* ── Follow / copy modal ──────────────────────────────────────────────────── */
function CopyModal({ trader, onClose, onSave }) {
  const [budget, setBudget] = useState('500')
  const [ratio, setRatio] = useState('1')
  const [autoClose, setAutoClose] = useState(true)
  const [copyEnabled, setCopyEnabled] = useState(false)
  if (!trader) return null
  return (
    <div className="ws-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="ws-modal">
        <div className="ws-modal-head"><div><h3 className="ws-h3">Follow Trader</h3><div className="ws-muted ws-small ws-mono">{trader.displayName} · {shortAddr(trader.address)}</div></div></div>
        <div className="ws-modal-body ws-form">
          <div className="ws-field"><label>Max budget (USD)</label><input className="ws-input ws-mono" type="number" value={budget} onChange={e => setBudget(e.target.value)} /><span className="ws-muted ws-xs">Maximum total margin for this trader</span></div>
          <div className="ws-field"><label>Size ratio (%)</label><input className="ws-input ws-mono" type="number" value={ratio} onChange={e => setRatio(e.target.value)} /><span className="ws-muted ws-xs">% of the trader's position size · 1% → $50 for a $5K trade</span></div>
          <div className="ws-setting-row ws-setting-row-2"><div className="ws-setting-key">Auto close<small>Close the position when the trader closes</small></div><button type="button" className={`ws-toggle ${autoClose ? 'on' : ''}`} onClick={() => setAutoClose(v => !v)} /></div>
          <div className="ws-setting-row ws-setting-row-2"><div className="ws-setting-key">Auto copy trade<small>Send an order on every position change</small></div><button type="button" className={`ws-toggle ${copyEnabled ? 'on' : ''}`} onClick={() => setCopyEnabled(v => !v)} /></div>
          {copyEnabled && <div className="ws-note ws-note-warn">Auto copy trade sends orders on every position change. Test in Paper Mode first.</div>}
          <div className="ws-row" style={{ justifyContent: 'flex-end' }}>
            <button className="ws-btn" onClick={onClose}>Cancel</button>
            <button className="ws-btn ws-btn-primary" onClick={() => onSave({ budget: parseFloat(budget) || 500, ratio: parseFloat(ratio) || 1, autoClose, copyEnabled })}>Start Following</button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Trader detail (bottom card) ──────────────────────────────────────────── */
function TraderDetail({ trader, followed, followedSettings, onFollow, copyLogs, token }) {
  const [positions, setPositions] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('positions')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!token || !trader) return
    setLoading(true)
    const headers = { Authorization: `Bearer ${token}` }
    const pull = () => fetch(`${API}/positions/${trader.address}`, { headers }).then(r => r.json()).then(d => { setPositions(d); setLoading(false) }).catch(() => setLoading(false))
    pull()
    const id = setInterval(pull, 15000)
    return () => clearInterval(id)
  }, [trader, token])

  const list = positions?.positions || []
  const totalValue = list.reduce((s, p) => s + (p.notional || 0), 0)
  const unreal = list.reduce((s, p) => s + (p.unrealized_pnl || 0), 0)
  const winRate = trader.win_rate != null ? (trader.win_rate <= 1 ? trader.win_rate * 100 : trader.win_rate) : null
  const copyAddr = () => { navigator.clipboard?.writeText(trader.address).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }).catch(() => {}) }

  return (
    <div className="ws-card ws-mt-16">
      <div className="ws-card-head"><h3 className="ws-h3">Trader Details</h3>{followed && <span className={`ws-badge ${followedSettings?.copyEnabled ? 'ws-badge-warn' : 'ws-badge-pos'}`}>{followedSettings?.copyEnabled ? 'Copying' : 'Following'}</span>}</div>
      <div className="smx-detail">
        <div className="smx-detail-main">
          <div className="ws-row-between" style={{ alignItems: 'flex-start' }}>
            <div className="ws-row" style={{ gap: 14 }}>
              <span className="smx-avatar"><Users size={22} strokeWidth={1.6} /></span>
              <div>
                <div className="ws-strong" style={{ fontSize: 19 }}>{trader.displayName}</div>
                <div className="ws-row ws-mono ws-muted ws-small" style={{ gap: 6 }}>{shortAddr(trader.address)} <button className="ws-iconbtn" style={{ width: 22, height: 22 }} onClick={copyAddr} title="Copy address"><Copy size={12} /></button>{copied && <span className="ws-pos ws-xs">copied</span>}</div>
              </div>
            </div>
            <button className={`ws-btn ${followed ? '' : 'ws-btn-primary'}`} onClick={() => onFollow(trader)}>{followed ? <><UserMinus size={15} /> Unfollow</> : <><UserPlus size={15} /> Follow</>}</button>
          </div>
          <div className="smx-detail-stats">
            {[['Total PnL', fmtUSD(trader.pnl_alltime), trader.pnl_alltime >= 0], ['ROI', fmtPct(trader.roi_alltime), trader.roi_alltime >= 0], ['30d PnL', fmtUSD(trader.pnl_month), trader.pnl_month >= 0], ['Win Rate', winRate != null ? winRate.toFixed(1) + '%' : '—', null], ['Total Trades', trader.trades != null ? trader.trades : '—', null], ['Avg. Hold Time', trader.avg_hold != null ? trader.avg_hold : '—', null]].map(([k, v, up]) => (
              <div key={k}><span>{k}</span><b className={up == null ? 'ws-ink' : up ? 'ws-pos' : 'ws-neg'}>{v}</b></div>
            ))}
          </div>
        </div>
        <div className="smx-detail-side">
          <div className="ws-row-between"><span className="ws-text">Balance</span><b className="ws-mono ws-ink">{fmtUSD(trader.accountValue)}</b></div>
          <div className="ws-row-between"><span className="ws-text">Total Value</span><b className="ws-mono ws-ink">{fmtUSD(totalValue)}</b></div>
          <div className="ws-row-between"><span className="ws-text">Unrealized PnL</span><b className={`ws-mono ${unreal >= 0 ? 'ws-pos' : 'ws-neg'}`}>{unreal >= 0 ? '+' : ''}{fmtUSD(unreal)}</b></div>
        </div>
      </div>
      <div className="ws-tabs" style={{ padding: '0 18px' }}>
        <button className={`ws-tab ${tab === 'positions' ? 'active' : ''}`} onClick={() => setTab('positions')}>Current Positions ({list.length})</button>
        <button className={`ws-tab ${tab === 'activity' ? 'active' : ''}`} onClick={() => setTab('activity')}>Copy Activity ({copyLogs.length})</button>
      </div>
      <div className="ws-table-wrap">
        {tab === 'positions' ? (
          <table className="ws-table ws-table-dense">
            <thead><tr><th>Token</th><th className="ws-right">Amount</th><th className="ws-right">Entry Price</th><th className="ws-right">Current Price</th><th className="ws-right">Value (USD)</th><th className="ws-right">PnL</th><th className="ws-right">ROI</th><th className="ws-right">Share</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={8}><div className="ws-loading"><span className="ws-spinner" /> Loading positions…</div></td></tr>
              : list.length === 0 ? <tr><td colSpan={8} className="ws-muted">No open positions</td></tr>
              : list.map(p => {
                const cur = p.mark_px || p.current_px || (p.entry_px && p.size ? p.entry_px * (1 + (p.unrealized_pnl || 0) / (p.notional || 1)) : null)
                const roi = p.notional ? ((p.unrealized_pnl || 0) / p.notional) * 100 : null
                return (
                  <tr key={p.coin}>
                    <td><div className="ws-asset"><span className="ws-asset-logo ws-asset-logo-sm"><AssetLogo symbol={p.coin} type="crypto" size={20} radius={10} /></span><span className="ws-asset-sym">{p.coin}</span><span className={`ws-badge ws-badge-sm ${p.side === 'LONG' ? 'ws-badge-pos' : 'ws-badge-neg'}`}>{p.side}{p.leverage ? ` ${p.leverage}x` : ''}</span></div></td>
                    <td className="ws-right ws-num">{p.size != null ? Number(p.size).toLocaleString('en-US', { maximumFractionDigits: 4 }) : '—'}</td>
                    <td className="ws-right ws-num">${fmtPrice(p.entry_px)}</td>
                    <td className="ws-right ws-num">{cur ? '$' + fmtPrice(cur) : '—'}</td>
                    <td className="ws-right ws-num ws-ink">{fmtUSD(p.notional)}</td>
                    <td className={`ws-right ws-num ${(p.unrealized_pnl || 0) >= 0 ? 'ws-pos' : 'ws-neg'}`}>{(p.unrealized_pnl || 0) >= 0 ? '+' : ''}{fmtUSD(p.unrealized_pnl)}</td>
                    <td className={`ws-right ws-num ${(roi || 0) >= 0 ? 'ws-pos' : 'ws-neg'}`}>{roi != null ? (roi >= 0 ? '+' : '') + roi.toFixed(1) + '%' : '—'}</td>
                    <td className="ws-right ws-num">{totalValue ? ((p.notional || 0) / totalValue * 100).toFixed(1) + '%' : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : (
          <table className="ws-table ws-table-dense">
            <thead><tr><th>Time</th><th>Trader</th><th>Action</th><th>Symbol</th><th>Detail</th><th>Status</th></tr></thead>
            <tbody>
              {copyLogs.length === 0 ? <tr><td colSpan={6} className="ws-muted">No copy trade activity yet</td></tr> : copyLogs.map(row => (
                <tr key={row.id}><td className="ws-mono ws-muted">{new Date(row.ts).toLocaleTimeString('en-US', { hour12: false })}</td><td className="ws-ink">{row.traderName}</td><td>{row.action === 'open' ? 'Open' : 'Close'}</td><td className="ws-ink">{row.symbol}</td><td className="ws-mono ws-muted">{row.detail}</td><td><span className={`ws-badge ${row.status === 'ok' ? 'ws-badge-pos' : row.status === 'error' ? 'ws-badge-neg' : row.status === 'skip' ? '' : 'ws-badge-warn'}`}>{row.status}</span></td></tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

/* ── Whale Compass ────────────────────────────────────────────────────────── */
function WhaleCompass({ sentiment, onOpen }) {
  const s = sentiment || { score: 0, verdict: 'NEUTRAL', longCount: 0, shortCount: 0, longVol: 0, shortVol: 0, byCoin: [] }
  const hasData = s.longCount + s.shortCount > 0
  const tone = s.verdict === 'BULLISH' ? '#00e87a' : s.verdict === 'BEARISH' ? '#f43f5e' : '#aaa'
  const pct  = Math.max(0, Math.min(100, (s.score + 1) * 50))

  return (
    <div style={{ padding: '0 24px 16px' }}>
      <div
        onClick={onOpen}
        style={{
          padding: '14px 16px', background: "var(--ct-wash, rgba(255,255,255,0.02))",
          border: "1px solid var(--ct-line, rgba(255,255,255,0.05))", borderRadius: 12,
          marginBottom: 8, cursor: onOpen ? 'pointer' : 'default',
        }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ fontSize: 10, color: "var(--ct-subtle, #888)", fontWeight: 700, letterSpacing: 0.8, display: 'flex', alignItems: 'center', gap: 6 }}>
            WHALE SENTIMENT · GLOBAL · 24H
            {onOpen && <span style={{ color: "var(--ct-subtle, #555)", fontSize: 11 }}>›</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 800, fontFamily: 'var(--font-mono)', color: workspaceTextColor(hasData ? tone : "var(--ct-subtle, #555)") }}>
              {hasData ? (s.score >= 0 ? '+' : '') + s.score.toFixed(2) : '—'}
            </span>
            <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: 0.6, color: workspaceTextColor(hasData ? tone : "var(--ct-subtle, #555)") }}>
              {hasData ? s.verdict : 'NO DATA'}
            </span>
          </div>
        </div>

        <div style={{ position: 'relative', height: 8, marginBottom: 8 }}>
          <div style={{
            position: 'absolute', inset: 0, borderRadius: 4,
            background: 'linear-gradient(to right, rgba(244,63,94,0.5) 0%, rgba(244,63,94,0.15) 35%, rgba(255,255,255,0.06) 50%, rgba(0,232,122,0.15) 65%, rgba(0,232,122,0.5) 100%)',
          }} />
          <div style={{ position: 'absolute', top: -2, bottom: -2, left: '50%', width: 1, background: "var(--ct-wash, rgba(255,255,255,0.18))", transform: 'translateX(-50%)' }} />
          {hasData && (
            <div style={{
              position: 'absolute', top: '50%', left: `${pct}%`,
              width: 12, height: 12, borderRadius: '50%',
              background: tone, boxShadow: `0 0 10px ${tone}99`,
              border: "2px solid var(--ct-line-strong, #000)", transform: 'translate(-50%, -50%)',
              transition: 'left 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
            }} />
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, color: "var(--ct-subtle, #555)", fontWeight: 700, letterSpacing: 0.5, marginBottom: 8 }}>
          <span>BEARISH</span><span>NEUTRAL</span><span>BULLISH</span>
        </div>

        {hasData ? (
          <div style={{ fontSize: 11, color: "var(--ct-ink, #fff)", fontFamily: 'var(--font-mono)', opacity: 0.85 }}>
            <span style={{ color: "var(--ct-positive, #00e87a)" }}>BULL {fmtUSD(s.longVol)}</span>
            <span style={{ color: "var(--ct-subtle, #888)" }}> ({s.longCount}) · </span>
            <span style={{ color: "var(--ct-negative, #f43f5e)" }}>BEAR {fmtUSD(s.shortVol)}</span>
            <span style={{ color: "var(--ct-subtle, #888)" }}> ({s.shortCount})</span>
          </div>
        ) : (
          <div style={{ fontSize: 11, color: "var(--ct-subtle, #666)", fontFamily: 'var(--font-mono)' }}>Loading… scanning top leaderboard whales</div>
        )}
      </div>

      {s.byCoin.length > 0 && (
        <div>
          <div style={{ fontSize: 10, color: "var(--ct-subtle, #888)", fontWeight: 700, letterSpacing: 0.8, marginBottom: 6, paddingLeft: 2 }}>HOT COINS · LIVE</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
            {s.byCoin.map(c => {
              const cTotal   = c.long + c.short
              const cLongPct = cTotal > 0 ? Math.round(100 * c.long / cTotal) : 50
              const cTone    = c.longVol >= c.shortVol ? '#00e87a' : '#f43f5e'
              return (
                <div key={c.coin} style={{
                  background: "var(--ct-wash, rgba(255,255,255,0.03))", border: `1px solid ${cTone}30`,
                  borderRadius: 10, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 4,
                }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "var(--ct-ink, #fff)", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {(c.label || c.coin).split(' · ')[0]}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 800, fontFamily: 'var(--font-mono)', color: workspaceTextColor(cTone) }}>
                    {fmtUSD(c.totalVol)}
                  </div>
                  <div style={{ fontSize: 9, color: "var(--ct-subtle, #888)", fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ color: "var(--ct-positive, #00e87a)" }}>↑{c.long}</span>
                    <span>·</span>
                    <span style={{ color: "var(--ct-negative, #f43f5e)" }}>↓{c.short}</span>
                  </div>
                  <div style={{ height: 3, borderRadius: 2, background: 'rgba(244,63,94,0.25)', overflow: 'hidden', marginTop: 2 }}>
                    <div style={{ height: '100%', width: `${cLongPct}%`, background: '#00e87a', transition: 'width 0.4s ease' }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Positioning View ─────────────────────────────────────────────────────── */
function PositioningView({ positioning, loading }) {
  if (loading && !positioning) {
    return <div style={{ padding: '60px 20px', textAlign: 'center', color: "var(--ct-subtle, #666)", fontSize: 13 }}>Loading…</div>
  }
  if (!positioning || !positioning.available) {
    return (
      <div style={{ padding: '60px 20px', textAlign: 'center', color: "var(--ct-subtle, #666)", fontSize: 13, lineHeight: 1.6 }}>
        {positioning?.message || 'Position snapshot not ready yet — first scan takes ~5 minutes.'}
      </div>
    )
  }
  const p = positioning
  const verdictColor = p.verdict === 'BULLISH' ? '#00e87a' : p.verdict === 'BEARISH' ? '#f43f5e' : '#aaa'
  const ageMin = Math.max(0, Math.floor((Date.now() - p.ts_ms) / 60000))

  return (
    <>
      <div style={{ padding: '14px', borderRadius: 12, marginBottom: 14, background: "var(--ct-wash, rgba(255,255,255,0.03))", border: `1px solid ${verdictColor}30` }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ fontSize: 10, color: "var(--ct-subtle, #888)", fontWeight: 700, letterSpacing: 0.8 }}>POSITION DISTRIBUTION</div>
          <div style={{ fontSize: 13, fontWeight: 900, color: workspaceTextColor(verdictColor), letterSpacing: 0.6 }}>
            {p.verdict} {p.net_ratio >= 0 ? '+' : ''}{p.net_ratio.toFixed(2)}
          </div>
        </div>
        <div style={{ fontSize: 12, color: "var(--ct-ink, #ddd)", lineHeight: 1.55, marginBottom: 8 }}>
          {p.whales_with_positions} whales holding open positions —&nbsp;
          <span style={{ color: "var(--ct-positive, #00e87a)" }}>{fmtUSD(p.total_long_notional)} long</span> ·
          <span style={{ color: "var(--ct-negative, #f43f5e)" }}> {fmtUSD(p.total_short_notional)} short</span>
        </div>
        <div style={{ fontSize: 9, color: "var(--ct-subtle, #555)", fontFamily: 'var(--font-mono)' }}>
          {p.whales_polled} wallets scanned · {ageMin}m ago
        </div>
      </div>

      <div style={{ fontSize: 10, color: "var(--ct-subtle, #888)", fontWeight: 700, letterSpacing: 0.8, marginBottom: 8, paddingLeft: 2 }}>PER-COIN NET POSITION</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
        {(p.coins || []).slice(0, 20).map(c => {
          const tone    = c.dominant === 'LONG' ? '#00e87a' : c.dominant === 'SHORT' ? '#f43f5e' : '#aaa'
          const longPct = c.total_notional > 0 ? Math.round(100 * c.long_notional / c.total_notional) : 50
          const deltaTone = c.delta_net_notional > 0 ? '#00e87a' : c.delta_net_notional < 0 ? '#f43f5e' : '#666'
          const showDelta = p.has_delta && Math.abs(c.delta_net_notional) > 1000
          return (
            <div key={c.coin} style={{ background: "var(--ct-wash, rgba(255,255,255,0.03))", border: `1px solid ${tone}30`, borderRadius: 10, padding: '10px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0, flex: 1 }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: "var(--ct-ink, #fff)", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {(c.coin_label || c.coin).split(' · ')[0]}
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 800, color: workspaceTextColor(tone), letterSpacing: 0.5, marginLeft: 'auto' }}>{c.dominant}</span>
                </div>
                <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 800, color: workspaceTextColor(tone) }}>
                  net {c.net_notional >= 0 ? '+' : ''}{fmtUSD(Math.abs(c.net_notional))}
                </div>
              </div>
              <div style={{ height: 5, borderRadius: 3, marginBottom: 6, background: 'rgba(244,63,94,0.25)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${longPct}%`, background: '#00e87a', transition: 'width 0.4s ease' }} />
              </div>
              <div style={{ fontSize: 10, color: "var(--ct-subtle, #888)", fontFamily: 'var(--font-mono)', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <span><span style={{ color: "var(--ct-positive, #00e87a)" }}>{c.long_whales} long</span> / <span style={{ color: "var(--ct-negative, #f43f5e)" }}>{c.short_whales} short</span></span>
                <span>vol {fmtUSD(c.total_notional)}</span>
                {showDelta && (
                  <span style={{ color: workspaceTextColor(deltaTone) }}>
                    {c.delta_net_notional > 0 ? '▲' : '▼'} {c.delta_net_notional >= 0 ? '+' : '−'}{fmtUSD(Math.abs(c.delta_net_notional))} (5m)
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.18)', fontSize: 10, color: "var(--ct-warning, #f59e0b)", lineHeight: 1.5 }}>
        ⚠ Position snapshot refreshes every 5 min. Not investment advice.
      </div>
    </>
  )
}

/* ── Whale Insights Sheet (desktop modal) ─────────────────────────────────── */
function WhaleInsightsSheet({ open, onClose, token }) {
  const [data,        setData]        = useState(null)
  const [positioning, setPositioning] = useState(null)
  const [loading,     setLoading]     = useState(false)
  const [tab,         setTab]         = useState('flow')

  useEffect(() => {
    if (!open || !token) return
    let alive = true
    setLoading(true)
    Promise.all([
      fetch(`${API}/insights?window_sec=86400&min_usd=5000`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`${API}/positioning`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([d, p]) => {
      if (!alive) return
      setData(d); setPositioning(p); setLoading(false)
    })
    return () => { alive = false }
  }, [open, token])

  if (!open) return null

  const verdictColor = (v) => v === 'BULLISH' ? '#00e87a' : v === 'BEARISH' ? '#f43f5e' : '#aaa'
  const toneColor    = (t) => t === 'bull' ? '#00e87a' : t === 'bear' ? '#f43f5e' : '#f59e0b'

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }} style={{
      position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
    }}>
      <div style={{
        background: 'var(--bg-1)', border: "1px solid var(--ct-line, rgba(255,255,255,0.08))",
        borderRadius: 16, width: '100%', maxWidth: 640, maxHeight: '80vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', borderBottom: "1px solid var(--ct-line, rgba(255,255,255,0.06))" }}>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: "var(--ct-muted, #aaa)", fontSize: 20, cursor: 'pointer', padding: 0, lineHeight: 1 }}>✕</button>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "var(--ct-ink, #fff)" }}>Whale Analysis</div>
            <div style={{ fontSize: 10, color: "var(--ct-subtle, #666)", marginTop: 2 }}>
              {tab === 'flow' ? 'Last 24h · what they did' : 'Now · what they hold'}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', padding: '0 20px', gap: 20, borderBottom: "1px solid var(--ct-line, rgba(255,255,255,0.05))", background: 'var(--bg-1)' }}>
          {[{ id: 'flow', label: 'FLOW' }, { id: 'positioning', label: 'POSITIONS' }].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              background: 'transparent', border: 'none',
              borderBottom: `2px solid ${tab === t.id ? '#00e87a' : 'transparent'}`,
              color: workspaceTextColor(tab === t.id ? "var(--ct-ink, #fff)" : "var(--ct-subtle, #666)"),
              fontSize: 11, fontWeight: 800, letterSpacing: 0.6, cursor: 'pointer',
              padding: '10px 0',
            }}>{t.label}</button>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 24px' }}>
          {tab === 'positioning' ? (
            <PositioningView positioning={positioning} loading={loading} />
          ) : loading && !data ? (
            <div style={{ padding: '60px 20px', textAlign: 'center', color: "var(--ct-subtle, #666)", fontSize: 13 }}>Loading…</div>
          ) : !data || data.total_vol === 0 ? (
            <div style={{ padding: '60px 20px', textAlign: 'center', color: "var(--ct-subtle, #666)", fontSize: 13 }}>
              No whale activity above threshold in the last 24h.
            </div>
          ) : (
            <>
              <div style={{ padding: '14px', borderRadius: 12, marginBottom: 14, background: "var(--ct-wash, rgba(255,255,255,0.03))", border: `1px solid ${verdictColor(data.verdict)}30` }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ fontSize: 10, color: "var(--ct-subtle, #888)", fontWeight: 700, letterSpacing: 0.8 }}>OVERALL READING</div>
                  <div style={{ fontSize: 13, fontWeight: 900, color: workspaceTextColor(verdictColor(data.verdict)), letterSpacing: 0.6 }}>
                    {data.verdict} {data.score >= 0 ? '+' : ''}{data.score.toFixed(2)}
                  </div>
                </div>
                <div style={{ fontSize: 12, color: "var(--ct-ink, #ddd)", lineHeight: 1.55 }}>{data.headline}</div>
              </div>

              <div style={{ fontSize: 10, color: "var(--ct-subtle, #888)", fontWeight: 700, letterSpacing: 0.8, marginBottom: 8, paddingLeft: 2 }}>PER-COIN BREAKDOWN</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
                {(data.coins || []).map(c => (
                  <div key={c.coin} style={{ background: "var(--ct-wash, rgba(255,255,255,0.03))", border: `1px solid ${verdictColor(c.direction)}30`, borderRadius: 10, padding: '10px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: 14, fontWeight: 800, color: "var(--ct-ink, #fff)", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {(c.coin_label || c.coin).split(' · ')[0]}
                        </span>
                        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.5, marginLeft: 'auto', color: workspaceTextColor(verdictColor(c.direction)) }}>{c.direction}</span>
                      </div>
                      <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: "var(--ct-muted, #aaa)" }}>conf {Math.round((c.confidence || 0) * 100)}%</div>
                    </div>
                    <div style={{ fontSize: 10, color: "var(--ct-subtle, #888)", fontFamily: 'var(--font-mono)', display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
                      <span><span style={{ color: "var(--ct-positive, #00e87a)" }}>↑{c.bull_count}</span>/<span style={{ color: "var(--ct-negative, #f43f5e)" }}>↓{c.bear_count}</span></span>
                      <span>{c.unique_whales} whales</span>
                      <span>vol {fmtUSD(c.total_vol)}</span>
                    </div>
                    {c.insights?.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6, paddingTop: 8, borderTop: "1px solid var(--ct-line, rgba(255,255,255,0.05))" }}>
                        {c.insights.map((ins, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 11, color: "var(--ct-ink, #ddd)", lineHeight: 1.5 }}>
                            <span style={{ fontSize: 8, fontWeight: 800, padding: '2px 6px', borderRadius: 3, marginTop: 1, color: workspaceTextColor(toneColor(ins.tone)), background: `${toneColor(ins.tone)}18`, letterSpacing: 0.5, flexShrink: 0 }}>{ins.tag}</span>
                            <span>{ins.text}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {data.top_whales?.length > 0 && (
                <>
                  <div style={{ fontSize: 10, color: "var(--ct-subtle, #888)", fontWeight: 700, letterSpacing: 0.8, marginBottom: 8, paddingLeft: 2 }}>MOST ACTIVE WHALES</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 18 }}>
                    {data.top_whales.map(w => {
                      const bTone = w.bias === 'BULL' ? '#00e87a' : w.bias === 'BEAR' ? '#f43f5e' : '#aaa'
                      return (
                        <div key={w.address} style={{ background: "var(--ct-wash, rgba(255,255,255,0.03))", border: "1px solid var(--ct-line, rgba(255,255,255,0.05))", borderRadius: 8, padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ct-ink, #fff)", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.name}</div>
                            <div style={{ fontSize: 9, color: "var(--ct-subtle, #666)", fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                              {w.fills} trades · {((w.coin_labels || w.coins) || []).slice(0, 3).map(l => l.split(' · ')[0]).join(', ')}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 11, fontWeight: 800, fontFamily: 'var(--font-mono)', color: workspaceTextColor(bTone) }}>{fmtUSD(w.total_vol)}</div>
                            <div style={{ fontSize: 9, color: workspaceTextColor(bTone), fontWeight: 800, letterSpacing: 0.5, marginTop: 1 }}>{w.bias}</div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}

              <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.18)', fontSize: 10, color: "var(--ct-warning, #f59e0b)", lineHeight: 1.5 }}>
                ⚠ {data.disclaimer}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Copy Modal ───────────────────────────────────────────────────────────── */
/* ── Main Component ───────────────────────────────────────────────────────── */
export default function SmartMoney() {
  const { token }     = useAuth()
  const [traders,    setTraders]    = useState([])
  const [loading,    setLoading]    = useState(true)
  const [selected,   setSelected]   = useState(null)
  const [search,     setSearch]     = useState('')
  const [sortBy,     setSortBy]     = useState('accountValue')
  const [view,       setView]       = useState('flow')
  const [fillToken,  setFillToken]  = useState('ALL')
  const [fillMin,    setFillMin]    = useState(0)
  const [fillWindow, setFillWindow] = useState(86400000)
  const [activeTab,  setActiveTab]  = useState('all')
  const [copyModal,  setCopyModal]  = useState(null)
  const [insightsOpen, setInsightsOpen] = useState(false)
  const [alerts,     setAlerts]     = useState([])
  const [copyLogs,   setCopyLogs]   = useState([])
  const [recentFills, setRecentFills] = useState([])
  const [sentiment,  setSentiment]  = useState(null)
  const fillsByOidRef = useRef(new Set())
  const alertIdRef    = useRef(0)
  const copyEventGuardRef = useRef({})

  const [followed, setFollowed] = useState(() => {
    try { return JSON.parse(localStorage.getItem('sm_followed') || '{}') } catch { return {} }
  })

  // Fills ingestion (dedup)
  const ingestFills = useCallback((arr) => {
    if (!Array.isArray(arr) || !arr.length) return
    setRecentFills(prev => {
      const seen = fillsByOidRef.current
      const merged = [...arr.filter(f => f?.oid && !seen.has(`${f.address}:${f.oid}`)), ...prev]
      merged.forEach(f => seen.add(`${f.address}:${f.oid}`))
      merged.sort((a, b) => (b.ts || 0) - (a.ts || 0))
      return merged.slice(0, 50)
    })
  }, [])

  // Fills polling
  useEffect(() => {
    if (!token) return
    let alive = true, lastSince = 0
    async function pull() {
      try {
        const r = await fetch(`${API}/fills?limit=50${lastSince ? `&since=${lastSince}` : ''}`, { headers: { Authorization: `Bearer ${token}` } })
        if (!r.ok || !alive) return
        const data = await r.json()
        const fills = data?.fills || []
        if (fills.length) {
          ingestFills(fills)
          lastSince = fills.reduce((m, f) => Math.max(m, f.ts || 0), lastSince)
        }
      } catch {}
    }
    pull()
    const id = setInterval(pull, 15000)
    return () => { alive = false; clearInterval(id) }
  }, [token, ingestFills])

  // Sentiment polling
  useEffect(() => {
    if (!token) return
    let alive = true
    async function pull() {
      try {
        const r = await fetch(`${API}/sentiment?window_sec=86400&min_usd=5000`, { headers: { Authorization: `Bearer ${token}` } })
        if (!alive || !r.ok) return
        const d = await r.json()
        setSentiment({
          score:      d.score      || 0,
          verdict:    d.verdict    || 'NEUTRAL',
          longCount:  d.long_count  || 0,
          shortCount: d.short_count || 0,
          longVol:    d.long_vol    || 0,
          shortVol:   d.short_vol   || 0,
          byCoin: (d.by_coin || []).map(c => ({
            coin: c.coin, label: c.coin_label || c.coin, kind: c.coin_kind || 'perp',
            long: c.long || 0, short: c.short || 0,
            longVol: c.long_vol || 0, shortVol: c.short_vol || 0, totalVol: c.total_vol || 0,
          })),
        })
      } catch {}
    }
    pull()
    const id = setInterval(pull, 30000)
    return () => { alive = false; clearInterval(id) }
  }, [token])

  // WS — live whale fills
  const onWsMessage = useCallback((msg) => {
    if (!msg || msg.type !== 'smart_money_fill') return
    ingestFills([{
      address: msg.address, name: msg.name, coin: msg.coin, side: msg.side,
      dir: msg.dir, px: msg.px, sz: msg.sz, size_usd: msg.size_usd,
      oid: msg.oid, ts: msg.ts, closed_pnl: msg.closed_pnl,
    }])
  }, [ingestFills])
  useWebSocket(onWsMessage, [], { token })

  // Alerts
  const onAlert = useCallback((data) => {
    const id = ++alertIdRef.current
    const alert = { id, ...data, ts: Date.now() }
    setAlerts(prev => [alert, ...prev].slice(0, 3))
    if ('Notification' in window && Notification.permission === 'granted') {
      const icons = { open: '▲', close: '▼', change: '↕' }
      new Notification(`${icons[data.type] || '•'} ${data.traderName}`, {
        body: data.message, tag: `sm-${data.addr}-${data.coin}`, silent: false,
      })
    }
    setTimeout(() => setAlerts(prev => prev.filter(a => a.id !== id)), 10000)
  }, [])

  const pushCopyLog = useCallback((entry) => {
    const ts = Date.now()
    setCopyLogs(prev => [{ id: ts + Math.random(), ts, ...entry }, ...prev].slice(0, 20))
  }, [])

  const persistFollowed = useCallback(async (next) => {
    localStorage.setItem('sm_followed', JSON.stringify(next))
    if (!token) return
    try {
      await fetch(`${API_BASE}/api/smart-money/followed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ followed: next }),
      })
    } catch {}
  }, [token])

  const sendCopyOrder = useCallback(async (addr, coin, side, notional, settings, action) => {
    if (!token) return
    const safeCoin = String(coin || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
    if (!safeCoin) return
    const symbol   = safeCoin.endsWith('USDT') ? safeCoin : `${safeCoin}USDT`
    const rawSize  = notional * ((settings.ratio || 1) / 100)
    const size     = Number(Math.min(rawSize, settings.budget || 500).toFixed(2))
    if (size < 10) return

    const roundedNotional = Math.round(Number(notional) || 0)
    const eventKey = `${addr}:${action}:${symbol}:${side}:${roundedNotional}`
    const nowTs    = Date.now()
    const lastTs   = copyEventGuardRef.current[eventKey] || 0
    if (nowTs - lastTs < 12000) {
      pushCopyLog({ status: 'skip', traderName: followed[addr]?.displayName || shortAddr(addr), action, symbol, detail: 'Duplicate signal filtered' })
      return
    }
    copyEventGuardRef.current[eventKey] = nowTs
    Object.keys(copyEventGuardRef.current).forEach(k => {
      if (nowTs - copyEventGuardRef.current[k] > 120000) delete copyEventGuardRef.current[k]
    })

    const cmd = action === 'open' ? `${side === 'LONG' ? 'long' : 'short'} ${symbol} ${size} 1` : `close ${symbol}`
    pushCopyLog({ status: 'pending', traderName: followed[addr]?.displayName || shortAddr(addr), action, symbol, detail: cmd })

    try {
      const res = await fetch(`${API_BASE}/api/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ command: cmd }),
      })
      let payload = {}
      try { payload = await res.json() } catch {}
      if (!res.ok) throw new Error(payload?.detail || payload?.error || `HTTP ${res.status}`)
      if (payload?.ok === false) throw new Error(payload?.error || 'Command failed')
      const errRow = Array.isArray(payload?.results) ? payload.results.find(r => r?.style === 'error') : null
      if (errRow?.text) throw new Error(errRow.text)
      pushCopyLog({ status: 'ok', traderName: followed[addr]?.displayName || shortAddr(addr), action, symbol, detail: cmd })
    } catch (err) {
      delete copyEventGuardRef.current[eventKey]
      pushCopyLog({ status: 'error', traderName: followed[addr]?.displayName || shortAddr(addr), action, symbol, detail: err?.message || 'Unknown error' })
      onAlert({ type: 'error', traderName: followed[addr]?.displayName || shortAddr(addr), addr, message: `${symbol} copy order failed: ${err?.message}`, coin: symbol })
    }
  }, [token, onAlert, followed, pushCopyLog])

  useTraderWatcher(followed, onAlert, sendCopyOrder)

  // Leaderboard
  useEffect(() => {
    if (!token) return
    setLoading(true)
    fetch(`${API}/leaderboard`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setTraders(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [token])

  // Sync followed from backend
  useEffect(() => {
    if (!token) return
    fetch(`${API_BASE}/api/smart-money/followed`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => {
        if (data?.followed && typeof data.followed === 'object') {
          setFollowed(data.followed)
          localStorage.setItem('sm_followed', JSON.stringify(data.followed))
        }
      })
      .catch(() => {})
  }, [token])

  // Notification permission
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {})
    }
  }, [])

  const handleFollow = useCallback((trader) => {
    if (followed[trader.address]) {
      const next = { ...followed }
      delete next[trader.address]
      setFollowed(next)
      persistFollowed(next)
    } else {
      setCopyModal(trader)
    }
  }, [followed, persistFollowed])

  const handleSaveCopy = useCallback((settings) => {
    const next = { ...followed, [copyModal.address]: { ...copyModal, ...settings } }
    setFollowed(next)
    persistFollowed(next)
    setCopyModal(null)
  }, [followed, copyModal, persistFollowed])

  const followedCount = Object.keys(followed).length

  const displayed = traders
    .filter(t => {
      const q = search.toLowerCase()
      const matchSearch = !q || t.displayName.toLowerCase().includes(q) || t.address.toLowerCase().includes(q)
      const matchTab    = activeTab === 'all' || !!followed[t.address]
      return matchSearch && matchTab
    })
    .sort((a, b) => {
      if (sortBy === 'pnl_month')    return b.pnl_month - a.pnl_month
      if (sortBy === 'roi_alltime')  return b.roi_alltime - a.roi_alltime
      if (sortBy === 'accountValue') return b.accountValue - a.accountValue
      return b.pnl_alltime - a.pnl_alltime
    })
  const liveOn = (sentiment && (sentiment.longCount + sentiment.shortCount > 0)) || recentFills.length > 0
  const uniqueWhales = new Set(recentFills.map(f => f.address)).size
  const netFlow = (sentiment?.longVol || 0) - (sentiment?.shortVol || 0)
  const current = selected || displayed[0] || null
  const filteredFills = recentFills
    .filter(f => fillToken === 'ALL' || (f.coin_label || f.coin) === fillToken)
    .filter(f => (f.size_usd || 0) >= fillMin)
    .filter(f => !fillWindow || (Date.now() - (f.ts || 0)) <= fillWindow)
  const tokens = [...new Set(recentFills.map(f => f.coin_label || f.coin))].sort()
  const fmtTime = ts => ts ? new Date(ts).toTimeString().slice(0, 8) : '—'
  const clock = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' + new Date().toTimeString().slice(0, 8) + ' UTC'

  return (
    <div className="ws-page">
      <AlertBanner alerts={alerts} onDismiss={id => setAlerts(prev => prev.filter(a => a.id !== id))} />

      <div className="ws-page-head" style={{ marginBottom: 0 }}>
        <div className="ws-page-head-left"><h1 className="ws-title">Smart Money</h1></div>
        <div className="ws-page-head-right"><span className="ws-meta-stamp">{clock}</span></div>
      </div>
      <div className="ws-tabs ws-tabs-caps ws-mb-16">
        {[['flow', 'Flow'], ['positions', 'Positions']].map(([k, l]) => <button key={k} className={`ws-tab ${view === k ? 'active' : ''}`} onClick={() => setView(k)}>{l}</button>)}
      </div>

      {view === 'positions' ? (
        <div className="ws-card"><div className="ws-card-body"><button className="ws-btn ws-btn-primary" onClick={() => setInsightsOpen(true)}>Open whale positioning</button><p className="ws-muted ws-mt-8">Aggregated long / short positioning across tracked whales, with the sentiment breakdown.</p></div></div>
      ) : (
        <>
          <div className="ws-grid ws-grid-4">
            {[['Total Buy Flow (24h)', fmtUSD(sentiment?.longVol), true, `${sentiment?.longCount || 0} buys`, BarChart3], ['Total Sell Flow (24h)', fmtUSD(sentiment?.shortVol), false, `${sentiment?.shortCount || 0} sells`, BarChart2], ['Net Flow (24h)', (netFlow >= 0 ? '+' : '-') + fmtUSD(Math.abs(netFlow)), netFlow >= 0, sentiment?.verdict || '—', TrendingUp], ['Unique Whales (24h)', uniqueWhales || traders.length, null, `${followedCount} following`, Users]].map(([label, val, up, sub, Icon]) => (
              <div key={label} className="ws-kpi" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div><div className="ws-kpi-label" style={{ fontSize: 14 }}>{label}</div><div className={`ws-kpi-value ws-kpi-mono ${up == null ? '' : up ? 'ws-pos' : 'ws-neg'}`} style={{ fontSize: 26, fontWeight: 600 }}>{sentiment || label.startsWith('Unique') ? val : '—'}</div><div className={`ws-kpi-sub ${up == null ? 'ws-muted' : up ? 'ws-pos' : 'ws-neg'}`}>{sub}</div></div>
                <Icon size={24} strokeWidth={1.5} className={up == null ? 'ws-subtle' : up ? 'ws-pos' : 'ws-neg'} />
              </div>
            ))}
          </div>

          <div className="smx-grid ws-mt-16">
            <div className="ws-card">
              <div className="ws-card-head" style={{ flexWrap: 'wrap', gap: 8 }}>
                <h3 className="ws-h3">Recent Whale Fills</h3>
                <div className="ws-row">
                  <div className="ws-inline-select" style={{ height: 32, fontSize: 12 }}>{fillToken === 'ALL' ? 'All Tokens' : fillToken}<ChevronDown size={13} /><select value={fillToken} onChange={e => setFillToken(e.target.value)}><option value="ALL">All Tokens</option>{tokens.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                  <div className="ws-inline-select" style={{ height: 32, fontSize: 12 }}>{fillMin ? '$' + (fillMin / 1e6).toFixed(0) + 'M+' : 'Any size'}<ChevronDown size={13} /><select value={fillMin} onChange={e => setFillMin(Number(e.target.value))}>{[[0, 'Any size'], [100000, '$100K+'], [1000000, '$1M+'], [5000000, '$5M+']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
                  <div className="ws-inline-select" style={{ height: 32, fontSize: 12 }}>{fillWindow ? 'Last ' + fillWindow / 3600000 + 'h' : 'All time'}<ChevronDown size={13} /><select value={fillWindow} onChange={e => setFillWindow(Number(e.target.value))}>{[[3600000, 'Last 1h'], [14400000, 'Last 4h'], [86400000, 'Last 24h'], [0, 'All time']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
                </div>
              </div>
              <div className="ws-table-wrap">
                <table className="ws-table ws-table-dense">
                  <thead><tr><th>Time (UTC)</th><th>Token</th><th>Side</th><th className="ws-right">Amount</th><th className="ws-right">Value (USD)</th><th className="ws-right">Price</th><th>Wallet</th></tr></thead>
                  <tbody>
                    {filteredFills.length === 0 ? <tr><td colSpan={7}><div className="ws-empty" style={{ padding: '30px 16px' }}><div className="ws-empty-title">{liveOn ? 'No fills match these filters.' : 'Waiting for live whale fills…'}</div><div className="ws-empty-sub">Fills from tracked Hyperliquid whales stream in over the WS.</div></div></td></tr>
                    : filteredFills.slice(0, 12).map(f => {
                      const buy = /long|buy|open/i.test(f.dir || f.side || '') && !/close/i.test(f.dir || '')
                      return (
                        <tr key={`${f.address}:${f.oid}`} className="ws-table-click" onClick={() => { const t = traders.find(x => x.address === f.address); if (t) setSelected(t) }}>
                          <td className="ws-mono ws-text">{fmtTime(f.ts)}</td>
                          <td><div className="ws-asset"><span className="ws-asset-logo ws-asset-logo-sm"><AssetLogo symbol={String(f.coin || '').replace(/-PERP$/, '')} type="crypto" size={18} radius={9} /></span><span className="ws-asset-sym">{f.coin_label || f.coin}</span></div></td>
                          <td className={`ws-bold ${buy ? 'ws-pos' : 'ws-neg'}`}>{buy ? 'Buy' : 'Sell'}</td>
                          <td className="ws-right ws-num">{f.sz != null ? Number(f.sz).toLocaleString('en-US', { maximumFractionDigits: 2 }) : '—'}</td>
                          <td className="ws-right ws-num ws-ink">{'$' + Math.round(f.size_usd || 0).toLocaleString('en-US')}</td>
                          <td className="ws-right ws-num">${fmtPrice(f.px)}</td>
                          <td className="ws-mono ws-muted">{shortAddr(f.address)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="ws-card smx-traders">
              <div className="ws-card-head" style={{ flexWrap: 'wrap', gap: 8 }}>
                <h3 className="ws-h3">Tracked Traders</h3>
                <div className="ws-row">
                  <div className="ws-search" style={{ width: 170 }}><Search size={13} /><input className="ws-input ws-input-sm" placeholder="Search traders…" value={search} onChange={e => setSearch(e.target.value)} /></div>
                  <div className="ws-seg ws-seg-sm">{[['all', 'All'], ['following', `Following (${followedCount})`]].map(([k, l]) => <button key={k} className={activeTab === k ? 'active' : ''} onClick={() => setActiveTab(k)}>{l}</button>)}</div>
                </div>
              </div>
              <div className="ws-table-wrap">
                <table className="ws-table ws-table-dense">
                  <thead><tr><th>#</th><th>Trader</th><th>Wallet Address</th><th className="ws-right"><span className="ws-th-sort" onClick={() => setSortBy('pnl_alltime')}>PnL (All)</span></th><th className="ws-right"><span className="ws-th-sort" onClick={() => setSortBy('roi_alltime')}>ROI</span></th><th className="ws-right"><span className="ws-th-sort" onClick={() => setSortBy('pnl_month')}>30d PnL</span></th><th className="ws-right">Follow</th></tr></thead>
                  <tbody>
                    {loading ? <tr><td colSpan={7}><div className="ws-loading"><span className="ws-spinner" /> Loading leaderboard…</div></td></tr>
                    : displayed.length === 0 ? <tr><td colSpan={7} className="ws-muted">{activeTab === 'following' ? 'No traders followed yet' : 'No traders found'}</td></tr>
                    : displayed.slice(0, 10).map((t, i) => {
                      const isF = !!followed[t.address]
                      return (
                        <tr key={t.address} className={`ws-table-click ${current?.address === t.address ? 'lsr-row-active' : ''}`} onClick={() => setSelected(t)}>
                          <td className="ws-muted">{i + 1}</td>
                          <td className="ws-ink ws-bold">{t.displayName}</td>
                          <td className="ws-mono ws-text">{shortAddr(t.address)}</td>
                          <td className={`ws-right ws-num ${t.pnl_alltime >= 0 ? 'ws-pos' : 'ws-neg'}`}>{fmtUSD(t.pnl_alltime)}</td>
                          <td className={`ws-right ws-num ${t.roi_alltime >= 0 ? 'ws-pos' : 'ws-neg'}`}>{fmtPct(t.roi_alltime)}</td>
                          <td className={`ws-right ws-num ${t.pnl_month >= 0 ? 'ws-pos' : 'ws-neg'}`}>{fmtUSD(t.pnl_month)}</td>
                          <td className="ws-right"><button className={`ws-btn ws-btn-xs ${isF ? 'ws-btn-primary' : ''}`} onClick={e => { e.stopPropagation(); handleFollow(t) }}>{isF ? <><UserMinus size={12} /> Following</> : <><UserPlus size={12} /> Follow</>}</button></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {current && <TraderDetail trader={current} followed={!!followed[current.address]} followedSettings={followed[current.address] || null} onFollow={handleFollow} copyLogs={copyLogs} token={token} />}
        </>
      )}

      {copyModal && <CopyModal trader={copyModal} onClose={() => setCopyModal(null)} onSave={handleSaveCopy} />}
      <WhaleInsightsSheet open={insightsOpen} onClose={() => setInsightsOpen(false)} token={token} />
    </div>
  )
}
