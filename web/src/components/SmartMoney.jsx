import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { API_BASE } from '../config'
import { useWebSocket } from '../hooks/useWebSocket'

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
function AlertBanner({ alerts, onDismiss }) {
  if (!alerts.length) return null
  const a = alerts[0]
  const colors = { open: '#00e87a', close: '#f43f5e', change: '#f59e0b', error: '#f59e0b' }
  const icons  = { open: '▲', close: '▼', change: '↕', error: '⚠' }
  const color  = colors[a.type] || '#00e87a'
  return (
    <div style={{
      position: 'fixed', top: 64, left: 16, right: 16, zIndex: 9999,
      background: 'var(--bg-2)', border: `1px solid ${color}33`,
      borderLeft: `3px solid ${color}`, borderRadius: 12,
      padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10,
      boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
    }}>
      <span style={{ fontSize: 16, color }}>{icons[a.type]}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', marginBottom: 1 }}>{a.traderName}</div>
        <div style={{ fontSize: 11, color: '#888', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {a.message}
        </div>
      </div>
      {alerts.length > 1 && (
        <span style={{ fontSize: 10, fontWeight: 800, color: '#666', marginRight: 4 }}>+{alerts.length - 1}</span>
      )}
      <button onClick={() => onDismiss(a.id)}
        style={{ background: 'none', border: 'none', color: '#555', fontSize: 16, cursor: 'pointer', padding: 0, lineHeight: 1 }}>✕</button>
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
          padding: '14px 16px', background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.05)', borderRadius: 12,
          marginBottom: 8, cursor: onOpen ? 'pointer' : 'default',
        }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ fontSize: 10, color: '#888', fontWeight: 700, letterSpacing: 0.8, display: 'flex', alignItems: 'center', gap: 6 }}>
            WHALE SENTIMENT · GLOBAL · 24H
            {onOpen && <span style={{ color: '#555', fontSize: 11 }}>›</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 800, fontFamily: 'var(--font-mono)', color: hasData ? tone : '#555' }}>
              {hasData ? (s.score >= 0 ? '+' : '') + s.score.toFixed(2) : '—'}
            </span>
            <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: 0.6, color: hasData ? tone : '#555' }}>
              {hasData ? s.verdict : 'NO DATA'}
            </span>
          </div>
        </div>

        <div style={{ position: 'relative', height: 8, marginBottom: 8 }}>
          <div style={{
            position: 'absolute', inset: 0, borderRadius: 4,
            background: 'linear-gradient(to right, rgba(244,63,94,0.5) 0%, rgba(244,63,94,0.15) 35%, rgba(255,255,255,0.06) 50%, rgba(0,232,122,0.15) 65%, rgba(0,232,122,0.5) 100%)',
          }} />
          <div style={{ position: 'absolute', top: -2, bottom: -2, left: '50%', width: 1, background: 'rgba(255,255,255,0.18)', transform: 'translateX(-50%)' }} />
          {hasData && (
            <div style={{
              position: 'absolute', top: '50%', left: `${pct}%`,
              width: 12, height: 12, borderRadius: '50%',
              background: tone, boxShadow: `0 0 10px ${tone}99`,
              border: '2px solid #000', transform: 'translate(-50%, -50%)',
              transition: 'left 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
            }} />
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, color: '#555', fontWeight: 700, letterSpacing: 0.5, marginBottom: 8 }}>
          <span>BEARISH</span><span>NEUTRAL</span><span>BULLISH</span>
        </div>

        {hasData ? (
          <div style={{ fontSize: 11, color: '#fff', fontFamily: 'var(--font-mono)', opacity: 0.85 }}>
            <span style={{ color: '#00e87a' }}>BULL {fmtUSD(s.longVol)}</span>
            <span style={{ color: '#888' }}> ({s.longCount}) · </span>
            <span style={{ color: '#f43f5e' }}>BEAR {fmtUSD(s.shortVol)}</span>
            <span style={{ color: '#888' }}> ({s.shortCount})</span>
          </div>
        ) : (
          <div style={{ fontSize: 11, color: '#666', fontFamily: 'var(--font-mono)' }}>Loading… scanning top leaderboard whales</div>
        )}
      </div>

      {s.byCoin.length > 0 && (
        <div>
          <div style={{ fontSize: 10, color: '#888', fontWeight: 700, letterSpacing: 0.8, marginBottom: 6, paddingLeft: 2 }}>HOT COINS · LIVE</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
            {s.byCoin.map(c => {
              const cTotal   = c.long + c.short
              const cLongPct = cTotal > 0 ? Math.round(100 * c.long / cTotal) : 50
              const cTone    = c.longVol >= c.shortVol ? '#00e87a' : '#f43f5e'
              return (
                <div key={c.coin} style={{
                  background: 'rgba(255,255,255,0.03)', border: `1px solid ${cTone}30`,
                  borderRadius: 10, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 4,
                }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {(c.label || c.coin).split(' · ')[0]}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 800, fontFamily: 'var(--font-mono)', color: cTone }}>
                    {fmtUSD(c.totalVol)}
                  </div>
                  <div style={{ fontSize: 9, color: '#888', fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ color: '#00e87a' }}>↑{c.long}</span>
                    <span>·</span>
                    <span style={{ color: '#f43f5e' }}>↓{c.short}</span>
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
    return <div style={{ padding: '60px 20px', textAlign: 'center', color: '#666', fontSize: 13 }}>Loading…</div>
  }
  if (!positioning || !positioning.available) {
    return (
      <div style={{ padding: '60px 20px', textAlign: 'center', color: '#666', fontSize: 13, lineHeight: 1.6 }}>
        {positioning?.message || 'Position snapshot not ready yet — first scan takes ~5 minutes.'}
      </div>
    )
  }
  const p = positioning
  const verdictColor = p.verdict === 'BULLISH' ? '#00e87a' : p.verdict === 'BEARISH' ? '#f43f5e' : '#aaa'
  const ageMin = Math.max(0, Math.floor((Date.now() - p.ts_ms) / 60000))

  return (
    <>
      <div style={{ padding: '14px', borderRadius: 12, marginBottom: 14, background: 'rgba(255,255,255,0.03)', border: `1px solid ${verdictColor}30` }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ fontSize: 10, color: '#888', fontWeight: 700, letterSpacing: 0.8 }}>POSITION DISTRIBUTION</div>
          <div style={{ fontSize: 13, fontWeight: 900, color: verdictColor, letterSpacing: 0.6 }}>
            {p.verdict} {p.net_ratio >= 0 ? '+' : ''}{p.net_ratio.toFixed(2)}
          </div>
        </div>
        <div style={{ fontSize: 12, color: '#ddd', lineHeight: 1.55, marginBottom: 8 }}>
          {p.whales_with_positions} whales holding open positions —&nbsp;
          <span style={{ color: '#00e87a' }}>{fmtUSD(p.total_long_notional)} long</span> ·
          <span style={{ color: '#f43f5e' }}> {fmtUSD(p.total_short_notional)} short</span>
        </div>
        <div style={{ fontSize: 9, color: '#555', fontFamily: 'var(--font-mono)' }}>
          {p.whales_polled} wallets scanned · {ageMin}m ago
        </div>
      </div>

      <div style={{ fontSize: 10, color: '#888', fontWeight: 700, letterSpacing: 0.8, marginBottom: 8, paddingLeft: 2 }}>PER-COIN NET POSITION</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
        {(p.coins || []).slice(0, 20).map(c => {
          const tone    = c.dominant === 'LONG' ? '#00e87a' : c.dominant === 'SHORT' ? '#f43f5e' : '#aaa'
          const longPct = c.total_notional > 0 ? Math.round(100 * c.long_notional / c.total_notional) : 50
          const deltaTone = c.delta_net_notional > 0 ? '#00e87a' : c.delta_net_notional < 0 ? '#f43f5e' : '#666'
          const showDelta = p.has_delta && Math.abs(c.delta_net_notional) > 1000
          return (
            <div key={c.coin} style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${tone}30`, borderRadius: 10, padding: '10px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0, flex: 1 }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {(c.coin_label || c.coin).split(' · ')[0]}
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 800, color: tone, letterSpacing: 0.5, marginLeft: 'auto' }}>{c.dominant}</span>
                </div>
                <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 800, color: tone }}>
                  net {c.net_notional >= 0 ? '+' : ''}{fmtUSD(Math.abs(c.net_notional))}
                </div>
              </div>
              <div style={{ height: 5, borderRadius: 3, marginBottom: 6, background: 'rgba(244,63,94,0.25)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${longPct}%`, background: '#00e87a', transition: 'width 0.4s ease' }} />
              </div>
              <div style={{ fontSize: 10, color: '#888', fontFamily: 'var(--font-mono)', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <span><span style={{ color: '#00e87a' }}>{c.long_whales} long</span> / <span style={{ color: '#f43f5e' }}>{c.short_whales} short</span></span>
                <span>vol {fmtUSD(c.total_notional)}</span>
                {showDelta && (
                  <span style={{ color: deltaTone }}>
                    {c.delta_net_notional > 0 ? '▲' : '▼'} {c.delta_net_notional >= 0 ? '+' : '−'}{fmtUSD(Math.abs(c.delta_net_notional))} (5m)
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.18)', fontSize: 10, color: '#f59e0b', lineHeight: 1.5 }}>
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
        background: 'var(--bg-1)', border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 16, width: '100%', maxWidth: 640, maxHeight: '80vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#aaa', fontSize: 20, cursor: 'pointer', padding: 0, lineHeight: 1 }}>✕</button>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>Whale Analysis</div>
            <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>
              {tab === 'flow' ? 'Last 24h · what they did' : 'Now · what they hold'}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', padding: '0 20px', gap: 20, borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'var(--bg-1)' }}>
          {[{ id: 'flow', label: 'FLOW' }, { id: 'positioning', label: 'POSITIONS' }].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              background: 'transparent', border: 'none',
              borderBottom: `2px solid ${tab === t.id ? '#00e87a' : 'transparent'}`,
              color: tab === t.id ? '#fff' : '#666',
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
            <div style={{ padding: '60px 20px', textAlign: 'center', color: '#666', fontSize: 13 }}>Loading…</div>
          ) : !data || data.total_vol === 0 ? (
            <div style={{ padding: '60px 20px', textAlign: 'center', color: '#666', fontSize: 13 }}>
              No whale activity above threshold in the last 24h.
            </div>
          ) : (
            <>
              <div style={{ padding: '14px', borderRadius: 12, marginBottom: 14, background: 'rgba(255,255,255,0.03)', border: `1px solid ${verdictColor(data.verdict)}30` }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ fontSize: 10, color: '#888', fontWeight: 700, letterSpacing: 0.8 }}>OVERALL READING</div>
                  <div style={{ fontSize: 13, fontWeight: 900, color: verdictColor(data.verdict), letterSpacing: 0.6 }}>
                    {data.verdict} {data.score >= 0 ? '+' : ''}{data.score.toFixed(2)}
                  </div>
                </div>
                <div style={{ fontSize: 12, color: '#ddd', lineHeight: 1.55 }}>{data.headline}</div>
              </div>

              <div style={{ fontSize: 10, color: '#888', fontWeight: 700, letterSpacing: 0.8, marginBottom: 8, paddingLeft: 2 }}>PER-COIN BREAKDOWN</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
                {(data.coins || []).map(c => (
                  <div key={c.coin} style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${verdictColor(c.direction)}30`, borderRadius: 10, padding: '10px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: 14, fontWeight: 800, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {(c.coin_label || c.coin).split(' · ')[0]}
                        </span>
                        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.5, marginLeft: 'auto', color: verdictColor(c.direction) }}>{c.direction}</span>
                      </div>
                      <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: '#aaa' }}>conf {Math.round((c.confidence || 0) * 100)}%</div>
                    </div>
                    <div style={{ fontSize: 10, color: '#888', fontFamily: 'var(--font-mono)', display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
                      <span><span style={{ color: '#00e87a' }}>↑{c.bull_count}</span>/<span style={{ color: '#f43f5e' }}>↓{c.bear_count}</span></span>
                      <span>{c.unique_whales} whales</span>
                      <span>vol {fmtUSD(c.total_vol)}</span>
                    </div>
                    {c.insights?.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                        {c.insights.map((ins, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 11, color: '#ddd', lineHeight: 1.5 }}>
                            <span style={{ fontSize: 8, fontWeight: 800, padding: '2px 6px', borderRadius: 3, marginTop: 1, color: toneColor(ins.tone), background: `${toneColor(ins.tone)}18`, letterSpacing: 0.5, flexShrink: 0 }}>{ins.tag}</span>
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
                  <div style={{ fontSize: 10, color: '#888', fontWeight: 700, letterSpacing: 0.8, marginBottom: 8, paddingLeft: 2 }}>MOST ACTIVE WHALES</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 18 }}>
                    {data.top_whales.map(w => {
                      const bTone = w.bias === 'BULL' ? '#00e87a' : w.bias === 'BEAR' ? '#f43f5e' : '#aaa'
                      return (
                        <div key={w.address} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 8, padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.name}</div>
                            <div style={{ fontSize: 9, color: '#666', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                              {w.fills} trades · {((w.coin_labels || w.coins) || []).slice(0, 3).map(l => l.split(' · ')[0]).join(', ')}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 11, fontWeight: 800, fontFamily: 'var(--font-mono)', color: bTone }}>{fmtUSD(w.total_vol)}</div>
                            <div style={{ fontSize: 9, color: bTone, fontWeight: 800, letterSpacing: 0.5, marginTop: 1 }}>{w.bias}</div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}

              <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.18)', fontSize: 10, color: '#f59e0b', lineHeight: 1.5 }}>
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
function CopyModal({ trader, onClose, onSave }) {
  const [budget,      setBudget]      = useState('500')
  const [ratio,       setRatio]       = useState('1')
  const [autoClose,   setAutoClose]   = useState(true)
  const [copyEnabled, setCopyEnabled] = useState(false)

  if (!trader) return null
  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }} style={{
      position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div style={{ background: 'var(--bg-2)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, width: '100%', maxWidth: 440, padding: '24px' }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', marginBottom: 2 }}>Follow Trader</div>
        <div style={{ fontSize: 12, color: '#888', marginBottom: 20 }}>{trader.displayName} · {shortAddr(trader.address)}</div>

        {[
          { label: 'MAX BUDGET (USD)', value: budget, setter: setBudget, hint: 'Maximum total margin for this trader' },
          { label: 'SIZE RATIO (%)', value: ratio, setter: setRatio, hint: '% of trader position size · 1% → $50 for a $5K trade' },
        ].map(f => (
          <div key={f.label} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: '#aaa', fontWeight: 700, letterSpacing: 0.8, marginBottom: 6 }}>{f.label}</div>
            <input type="number" value={f.value} onChange={e => f.setter(e.target.value)} style={{
              width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 8, padding: '10px 12px', color: '#fff', fontSize: 14, fontWeight: 700,
              fontFamily: 'var(--font-mono)', boxSizing: 'border-box', outline: 'none',
            }} />
            <div style={{ fontSize: 11, color: '#555', marginTop: 4 }}>{f.hint}</div>
          </div>
        ))}

        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '4px 0', marginBottom: 14 }}>
          {[
            { label: 'Auto Close', sub: 'Close position when trader closes', val: autoClose, set: setAutoClose, color: '#00e87a' },
            { label: 'Auto Copy Trade', sub: 'Send order on position change', val: copyEnabled, set: setCopyEnabled, color: '#f59e0b' },
          ].map((tog, i) => (
            <div key={tog.label}>
              {i > 0 && <div style={{ height: 1, background: 'rgba(255,255,255,0.04)', margin: '0 14px' }} />}
              <div onClick={() => tog.set(v => !v)} style={{ display: 'flex', alignItems: 'center', padding: '12px 14px', cursor: 'pointer' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{tog.label}</div>
                  <div style={{ fontSize: 11, color: '#555', marginTop: 1 }}>{tog.sub}</div>
                </div>
                <div style={{ width: 44, height: 26, borderRadius: 13, position: 'relative', background: tog.val ? tog.color : 'rgba(255,255,255,0.1)', transition: 'background 0.2s' }}>
                  <div style={{ position: 'absolute', top: 3, left: tog.val ? 21 : 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
                </div>
              </div>
            </div>
          ))}
        </div>

        {copyEnabled && (
          <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 10, padding: '10px 12px', fontSize: 11, color: '#f59e0b', marginBottom: 14, lineHeight: 1.5 }}>
            ⚠ Auto copy trade sends orders on every position change. Test in Paper Mode first.
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '12px 0', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', color: '#aaa', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
          <button
            onClick={() => onSave({ budget: parseFloat(budget) || 500, ratio: parseFloat(ratio) || 1, autoClose, copyEnabled })}
            style={{ flex: 2, padding: '12px 0', borderRadius: 10, border: 'none', background: '#00e87a', color: '#000', fontSize: 13, fontWeight: 800, cursor: 'pointer', letterSpacing: 0.5 }}>
            START FOLLOWING
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Position Card ────────────────────────────────────────────────────────── */
function PositionCard({ pos }) {
  const isLong = pos.side === 'LONG'
  const pnlUp  = (pos.unrealized_pnl || 0) >= 0
  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '12px 14px', marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#fff' }}>{pos.coin}</span>
          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, letterSpacing: 0.5, background: isLong ? 'rgba(0,232,122,0.12)' : 'rgba(244,63,94,0.12)', color: isLong ? '#00e87a' : '#f43f5e' }}>
            {pos.side}{pos.leverage ? ` · ${pos.leverage}x` : ''}
          </span>
        </div>
        <span style={{ fontSize: 13, fontWeight: 800, fontFamily: 'var(--font-mono)', color: pnlUp ? '#00e87a' : '#f43f5e' }}>
          {pnlUp ? '+' : ''}{fmtUSD(pos.unrealized_pnl)}
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#aaa', fontFamily: 'var(--font-mono)' }}>
        <span>Entry ${fmtPrice(pos.entry_px)}</span>
        <span>Size {fmtUSD(pos.notional)}</span>
        {pos.liq_px && <span style={{ color: '#f43f5e' }}>Liq ${fmtPrice(pos.liq_px)}</span>}
      </div>
    </div>
  )
}

/* ── Trader Card (list item) ──────────────────────────────────────────────── */
function TraderCard({ trader, followed, followedSettings, onSelect, onFollow }) {
  const pnl    = trader.pnl_alltime
  const roi    = trader.roi_alltime
  const month  = trader.pnl_month
  const copying = followedSettings?.copyEnabled

  return (
    <div onClick={() => onSelect(trader)} style={{
      padding: '14px 24px', borderBottom: '1px solid rgba(255,255,255,0.04)',
      background: 'var(--bg-0)', cursor: 'pointer',
      transition: 'background 0.15s',
    }}
      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
      onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-0)'}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img src="https://coin-images.coingecko.com/coins/images/50882/large/hyperliquid.jpg?1729431300"
            alt="HL" style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={e => { e.target.style.display = 'none'; e.target.parentElement.innerHTML = '<span style="font-size:12px;font-weight:800;color:#555">◈</span>' }}
          />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{trader.displayName}</span>
            {followed && (
              <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.8, padding: '1px 5px', borderRadius: 3, flexShrink: 0, background: copying ? 'rgba(245,158,11,0.15)' : 'rgba(0,232,122,0.12)', color: copying ? '#f59e0b' : '#00e87a' }}>
                {copying ? 'COPYING' : '● LIVE'}
              </span>
            )}
          </div>
          <div style={{ fontSize: 10, color: '#555', fontFamily: 'var(--font-mono)', marginTop: 1 }}>
            {shortAddr(trader.address)} · {fmtUSD(trader.accountValue)}
          </div>
        </div>
        <button onClick={e => { e.stopPropagation(); onFollow(trader) }} style={{
          flexShrink: 0, padding: '6px 12px', borderRadius: 20, border: 'none', cursor: 'pointer',
          background: followed ? 'rgba(244,63,94,0.1)' : 'rgba(0,232,122,0.1)',
          color: followed ? '#f43f5e' : '#00e87a', fontSize: 12, fontWeight: 700,
        }}>
          {followed ? '✕' : '★ Follow'}
        </button>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {[
          { label: 'PnL', val: fmtUSD(pnl),   up: pnl >= 0   },
          { label: 'ROI', val: fmtPct(roi),    up: roi >= 0   },
          { label: '30d', val: fmtUSD(month),  up: month >= 0 },
        ].map(s => (
          <div key={s.label} style={{ flex: 1, background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '6px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 9, color: '#666', fontWeight: 600, marginBottom: 3 }}>{s.label}</div>
            <div style={{ fontSize: 12, fontWeight: 800, fontFamily: 'var(--font-mono)', color: s.up ? '#00e87a' : '#f43f5e' }}>{s.val}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Trader Detail ────────────────────────────────────────────────────────── */
function TraderDetail({ trader, followed, followedSettings, onBack, onFollow, copyLogs }) {
  const { token }   = useAuth()
  const [positions, setPositions] = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [tab,       setTab]       = useState('positions')
  const isFollowed = !!followed
  const isCopying  = followedSettings?.copyEnabled

  useEffect(() => {
    if (!token || !trader) return
    setLoading(true)
    const headers = { Authorization: `Bearer ${token}` }
    fetch(`${API}/positions/${trader.address}`, { headers })
      .then(r => r.json())
      .then(data => { setPositions(data); setLoading(false) })
      .catch(() => setLoading(false))
    const id = setInterval(() => {
      fetch(`${API}/positions/${trader.address}`, { headers })
        .then(r => r.json()).then(data => setPositions(data)).catch(() => {})
    }, 15000)
    return () => clearInterval(id)
  }, [trader, token])

  return (
    <div style={{ background: 'var(--bg-1)', borderLeft: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#aaa', fontSize: 20, cursor: 'pointer', padding: 0, lineHeight: 1 }}>‹</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>{trader.displayName}</span>
            {isFollowed && (
              <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 1, padding: '2px 6px', borderRadius: 4, background: isCopying ? 'rgba(245,158,11,0.15)' : 'rgba(0,232,122,0.12)', color: isCopying ? '#f59e0b' : '#00e87a' }}>
                {isCopying ? '● COPYING' : '● LIVE'}
              </span>
            )}
          </div>
          <div style={{ fontSize: 10, color: '#555', fontFamily: 'var(--font-mono)', marginTop: 1 }}>{shortAddr(trader.address)}</div>
        </div>
        <button onClick={() => onFollow(trader)} style={{
          padding: '7px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
          background: isFollowed ? 'rgba(244,63,94,0.1)' : 'rgba(0,232,122,0.1)',
          color: isFollowed ? '#f43f5e' : '#00e87a', fontSize: 12, fontWeight: 700,
        }}>
          {isFollowed ? '✕ Unfollow' : '★ Follow'}
        </button>
      </div>

      {/* Stats */}
      <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)', flexShrink: 0 }}>
        <div style={{ fontSize: 10, color: '#555', fontWeight: 700, letterSpacing: 1.5, marginBottom: 4 }}>ACCOUNT VALUE</div>
        <div style={{ fontSize: 24, fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#fff', marginBottom: 12 }}>{fmtUSD(trader.accountValue)}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
          {[
            { label: 'All-time PnL', val: fmtUSD(trader.pnl_alltime), up: trader.pnl_alltime >= 0 },
            { label: 'ROI',          val: fmtPct(trader.roi_alltime),  up: trader.roi_alltime >= 0 },
            { label: '30d PnL',      val: fmtUSD(trader.pnl_month),   up: trader.pnl_month >= 0 },
          ].map(s => (
            <div key={s.label} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10, padding: '8px 10px' }}>
              <div style={{ fontSize: 9, color: '#555', fontWeight: 600, marginBottom: 3 }}>{s.label}</div>
              <div style={{ fontSize: 13, fontWeight: 800, fontFamily: 'var(--font-mono)', color: s.up ? '#00e87a' : '#f43f5e' }}>{s.val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 20, padding: '0 20px', borderBottom: '1px solid rgba(255,255,255,0.05)', flexShrink: 0 }}>
        {[
          ['positions', `Positions${positions?.positions ? ` (${positions.positions.length})` : ''}`],
          ['activity',  `Copy Activity (${copyLogs.length})`],
        ].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            background: 'none', border: 'none', padding: '10px 0',
            borderBottom: tab === key ? '2px solid #00e87a' : '2px solid transparent',
            color: tab === key ? '#fff' : '#555', fontSize: 12, fontWeight: 700, cursor: 'pointer',
          }}>{label}</button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px' }}>
        {tab === 'positions' && (
          loading ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: '#555', fontSize: 13 }}>Loading positions…</div>
          ) : !positions?.positions?.length ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: '#555', fontSize: 13 }}>No open positions</div>
          ) : (
            positions.positions.map(pos => <PositionCard key={pos.coin} pos={pos} />)
          )
        )}

        {tab === 'activity' && (
          copyLogs.length === 0 ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: '#555', fontSize: 13 }}>No copy trade activity yet</div>
          ) : (
            copyLogs.map(row => {
              const statusColor = row.status === 'ok' ? '#00e87a' : row.status === 'error' ? '#f43f5e' : row.status === 'skip' ? '#888' : '#f59e0b'
              return (
                <div key={row.id} style={{ display: 'flex', gap: 10, padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', alignItems: 'flex-start' }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor, marginTop: 4, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, color: '#fff', fontWeight: 600 }}>{row.traderName} · {row.symbol} · {row.action === 'open' ? 'Open' : 'Close'}</div>
                    <div style={{ fontSize: 11, color: '#555', marginTop: 2, fontFamily: 'var(--font-mono)' }}>{row.detail}</div>
                  </div>
                  <div style={{ fontSize: 10, color: '#555', fontFamily: 'var(--font-mono)' }}>
                    {new Date(row.ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </div>
                </div>
              )
            })
          )
        )}

        <div style={{ fontSize: 9, color: '#444', textAlign: 'center', marginTop: 12, fontFamily: 'var(--font-mono)' }}>
          Updates every 15s · Hyperliquid Mainnet
        </div>
      </div>
    </div>
  )
}

/* ── Main Component ───────────────────────────────────────────────────────── */
export default function SmartMoney() {
  const { token }     = useAuth()
  const [traders,    setTraders]    = useState([])
  const [loading,    setLoading]    = useState(true)
  const [selected,   setSelected]   = useState(null)
  const [search,     setSearch]     = useState('')
  const [sortBy,     setSortBy]     = useState('accountValue')
  const [showSort,   setShowSort]   = useState(false)
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
    if (Notification.permission === 'granted') {
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

  const sortLabels = { accountValue: 'Account Value', pnl_alltime: 'All-time PnL', pnl_month: '30d PnL', roi_alltime: 'ROI' }
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

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', background: 'var(--bg-0)', position: 'relative' }}>
      <AlertBanner alerts={alerts} onDismiss={id => setAlerts(prev => prev.filter(a => a.id !== id))} />

      {/* Left panel — list */}
      <div style={{ flex: selected ? '0 0 420px' : '1 1 auto', display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: selected ? '1px solid rgba(255,255,255,0.06)' : 'none', minWidth: 0 }}>

        {/* Header */}
        <div style={{ padding: '18px 24px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ position: 'relative' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span onClick={() => setShowSort(v => !v)} style={{ fontSize: 18, fontWeight: 800, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                  Smart Money
                  <span style={{ fontSize: 10, color: '#555', transform: showSort ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', display: 'inline-block' }}>▼</span>
                </span>
              </div>
              <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>
                Hyperliquid · {traders.length} traders{followedCount > 0 && <span style={{ color: '#00e87a', marginLeft: 6 }}>● {followedCount} following</span>}
              </div>

              {showSort && (
                <>
                  <div onClick={() => setShowSort(false)} style={{ position: 'fixed', inset: 0, zIndex: 39 }} />
                  <div style={{ position: 'absolute', top: 48, left: 0, background: 'var(--bg-2)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 6, zIndex: 40, boxShadow: '0 10px 40px rgba(0,0,0,0.7)', minWidth: 170 }}>
                    {Object.entries(sortLabels).map(([key, label]) => (
                      <div key={key} onClick={() => { setSortBy(key); setShowSort(false) }} style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600, borderRadius: 8, cursor: 'pointer', color: sortBy === key ? '#00e87a' : '#aaa', background: sortBy === key ? 'rgba(0,232,122,0.08)' : 'transparent' }}>
                        {label}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Search */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '8px 12px', border: '1px solid rgba(255,255,255,0.06)', marginBottom: 12 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: '#555', flexShrink: 0 }}>
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search traders…" autoCorrect="off" autoCapitalize="off" spellCheck={false}
              style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: '#fff', fontSize: 13, fontFamily: 'var(--font-mono)' }} />
            {search && <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', padding: 0, fontSize: 13 }}>✕</button>}
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 20 }}>
            {[
              ['all',       `All (${traders.length})`,     false],
              ['following', `Following (${followedCount})`, false],
              ['live',      `Live (${recentFills.length})`, true],
            ].map(([key, label, isLive]) => (
              <button key={key} onClick={() => setActiveTab(key)} style={{
                background: 'none', border: 'none', padding: '8px 0',
                borderBottom: activeTab === key ? '2px solid #00e87a' : '2px solid transparent',
                color: activeTab === key ? '#fff' : '#555',
                fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
              }}>
                {isLive && (
                  <span style={{ width: 6, height: 6, borderRadius: 3, background: liveOn ? '#00e87a' : '#444', boxShadow: liveOn ? '0 0 6px #00e87a' : 'none' }} />
                )}
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {activeTab === 'live' ? (
            <>
              <div style={{ paddingTop: 16 }}>
                <WhaleCompass sentiment={sentiment} onOpen={() => setInsightsOpen(true)} />
              </div>
              {recentFills.length === 0 ? (
                <div style={{ padding: '40px 24px', textAlign: 'center', color: '#555', fontSize: 13, lineHeight: 1.6 }}>
                  {followedCount === 0
                    ? 'Personal feed empty. The sentiment above covers all tracked whales. Follow a trader to see their live trades here.'
                    : 'No live trades yet from followed traders. New orders appear instantly.'}
                </div>
              ) : (
                <div style={{ padding: '4px 24px 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {recentFills.map(f => {
                    const isLong  = (f.dir || '').toLowerCase().includes('long')
                    const isOpen  = (f.dir || '').toLowerCase().startsWith('open')
                    const tone    = isLong ? '#00e87a' : '#f43f5e'
                    const age     = Math.max(0, Math.floor((Date.now() - (f.ts || 0)) / 1000))
                    const ageStr  = age < 60 ? `${age}s` : age < 3600 ? `${Math.floor(age / 60)}m` : `${Math.floor(age / 3600)}h`
                    return (
                      <div key={`${f.address}:${f.oid}`} style={{
                        display: 'grid', gridTemplateColumns: '1fr auto', gap: 10,
                        background: 'rgba(255,255,255,0.03)',
                        border: `1px solid ${isOpen ? 'rgba(0,232,122,0.15)' : 'rgba(255,255,255,0.06)'}`,
                        borderLeft: `3px solid ${tone}`, borderRadius: 10, padding: '10px 12px',
                      }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</div>
                          <div style={{ fontSize: 11, color: tone, fontWeight: 700, marginTop: 2, fontFamily: 'var(--font-mono)' }}>
                            {f.dir || (isLong ? 'BUY' : 'SELL')} · {f.coin_label || f.coin}
                            {f.closed_pnl != null && (
                              <span style={{ color: f.closed_pnl >= 0 ? '#00e87a' : '#f43f5e', marginLeft: 6 }}>
                                {f.closed_pnl >= 0 ? '+' : ''}{fmtUSD(f.closed_pnl)}
                              </span>
                            )}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                          <div style={{ fontSize: 13, fontWeight: 800, color: tone }}>{fmtUSD(f.size_usd)}</div>
                          <div style={{ fontSize: 10, color: '#555', marginTop: 2 }}>@ {fmtPrice(f.px)} · {ageStr}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          ) : loading ? (
            <div style={{ padding: '80px 0', textAlign: 'center', color: '#555', fontSize: 13 }}>Loading…</div>
          ) : displayed.length === 0 ? (
            <div style={{ padding: '60px 20px', textAlign: 'center', color: '#555', fontSize: 13 }}>
              {activeTab === 'following' ? 'No traders followed yet' : 'No traders found'}
            </div>
          ) : (
            displayed.map(t => (
              <TraderCard
                key={t.address}
                trader={t}
                followed={!!followed[t.address]}
                followedSettings={followed[t.address] || null}
                onSelect={setSelected}
                onFollow={handleFollow}
              />
            ))
          )}
        </div>
      </div>

      {/* Right panel — detail */}
      {selected && (
        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <TraderDetail
            trader={selected}
            followed={!!followed[selected.address]}
            followedSettings={followed[selected.address] || null}
            onBack={() => setSelected(null)}
            onFollow={handleFollow}
            copyLogs={copyLogs}
          />
        </div>
      )}

      {/* Modals */}
      {copyModal && <CopyModal trader={copyModal} onClose={() => setCopyModal(null)} onSave={handleSaveCopy} />}
      <WhaleInsightsSheet open={insightsOpen} onClose={() => setInsightsOpen(false)} token={token} />
    </div>
  )
}
