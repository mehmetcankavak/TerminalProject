import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../../context/AuthContext'
import { haptic } from '../../capacitor'
import { API_BASE } from '../../config'
import { useWebSocket } from '../../hooks/useWebSocket'

const API   = `${API_BASE}/api/smart-money`
const HL_WS = 'wss://api.hyperliquid.xyz/ws'

// ─── Formatters ──────────────────────────────────────────────────────────────
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

// ─── WebSocket Tracker ───────────────────────────────────────────────────────
function useTraderWatcher(followed, onAlert) {
  const wsMap   = useRef({})
  const prevPos = useRef({})
  const pingMap = useRef({})

  useEffect(() => {
    const addresses = Object.keys(followed)

    addresses.forEach(addr => {
      if (wsMap.current[addr]) return
      const name = followed[addr]?.displayName || shortAddr(addr)
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

            Object.keys(curr).forEach(coin => {
              if (!prev[coin]) onAlert({ type: 'open', name, addr, coin, notional: curr[coin].notional, side: curr[coin].side })
              else {
                const chg = prev[coin].notional > 0 ? Math.abs(curr[coin].notional - prev[coin].notional) / prev[coin].notional : 0
                if (chg >= 0.15) onAlert({ type: 'change', name, addr, coin, notional: curr[coin].notional, side: curr[coin].side })
              }
            })
            Object.keys(prev).forEach(coin => {
              if (!curr[coin]) onAlert({ type: 'close', name, addr, coin, notional: prev[coin].notional, side: prev[coin].side })
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
  }, [followed, onAlert])

  useEffect(() => () => {
    Object.values(wsMap.current).forEach(ws => ws?.close())
    Object.values(pingMap.current).forEach(id => clearInterval(id))
  }, [])
}

// ─── Alert Toast ─────────────────────────────────────────────────────────────
function AlertBanner({ alerts, onDismiss }) {
  if (!alerts.length) return null
  const a = alerts[0]
  const colors = { open: '#00d992', close: '#f43f5e', change: '#f59e0b', error: '#f59e0b' }
  const icons  = { open: '▲', close: '▼', change: '↕', error: '⚠' }
  const color  = colors[a.type] || '#00d992'
  return (
    <div style={{
      position: 'fixed', top: 'calc(var(--safe-top, 44px) + 52px)', left: 16, right: 16,
      zIndex: 9999, background: 'var(--bg-2)', border: `1px solid ${color}33`,
      borderLeft: `3px solid ${color}`, borderRadius: 12,
      padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10,
      boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
    }}>
      <span style={{ fontSize: 16, color }}>{icons[a.type]}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', marginBottom: 1 }}>{a.name}</div>
        <div style={{ fontSize: 11, color: '#888', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {a.coin} {a.side} · {fmtUSD(a.notional)} {a.type === 'open' ? 'açıldı' : a.type === 'close' ? 'kapandı' : 'değişti'}
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

// ─── Whale Compass (sentiment gauge + hot coins) ─────────────────────────────
// Derives a single directional signal + per-coin breakdown from the user's
// recently-tracked smart-money fills. Only OPEN events count toward sentiment
// — closes are realisation, not new directional intent.
// Below this size we treat a trade as scalper/bot noise, not whale conviction.
// Real whales (>$1M accounts) typically open positions at $50K-$5M notional;
// anything under $50K is almost always a scalp/hedge/dust trade, not a signal.
const SENTIMENT_MIN_USD = 50_000

function computeWhaleSentiment(fills) {
  if (!Array.isArray(fills) || fills.length === 0) {
    return { score: 0, verdict: 'NEUTRAL', longCount: 0, shortCount: 0, longVol: 0, shortVol: 0, byCoin: [] }
  }
  let longCount = 0, shortCount = 0, longVol = 0, shortVol = 0
  const byCoinMap = new Map()  // coin → { long, short, longVol, shortVol, totalVol }
  for (const f of fills) {
    const dir = String(f.dir || '').toLowerCase()
    if (!dir.startsWith('open')) continue  // closes don't count
    const usd = Number(f.size_usd) || 0
    if (usd < SENTIMENT_MIN_USD) continue   // ignore scalp/bot noise
    const isLong = dir.includes('long')
    if (isLong) { longCount++;  longVol  += usd }
    else        { shortCount++; shortVol += usd }
    const coin = f.coin || '?'
    if (!byCoinMap.has(coin)) byCoinMap.set(coin, { long: 0, short: 0, longVol: 0, shortVol: 0, totalVol: 0 })
    const c = byCoinMap.get(coin)
    if (isLong) { c.long++;  c.longVol  += usd }
    else        { c.short++; c.shortVol += usd }
    c.totalVol += usd
  }
  const total = longVol + shortVol
  const score = total > 0 ? (longVol - shortVol) / total : 0
  const verdict = score >  0.3 ? 'BULLISH'
                : score < -0.3 ? 'BEARISH'
                :                'NEUTRAL'
  const byCoin = Array.from(byCoinMap, ([coin, v]) => ({ coin, ...v }))
                      .sort((a, b) => b.totalVol - a.totalVol)
                      .slice(0, 4)
  return { score, verdict, longCount, shortCount, longVol, shortVol, byCoin }
}

function WhaleCompass({ sentiment, onOpen }) {
  // Sentiment now comes from /api/smart-money/sentiment which aggregates ALL
  // tracked whales (leaderboard top-50 + every user-followed wallet) — not
  // just the current user's follows. This gives a meaningful global signal
  // even for users with zero follows.
  const s = sentiment || {
    score: 0, verdict: 'NEUTRAL', longCount: 0, shortCount: 0,
    longVol: 0, shortVol: 0, byCoin: [],
  }
  const hasData = s.longCount + s.shortCount > 0
  const hasNoiseOnly = false  // server-side filter handles this now
  const tone = s.verdict === 'BULLISH' ? '#00d992'
             : s.verdict === 'BEARISH' ? '#f43f5e'
             :                            '#aaa'
  const pct = Math.max(0, Math.min(100, (s.score + 1) * 50))

  return (
    <div style={{ padding: '0 16px 12px' }}>
      {/* Sentiment gauge — same visual language as Big Transfers */}
      <div
        onClick={() => { if (onOpen) { haptic('light'); onOpen() } }}
        style={{
          padding: '12px 14px',
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.05)',
          borderRadius: 12,
          marginBottom: 8,
          cursor: onOpen ? 'pointer' : 'default',
        }}>
        <div style={{
          display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
          marginBottom: 10,
        }}>
          <div style={{ fontSize: 10, color: '#888', fontWeight: 700, letterSpacing: 0.8, display: 'flex', alignItems: 'center', gap: 6 }}>
            WHALE SENTIMENT · GLOBAL · 24S
            {onOpen && <span style={{ color: '#555', fontSize: 11 }}>›</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{
              fontSize: 12, fontWeight: 800, fontFamily: 'var(--mono)',
              color: hasData ? tone : '#555',
            }}>
              {hasData ? (s.score >= 0 ? '+' : '') + s.score.toFixed(2) : '—'}
            </span>
            <span style={{
              fontSize: 12, fontWeight: 900, letterSpacing: 0.6,
              color: hasData ? tone : '#555',
            }}>
              {hasData ? s.verdict : 'VERİ YOK'}
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
            width: 1, background: 'rgba(255,255,255,0.18)',
            transform: 'translateX(-50%)',
          }} />
          {hasData && (
            <div style={{
              position: 'absolute', top: '50%', left: `${pct}%`,
              width: 12, height: 12, borderRadius: '50%',
              background: tone,
              boxShadow: `0 0 10px ${tone}99`,
              border: '2px solid #000',
              transform: 'translate(-50%, -50%)',
              transition: 'left 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
            }} />
          )}
        </div>

        <div style={{
          display: 'flex', justifyContent: 'space-between',
          fontSize: 8, color: '#555', fontWeight: 700, letterSpacing: 0.5,
          marginBottom: 8,
        }}>
          <span>BEARISH</span>
          <span>NÖTR</span>
          <span>BULLISH</span>
        </div>

        {/* One-line summary — "bull pressure" includes Open Long + Close Short + Buy */}
        {hasData ? (
          <div style={{
            fontSize: 11, color: '#fff', fontFamily: 'var(--mono)', opacity: 0.85,
          }}>
            <span style={{ color: '#00d992' }}>BULL {fmtUSD(s.longVol)}</span>
            <span style={{ color: '#888' }}> ({s.longCount}) · </span>
            <span style={{ color: '#f43f5e' }}>BEAR {fmtUSD(s.shortVol)}</span>
            <span style={{ color: '#888' }}> ({s.shortCount})</span>
          </div>
        ) : (
          <div style={{ fontSize: 11, color: '#666', fontFamily: 'var(--mono)' }}>
            Veri yükleniyor… (top 300 leaderboard whale taranıyor)
          </div>
        )}
      </div>

      {/* Hot coins — 4-card mini panel */}
      {s.byCoin.length > 0 && (
        <div>
          <div style={{
            fontSize: 10, color: '#888', fontWeight: 700, letterSpacing: 0.8,
            marginBottom: 6, paddingLeft: 2,
          }}>
            HOT COINS · CANLI
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
            {s.byCoin.map(c => {
              const cTotal = c.long + c.short
              const cLongPct = cTotal > 0 ? Math.round(100 * c.long / cTotal) : 50
              const cTone = c.longVol >= c.shortVol ? '#00d992' : '#f43f5e'
              return (
                <div key={c.coin} style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: `1px solid ${cTone}30`,
                  borderRadius: 10, padding: '8px 8px',
                  display: 'flex', flexDirection: 'column', gap: 4,
                }}>
                  <div style={{
                    fontSize: 11, fontWeight: 800, color: '#fff', letterSpacing: 0.3,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }} title={c.label || c.coin}>
                    {(c.label || c.coin).split(' · ')[0]}
                  </div>
                  {(c.kind === 'builder_perp' || c.kind === 'spot') && (c.label || '').includes(' · ') && (
                    <div style={{
                      fontSize: 8, color: '#888', fontWeight: 600,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: -2,
                    }}>
                      {(c.label || c.coin).split(' · ')[1]}
                    </div>
                  )}
                  <div style={{
                    fontSize: 11, fontWeight: 800, fontFamily: 'var(--mono)', color: cTone,
                  }}>
                    {fmtUSD(c.totalVol)}
                  </div>
                  <div style={{
                    fontSize: 9, color: '#888', fontFamily: 'var(--mono)',
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}>
                    <span style={{ color: '#00d992' }}>↑{c.long}</span>
                    <span>·</span>
                    <span style={{ color: '#f43f5e' }}>↓{c.short}</span>
                  </div>
                  {/* Mini progress bar */}
                  <div style={{
                    height: 3, borderRadius: 2,
                    background: 'rgba(244,63,94,0.25)', overflow: 'hidden', marginTop: 2,
                  }}>
                    <div style={{
                      height: '100%', width: `${cLongPct}%`,
                      background: '#00d992',
                      transition: 'width 0.4s ease',
                    }} />
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

// ─── Positioning View ─────────────────────────────────────────────────────────
// "What whales currently HOLD" — snapshot of aggregated long/short notional
// across 500 qualifying whales, refreshed every 5 min server-side.
function PositioningView({ positioning, loading }) {
  if (loading && !positioning) {
    return (
      <div style={{ padding: '60px 20px', textAlign: 'center', color: '#666', fontSize: 13 }}>
        Yükleniyor…
      </div>
    )
  }
  if (!positioning || !positioning.available) {
    return (
      <div style={{ padding: '60px 20px', textAlign: 'center', color: '#666', fontSize: 13, lineHeight: 1.6 }}>
        {positioning?.message || 'Pozisyon snapshot\'ı henüz hazır değil — ilk tarama 5 dk sürer.'}
      </div>
    )
  }

  const p = positioning
  const verdictColor = p.verdict === 'BULLISH' ? '#00d992'
                     : p.verdict === 'BEARISH' ? '#f43f5e' : '#aaa'
  const ageMin = Math.max(0, Math.floor((Date.now() - p.ts_ms) / 60000))

  return (
    <>
      {/* Summary */}
      <div style={{
        padding: '14px 14px', borderRadius: 12, marginBottom: 14,
        background: 'rgba(255,255,255,0.03)',
        border: `1px solid ${verdictColor}30`,
      }}>
        <div style={{
          display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
          marginBottom: 8,
        }}>
          <div style={{ fontSize: 10, color: '#888', fontWeight: 700, letterSpacing: 0.8 }}>
            POZİSYON DAĞILIMI
          </div>
          <div style={{
            fontSize: 13, fontWeight: 900, color: verdictColor, letterSpacing: 0.6,
          }}>
            {p.verdict} {p.net_ratio >= 0 ? '+' : ''}{p.net_ratio.toFixed(2)}
          </div>
        </div>
        <div style={{ fontSize: 12, color: '#ddd', lineHeight: 1.55, marginBottom: 8 }}>
          {p.whales_with_positions} whale şu an açık pozisyon tutuyor —
          toplam <span style={{ color: '#00d992' }}>{fmtUSD(p.total_long_notional)} long</span> ·
          <span style={{ color: '#f43f5e' }}> {fmtUSD(p.total_short_notional)} short</span>.
        </div>
        <div style={{ fontSize: 9, color: '#555', fontFamily: 'var(--mono)' }}>
          {p.whales_polled} cüzdan tarandı · {ageMin}dk önce güncellendi
        </div>
      </div>

      {/* Per-coin positioning */}
      <div style={{
        fontSize: 10, color: '#888', fontWeight: 700, letterSpacing: 0.8,
        marginBottom: 8, paddingLeft: 2,
      }}>COIN BAZINDA NET POZİSYON</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
        {(p.coins || []).slice(0, 20).map(c => {
          const tone = c.dominant === 'LONG' ? '#00d992'
                     : c.dominant === 'SHORT' ? '#f43f5e' : '#aaa'
          const longPct = c.total_notional > 0
            ? Math.round(100 * c.long_notional / c.total_notional) : 50
          const deltaTone = c.delta_net_notional > 0 ? '#00d992'
                          : c.delta_net_notional < 0 ? '#f43f5e' : '#666'
          const showDelta = p.has_delta && Math.abs(c.delta_net_notional) > 1000
          return (
            <div key={c.coin} style={{
              background: 'rgba(255,255,255,0.03)',
              border: `1px solid ${tone}30`,
              borderRadius: 10, padding: '10px 12px',
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginBottom: 6,
              }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0, flex: 1 }}>
                  <span style={{
                    fontSize: 14, fontWeight: 800, color: '#fff',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{(c.coin_label || c.coin).split(' · ')[0]}</span>
                  {(c.coin_kind === 'builder_perp' || c.coin_kind === 'spot') && (c.coin_label || '').includes(' · ') && (
                    <span style={{ fontSize: 9, color: '#888', fontWeight: 600 }}>
                      {(c.coin_label).split(' · ')[1]}
                    </span>
                  )}
                  <span style={{
                    fontSize: 10, fontWeight: 800, color: tone, letterSpacing: 0.5, marginLeft: 'auto',
                  }}>{c.dominant}</span>
                </div>
                <div style={{
                  fontSize: 11, fontFamily: 'var(--mono)', fontWeight: 800, color: tone,
                }}>
                  net {c.net_notional >= 0 ? '+' : ''}{fmtUSD(Math.abs(c.net_notional))}
                </div>
              </div>

              {/* Bar showing long/short ratio */}
              <div style={{
                height: 5, borderRadius: 3, marginBottom: 6,
                background: 'rgba(244,63,94,0.25)', overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%', width: `${longPct}%`, background: '#00d992',
                  transition: 'width 0.4s ease',
                }} />
              </div>

              <div style={{
                fontSize: 10, color: '#888', fontFamily: 'var(--mono)',
                display: 'flex', flexWrap: 'wrap', gap: 8,
              }}>
                <span><span style={{ color: '#00d992' }}>{c.long_whales} long</span> / <span style={{ color: '#f43f5e' }}>{c.short_whales} short</span></span>
                <span>vol {fmtUSD(c.total_notional)}</span>
                {showDelta && (
                  <span style={{ color: deltaTone }}>
                    {c.delta_net_notional > 0 ? '▲' : c.delta_net_notional < 0 ? '▼' : '·'} {c.delta_net_notional >= 0 ? '+' : '−'}{fmtUSD(Math.abs(c.delta_net_notional))} (5dk)
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div style={{
        padding: '10px 12px', borderRadius: 8,
        background: 'rgba(245,158,11,0.06)',
        border: '1px solid rgba(245,158,11,0.18)',
        fontSize: 10, color: '#f59e0b', lineHeight: 1.5,
      }}>
        ⚠ Pozisyon snapshot'ı 5dk'da bir güncellenir. Yatırım tavsiyesi değildir.
      </div>
    </>
  )
}

// ─── Whale Insights Sheet ─────────────────────────────────────────────────────
// Full-screen rule-based analysis of recent whale activity. Tapped open from
// the WhaleCompass sentiment header. Pure observation — no buy/sell calls.
function WhaleInsightsSheet({ open, onClose, token }) {
  const [data, setData] = useState(null)
  const [positioning, setPositioning] = useState(null)
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState('flow') // 'flow' | 'positioning'

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

  const toneColor = (t) => t === 'bull' ? '#00d992' : t === 'bear' ? '#f43f5e' : '#f59e0b'
  const verdictColor = (v) => v === 'BULLISH' ? '#00d992' : v === 'BEARISH' ? '#f43f5e' : '#aaa'

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) { haptic('light'); onClose() } }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.92)',
        display: 'flex', flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div style={{
        padding: 'calc(env(safe-area-inset-top) + 14px) 16px 14px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: 'var(--bg-1)',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <button
          onClick={() => { haptic('light'); onClose() }}
          style={{
            background: 'transparent', border: 'none', color: '#fff',
            fontSize: 22, padding: 0, cursor: 'pointer', lineHeight: 1,
          }}>‹</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>Whale Analiz</div>
          <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>
            {tab === 'flow' ? 'Son 24 saat · ne yaptılar' : 'Şu an · ne tutuyorlar'}
          </div>
        </div>
      </div>

      {/* Tab switcher */}
      <div style={{
        display: 'flex', padding: '8px 16px 0', gap: 6,
        borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'var(--bg-1)',
      }}>
        {[
          { id: 'flow',        label: 'AKSİYON (FLOW)' },
          { id: 'positioning', label: 'POZİSYON' },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => { haptic('light'); setTab(t.id) }}
            style={{
              flex: 1, padding: '10px 6px', background: 'transparent', border: 'none',
              borderBottom: `2px solid ${tab === t.id ? '#00d992' : 'transparent'}`,
              color: tab === t.id ? '#fff' : '#666',
              fontSize: 10, fontWeight: 800, letterSpacing: 0.6, cursor: 'pointer',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px 80px' }}>
        {tab === 'positioning' ? (
          <PositioningView positioning={positioning} loading={loading} />
        ) : loading && !data ? (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: '#666', fontSize: 13 }}>
            Yükleniyor…
          </div>
        ) : !data || data.total_vol === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: '#666', fontSize: 13 }}>
            Son 24 saatte takip edilen whale'lerden eşik üstü aktivite yok.
          </div>
        ) : (
          <>
            {/* Headline */}
            <div style={{
              padding: '14px 14px', borderRadius: 12, marginBottom: 14,
              background: 'rgba(255,255,255,0.03)',
              border: `1px solid ${verdictColor(data.verdict)}30`,
            }}>
              <div style={{
                display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
                marginBottom: 8,
              }}>
                <div style={{
                  fontSize: 10, color: '#888', fontWeight: 700, letterSpacing: 0.8,
                }}>GENEL OKUMA</div>
                <div style={{
                  fontSize: 13, fontWeight: 900, color: verdictColor(data.verdict),
                  letterSpacing: 0.6,
                }}>
                  {data.verdict} {data.score >= 0 ? '+' : ''}{data.score.toFixed(2)}
                </div>
              </div>
              <div style={{ fontSize: 12, color: '#ddd', lineHeight: 1.55 }}>
                {data.headline}
              </div>
            </div>

            {/* Per-coin breakdown */}
            <div style={{
              fontSize: 10, color: '#888', fontWeight: 700, letterSpacing: 0.8,
              marginBottom: 8, paddingLeft: 2,
            }}>COIN BAZINDA</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
              {(data.coins || []).map(c => (
                <div key={c.coin} style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: `1px solid ${verdictColor(c.direction)}30`,
                  borderRadius: 10, padding: '10px 12px',
                }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    marginBottom: 6,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0, flex: 1 }}>
                      <span style={{
                        fontSize: 14, fontWeight: 800, color: '#fff',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>{(c.coin_label || c.coin).split(' · ')[0]}</span>
                      {(c.coin_kind === 'builder_perp' || c.coin_kind === 'spot') && (c.coin_label || '').includes(' · ') && (
                        <span style={{ fontSize: 9, color: '#888', fontWeight: 600 }}>
                          {(c.coin_label).split(' · ')[1]}
                        </span>
                      )}
                      <span style={{
                        fontSize: 10, fontWeight: 800, letterSpacing: 0.5, marginLeft: 'auto',
                        color: verdictColor(c.direction),
                      }}>
                        {c.direction}
                      </span>
                    </div>
                    <div style={{
                      fontSize: 11, fontFamily: 'var(--mono)', color: '#aaa',
                    }}>
                      conf {Math.round((c.confidence || 0) * 100)}%
                    </div>
                  </div>

                  <div style={{
                    fontSize: 10, color: '#888', fontFamily: 'var(--mono)',
                    display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 6,
                  }}>
                    <span><span style={{ color: '#00d992' }}>↑{c.bull_count}</span>/<span style={{ color: '#f43f5e' }}>↓{c.bear_count}</span></span>
                    <span>{c.unique_whales} whale</span>
                    <span>vol {fmtUSD(c.total_vol)}</span>
                    <span>açılış {c.open_count} · kapanış {c.close_count}</span>
                  </div>

                  {c.insights && c.insights.length > 0 && (
                    <div style={{
                      display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6,
                      paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.05)',
                    }}>
                      {c.insights.map((ins, i) => (
                        <div key={i} style={{
                          display: 'flex', alignItems: 'flex-start', gap: 6,
                          fontSize: 11, color: '#ddd', lineHeight: 1.5,
                        }}>
                          <span style={{
                            fontSize: 8, fontWeight: 800, padding: '2px 6px',
                            borderRadius: 3, marginTop: 1,
                            color: toneColor(ins.tone),
                            background: `${toneColor(ins.tone)}18`,
                            letterSpacing: 0.5, flexShrink: 0,
                          }}>{ins.tag}</span>
                          <span>{ins.text}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Top active whales */}
            {data.top_whales && data.top_whales.length > 0 && (
              <>
                <div style={{
                  fontSize: 10, color: '#888', fontWeight: 700, letterSpacing: 0.8,
                  marginBottom: 8, paddingLeft: 2,
                }}>EN AKTİF WHALE'LER</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 18 }}>
                  {data.top_whales.map(w => {
                    const biasTone = w.bias === 'BULL' ? '#00d992' : w.bias === 'BEAR' ? '#f43f5e' : '#aaa'
                    return (
                      <div key={w.address} style={{
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.05)',
                        borderRadius: 8, padding: '8px 10px',
                        display: 'flex', alignItems: 'center', gap: 10,
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: 12, fontWeight: 700, color: '#fff',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>{w.name}</div>
                          <div style={{
                            fontSize: 9, color: '#666', fontFamily: 'var(--mono)', marginTop: 2,
                          }}>
                            {w.fills} işlem · {((w.coin_labels || w.coins) || []).slice(0, 3).map(l => l.split(' · ')[0]).join(', ')}{(w.coins || []).length > 3 ? '…' : ''}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{
                            fontSize: 11, fontWeight: 800, fontFamily: 'var(--mono)', color: biasTone,
                          }}>{fmtUSD(w.total_vol)}</div>
                          <div style={{
                            fontSize: 9, color: biasTone, fontWeight: 800, letterSpacing: 0.5, marginTop: 1,
                          }}>{w.bias}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}

            {/* Disclaimer */}
            <div style={{
              padding: '10px 12px', borderRadius: 8,
              background: 'rgba(245,158,11,0.06)',
              border: '1px solid rgba(245,158,11,0.18)',
              fontSize: 10, color: '#f59e0b', lineHeight: 1.5,
            }}>
              ⚠ {data.disclaimer}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Copy Bottom Sheet ────────────────────────────────────────────────────────
function CopySheet({ trader, onClose, onSave }) {
  const [budget,      setBudget]      = useState('500')
  const [ratio,       setRatio]       = useState('1')
  const [autoClose,   setAutoClose]   = useState(true)
  const [copyEnabled, setCopyEnabled] = useState(false)

  if (!trader) return null
  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) { haptic('light'); onClose() } }}
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'flex-end' }}
    >
      <div style={{
        background: 'var(--bg-2)', width: '100%', borderTopLeftRadius: 24, borderTopRightRadius: 24,
        // Tab bar overlays the viewport bottom — push our content (the action
        // button is the last child) above it. var(--tab-total-h) already
        // includes the iOS home-indicator safe-area, so don't add it twice.
        padding: '18px 20px calc(var(--tab-total-h, 69px) + 14px)',
        border: '1px solid rgba(255,255,255,0.06)', maxHeight: '85vh', overflowY: 'auto',
      }}>
        {/* Handle */}
        <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.15)', margin: '0 auto 14px' }} />

        <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', marginBottom: 2 }}>Follow Trader</div>
        <div style={{ fontSize: 12, color: '#fff', marginBottom: 18 }}>{trader.displayName} · {shortAddr(trader.address)}</div>

        {/* Budget */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: '#fff', fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>MAX BUDGET (USD)</div>
          <input
            type="number" value={budget} onChange={e => setBudget(e.target.value)}
            style={{
              width: '100%', background: 'var(--bg-3)', border: '1px solid var(--border)',
              borderRadius: 10, padding: '12px 14px', color: '#fff', fontSize: 16,
              fontWeight: 700, fontFamily: 'var(--mono)', boxSizing: 'border-box',
            }}
          />
          <div style={{ fontSize: 11, color: '#444', marginTop: 4 }}>Bu trader için maksimum toplam marjin</div>
        </div>

        {/* Ratio */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: '#fff', fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>SIZE RATIO (%)</div>
          <input
            type="number" value={ratio} onChange={e => setRatio(e.target.value)}
            style={{
              width: '100%', background: 'var(--bg-3)', border: '1px solid var(--border)',
              borderRadius: 10, padding: '12px 14px', color: '#fff', fontSize: 16,
              fontWeight: 700, fontFamily: 'var(--mono)', boxSizing: 'border-box',
            }}
          />
          <div style={{ fontSize: 11, color: '#444', marginTop: 4 }}>Trader pozisyonunun %'si · 1% → $5K için $50</div>
        </div>

        {/* Toggles */}
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '4px 0', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '12px 14px' }}
            onClick={() => { haptic('light'); setAutoClose(v => !v) }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>Auto Close</div>
              <div style={{ fontSize: 11, color: '#555', marginTop: 1 }}>Trader kapatınca otomatik kapat</div>
            </div>
            <div style={{
              width: 44, height: 26, borderRadius: 13, position: 'relative', cursor: 'pointer',
              background: autoClose ? '#00d992' : 'rgba(255,255,255,0.1)',
              transition: 'background 0.2s',
            }}>
              <div style={{
                position: 'absolute', top: 3, left: autoClose ? 21 : 3, width: 20, height: 20,
                borderRadius: '50%', background: '#fff', transition: 'left 0.2s',
              }} />
            </div>
          </div>
          <div style={{ height: 1, background: 'rgba(255,255,255,0.04)', margin: '0 14px' }} />
          <div style={{ display: 'flex', alignItems: 'center', padding: '12px 14px' }}
            onClick={() => { haptic('light'); setCopyEnabled(v => !v) }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>Auto Copy Trade</div>
              <div style={{ fontSize: 11, color: '#555', marginTop: 1 }}>Pozisyon açılınca otomatik emir gönder</div>
            </div>
            <div style={{
              width: 44, height: 26, borderRadius: 13, position: 'relative', cursor: 'pointer',
              background: copyEnabled ? '#f59e0b' : 'rgba(255,255,255,0.1)',
              transition: 'background 0.2s',
            }}>
              <div style={{
                position: 'absolute', top: 3, left: copyEnabled ? 21 : 3, width: 20, height: 20,
                borderRadius: '50%', background: '#fff', transition: 'left 0.2s',
              }} />
            </div>
          </div>
        </div>

        {copyEnabled && (
          <div style={{
            background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
            borderRadius: 10, padding: '10px 12px', fontSize: 11, color: '#f59e0b', marginBottom: 14, lineHeight: 1.5,
          }}>
            ⚠ Copy trade aktifken her pozisyon değişikliğinde otomatik emir gönderilir. Paper Mode'da test edin.
          </div>
        )}

        <button
          onClick={() => { haptic('medium'); onSave({ budget: parseFloat(budget) || 500, ratio: parseFloat(ratio) || 1, autoClose, copyEnabled }) }}
          style={{
            width: '100%', padding: 15, borderRadius: 12, border: 'none',
            background: '#00d992', color: '#000', fontSize: 14, fontWeight: 800,
            letterSpacing: 0.5, cursor: 'pointer',
          }}>
          TAKİBİ BAŞLAT
        </button>
      </div>
    </div>
  )
}

// ─── Position Card ────────────────────────────────────────────────────────────
function PositionCard({ pos }) {
  const isLong = pos.side === 'LONG'
  const pnlUp  = (pos.unrealized_pnl || 0) >= 0
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 12, padding: '12px 14px', marginBottom: 8,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 800, fontFamily: 'var(--mono)', color: '#fff' }}>{pos.coin}</span>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, letterSpacing: 0.5,
            background: isLong ? 'rgba(0,217,146,0.12)' : 'rgba(244,63,94,0.12)',
            color: isLong ? '#00d992' : '#f43f5e',
          }}>
            {pos.side}{pos.leverage ? ` · ${pos.leverage}x` : ''}
          </span>
        </div>
        <span style={{
          fontSize: 13, fontWeight: 800, fontFamily: 'var(--mono)',
          color: pnlUp ? '#00d992' : '#f43f5e',
        }}>
          {pnlUp ? '+' : ''}{fmtUSD(pos.unrealized_pnl)}
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#fff', fontFamily: 'var(--mono)' }}>
        <span>Entry ${fmtPrice(pos.entry_px)}</span>
        <span>Size {fmtUSD(pos.notional)}</span>
        {pos.liq_px && <span style={{ color: '#f43f5e' }}>Liq ${fmtPrice(pos.liq_px)}</span>}
      </div>
    </div>
  )
}

// ─── Trader Detail Page ───────────────────────────────────────────────────────
function TraderDetail({ trader, followed, followedSettings, onBack, onFollow }) {
  const { token }         = useAuth()
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
        .then(r => r.json())
        .then(data => setPositions(data))
        .catch(() => {})
    }, 15000)
    return () => clearInterval(id)
  }, [trader, token])

  const pnl   = trader.pnl_alltime
  const roi   = trader.roi_alltime
  const month = trader.pnl_month

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100%', color: 'var(--text)', paddingBottom: 40 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <button onClick={() => { haptic('light'); onBack() }}
          style={{ background: 'none', border: 'none', color: '#fff', fontSize: 24, cursor: 'pointer', padding: '0 12px 0 0', lineHeight: 1 }}>
          ‹
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>{trader.displayName}</span>
            {isFollowed && (
              <span style={{
                fontSize: 9, fontWeight: 800, letterSpacing: 1, padding: '2px 6px', borderRadius: 4,
                background: isCopying ? 'rgba(245,158,11,0.15)' : 'rgba(0,217,146,0.12)',
                color: isCopying ? '#f59e0b' : '#00d992',
              }}>
                {isCopying ? '● COPYING' : '● LIVE'}
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: '#fff', fontFamily: 'var(--mono)', marginTop: 1 }}>{trader.address}</div>
        </div>
      </div>

      {/* Account value */}
      <div style={{ padding: '20px 20px 8px' }}>
        <div style={{ fontSize: 11, color: '#fff', fontWeight: 700, letterSpacing: 2 }}>ACCOUNT VALUE</div>
        <div style={{ fontSize: 36, fontWeight: 800, letterSpacing: -1, marginTop: 4, fontFamily: 'var(--mono)' }}>
          {fmtUSD(trader.accountValue)}
        </div>
      </div>

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, padding: '12px 20px 16px' }}>
        {[
          { label: 'All-time PnL', val: fmtUSD(pnl),  up: pnl >= 0  },
          { label: 'ROI',          val: fmtPct(roi),   up: roi >= 0  },
          { label: '30d PnL',      val: fmtUSD(month), up: month >= 0 },
        ].map(s => (
          <div key={s.label} style={{
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 12, padding: '10px 12px',
          }}>
            <div style={{ fontSize: 10, color: '#fff', fontWeight: 600, marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 14, fontWeight: 800, fontFamily: 'var(--mono)', color: s.up ? '#00d992' : '#f43f5e' }}>
              {s.val}
            </div>
          </div>
        ))}
      </div>

      {/* Follow button */}
      <div style={{ padding: '0 20px 20px' }}>
        <button
          onClick={() => { haptic('medium'); onFollow(trader) }}
          style={{
            width: '100%', padding: 14, borderRadius: 12, border: 'none', cursor: 'pointer',
            background: isFollowed ? 'rgba(244,63,94,0.12)' : 'rgba(0,217,146,0.15)',
            color: isFollowed ? '#f43f5e' : '#00d992',
            fontSize: 13, fontWeight: 800, letterSpacing: 0.5,
            border: `1px solid ${isFollowed ? 'rgba(244,63,94,0.25)' : 'rgba(0,217,146,0.25)'}`,
          }}>
          {isFollowed ? '✕ Takipten Çıkar' : '★ Takip Et'}
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', padding: '0 20px', borderBottom: '1px solid rgba(255,255,255,0.05)', gap: 20 }}>
        {['positions', 'info'].map(t => (
          <button key={t} onClick={() => { haptic('light'); setTab(t) }}
            style={{
              background: 'none', border: 'none', padding: '10px 0',
              borderBottom: tab === t ? '2px solid #00d992' : '2px solid transparent',
              color: tab === t ? '#fff' : '#555', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}>
            {t === 'positions' ? `Pozisyonlar${positions?.positions ? ` (${positions.positions.length})` : ''}` : 'Detay'}
          </button>
        ))}
      </div>

      <div style={{ padding: '12px 20px' }}>
        {tab === 'positions' && (
          loading ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: '#555', fontSize: 22 }}>
              <span style={{ animation: 'm-spin 1s linear infinite', display: 'inline-block' }}>◌</span>
            </div>
          ) : !positions?.positions?.length ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: '#555', fontSize: 13 }}>
              Açık pozisyon yok
            </div>
          ) : (
            positions.positions.map(pos => <PositionCard key={pos.coin} pos={pos} />)
          )
        )}

        {tab === 'info' && (
          <div>
            <div style={{ fontSize: 11, color: '#555', fontWeight: 700, letterSpacing: 1, marginBottom: 12 }}>ADRES</div>
            <div style={{
              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 10, padding: '12px 14px', fontFamily: 'var(--mono)', fontSize: 12,
              color: '#aaa', wordBreak: 'break-all', lineHeight: 1.6,
            }}>
              {trader.address}
            </div>
            <div style={{ fontSize: 11, color: '#555', marginTop: 8 }}>15sn güncelleniyor · Hyperliquid Mainnet</div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Trader Card ──────────────────────────────────────────────────────────────
function TraderCard({ trader, followed, followedSettings, onSelect, onFollow }) {
  const pnl    = trader.pnl_alltime
  const roi    = trader.roi_alltime
  const month  = trader.pnl_month
  const copying = followedSettings?.copyEnabled

  return (
    <div onClick={() => { haptic('light'); onSelect(trader) }}
      style={{
        padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: 'var(--bg)', cursor: 'pointer',
      }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
        {/* Avatar */}
        <div style={{
          width: 38, height: 38, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
          background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <img
            src="https://coin-images.coingecko.com/coins/images/50882/large/hyperliquid.jpg?1729431300"
            alt="HL" style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={e => { e.target.style.display = 'none'; e.target.parentElement.innerHTML = '<span style="font-size:13px;font-weight:800;color:#555">◈</span>' }}
          />
        </div>

        {/* Name + addr */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {trader.displayName}
            </span>
            {followed && (
              <span style={{
                fontSize: 9, fontWeight: 800, letterSpacing: 0.8, padding: '1px 5px', borderRadius: 3, flexShrink: 0,
                background: copying ? 'rgba(245,158,11,0.15)' : 'rgba(0,217,146,0.12)',
                color: copying ? '#f59e0b' : '#00d992',
              }}>
                {copying ? 'COPYING' : '● LIVE'}
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: '#fff', fontFamily: 'var(--mono)', marginTop: 1 }}>
            {shortAddr(trader.address)} · Acc {fmtUSD(trader.accountValue)}
          </div>
        </div>

        {/* Follow button */}
        <button
          onClick={e => { e.stopPropagation(); haptic('medium'); onFollow(trader) }}
          style={{
            flexShrink: 0, padding: '7px 12px', borderRadius: 20, border: 'none', cursor: 'pointer',
            background: followed ? 'rgba(244,63,94,0.1)' : 'rgba(0,217,146,0.1)',
            color: followed ? '#f43f5e' : '#00d992',
            fontSize: 12, fontWeight: 700,
          }}>
          {followed ? '✕' : '★ Takip'}
        </button>
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 6 }}>
        {[
          { label: 'PnL', val: fmtUSD(pnl),   up: pnl >= 0   },
          { label: 'ROI', val: fmtPct(roi),    up: roi >= 0   },
          { label: '30d', val: fmtUSD(month),  up: month >= 0 },
        ].map(s => (
          <div key={s.label} style={{
            flex: 1, background: 'rgba(255,255,255,0.03)', borderRadius: 8,
            padding: '6px 8px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 9, color: '#fff', fontWeight: 600, marginBottom: 3 }}>{s.label}</div>
            <div style={{ fontSize: 12, fontWeight: 800, fontFamily: 'var(--mono)', color: s.up ? '#00d992' : '#f43f5e' }}>
              {s.val}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function SmartMoneyScreen() {
  const { token } = useAuth()
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
  const alertIdRef = useRef(0)

  const [followed, setFollowed] = useState(() => {
    try { return JSON.parse(localStorage.getItem('sm_followed') || '{}') } catch { return {} }
  })

  // Real Hyperliquid userFills, fed by the backend SmartMoneyTracker. Polled
  // every 15s as a baseline and prepended live from the WS broadcast below.
  const [recentFills, setRecentFills] = useState([])
  const fillsByOidRef = useRef(new Set())

  // Global whale sentiment — computed server-side over ALL tracked whales
  // (leaderboard top-50 + user follows). Refreshes every 30s.
  const [sentiment, setSentiment] = useState(null)

  const ingestFills = useCallback((arr) => {
    if (!Array.isArray(arr) || !arr.length) return
    setRecentFills(prev => {
      const seen = fillsByOidRef.current
      const merged = [...arr.filter(f => f && f.oid && !seen.has(`${f.address}:${f.oid}`)), ...prev]
      merged.forEach(f => seen.add(`${f.address}:${f.oid}`))
      merged.sort((a, b) => (b.ts || 0) - (a.ts || 0))
      return merged.slice(0, 50)
    })
  }, [])

  useEffect(() => {
    if (!token) return
    let alive = true
    let lastSince = 0
    async function pull() {
      try {
        const url = `${API}/fills?limit=50${lastSince ? `&since=${lastSince}` : ''}`
        const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
        if (!r.ok) return
        const data = await r.json()
        if (!alive) return
        const fills = data?.fills || []
        if (fills.length) {
          ingestFills(fills)
          const maxTs = fills.reduce((m, f) => Math.max(m, f.ts || 0), lastSince)
          if (maxTs > lastSince) lastSince = maxTs
        }
      } catch {}
    }
    pull()
    const id = setInterval(pull, 15000)
    return () => { alive = false; clearInterval(id) }
  }, [token, ingestFills])

  // Global whale sentiment poll — server aggregates across ALL tracked whales
  useEffect(() => {
    if (!token) return
    let alive = true
    async function pullSentiment() {
      try {
        const r = await fetch(`${API}/sentiment?window_sec=86400&min_usd=5000`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!alive || !r.ok) return
        const d = await r.json()
        // Re-map snake_case → the shape WhaleCompass uses
        setSentiment({
          score:      d.score || 0,
          verdict:    d.verdict || 'NEUTRAL',
          longCount:  d.long_count  || 0,
          shortCount: d.short_count || 0,
          longVol:    d.long_vol    || 0,
          shortVol:   d.short_vol   || 0,
          byCoin: (d.by_coin || []).map(c => ({
            coin:      c.coin,
            label:     c.coin_label || c.coin,
            kind:      c.coin_kind  || 'perp',
            long:      c.long  || 0,
            short:     c.short || 0,
            longVol:   c.long_vol  || 0,
            shortVol:  c.short_vol || 0,
            totalVol:  c.total_vol || 0,
          })),
        })
      } catch {}
    }
    pullSentiment()
    const id = setInterval(pullSentiment, 30000)
    return () => { alive = false; clearInterval(id) }
  }, [token])

  // Backend WS push: tracker emits 'smart_money_fill' the instant a whale trades
  const onWsMessage = useCallback((msg) => {
    if (!msg || msg.type !== 'smart_money_fill') return
    ingestFills([{
      address: msg.address, name: msg.name, coin: msg.coin, side: msg.side,
      dir: msg.dir, px: msg.px, sz: msg.sz, size_usd: msg.size_usd,
      oid: msg.oid, ts: msg.ts, closed_pnl: msg.closed_pnl,
    }])
    haptic('light')
  }, [ingestFills])
  useWebSocket(onWsMessage, [], { token })

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

  const onAlert = useCallback((data) => {
    const id = ++alertIdRef.current
    setAlerts(prev => [{ id, ...data }, ...prev].slice(0, 3))
    setTimeout(() => setAlerts(prev => prev.filter(a => a.id !== id)), 8000)
  }, [])

  useTraderWatcher(followed, onAlert)

  useEffect(() => {
    if (!token) return
    fetch(`${API}/leaderboard`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setTraders(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [token])

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

  const handleSave = useCallback((settings) => {
    const next = { ...followed, [copyModal.address]: { ...copyModal, ...settings } }
    setFollowed(next)
    persistFollowed(next)
    setCopyModal(null)
  }, [followed, copyModal, persistFollowed])

  const sortLabels = {
    accountValue: 'Account Value',
    pnl_alltime:  'All-time PnL',
    pnl_month:    '30d PnL',
    roi_alltime:  'ROI',
  }

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

  const followedCount = Object.keys(followed).length

  // ── Detail view
  if (selected) {
    return (
      <>
        <TraderDetail
          trader={selected}
          followed={!!followed[selected.address]}
          followedSettings={followed[selected.address] || null}
          onBack={() => setSelected(null)}
          onFollow={handleFollow}
        />
        {copyModal && <CopySheet trader={copyModal} onClose={() => setCopyModal(null)} onSave={handleSave} />}
      </>
    )
  }

  // ── List view
  return (
    <div style={{ background: 'var(--bg)', minHeight: '100%', color: 'var(--text)', paddingBottom: 24, position: 'relative' }}>
      <AlertBanner alerts={alerts} onDismiss={id => setAlerts(prev => prev.filter(a => a.id !== id))} />

      {/* Header */}
      <div style={{ padding: '14px 20px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                onClick={() => { haptic('light'); setShowSort(v => !v) }}
                style={{ fontSize: 17, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                {sortLabels[sortBy]}
                <span style={{ fontSize: 10, color: '#555', transform: showSort ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', display: 'inline-block' }}>▼</span>
              </span>
            </div>
            <div style={{ fontSize: 11, color: '#fff', marginTop: 2 }}>
              Hyperliquid · {traders.length} trader
              {followedCount > 0 && <span style={{ color: '#00d992', marginLeft: 6 }}>● {followedCount} takipte</span>}
            </div>
            <div style={{ fontSize: 9, color: '#666', marginTop: 3, fontFamily: 'var(--mono)', letterSpacing: 0.3 }}>
              LİSTE · İlk 1000 · accountValue desc  ·  SENTİMENT · $500K+ · $2M+ PnL · $5M+/ay
            </div>
          </div>
        </div>

        {/* Sort dropdown */}
        {showSort && (
          <div style={{
            position: 'absolute', top: 64, left: 20, background: 'var(--bg-2)',
            border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 6,
            zIndex: 50, boxShadow: '0 10px 40px rgba(0,0,0,0.7)', minWidth: 170,
          }}>
            {Object.entries(sortLabels).map(([key, label]) => (
              <div key={key}
                onClick={() => { haptic('light'); setSortBy(key); setShowSort(false) }}
                style={{
                  padding: '11px 14px', fontSize: 13, fontWeight: 600, borderRadius: 8, cursor: 'pointer',
                  color: sortBy === key ? '#00d992' : '#aaa',
                  background: sortBy === key ? 'rgba(0,217,146,0.08)' : 'transparent',
                }}>
                {label}
              </div>
            ))}
          </div>
        )}

        {/* Search */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '8px 12px',
          border: '1px solid rgba(255,255,255,0.06)', marginBottom: 12,
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: '#555', flexShrink: 0 }}>
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Trader ara…"
            autoCorrect="off" autoCapitalize="off" spellCheck={false}
            style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: '#fff', fontSize: 14, fontFamily: 'var(--mono)' }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', padding: 0, fontSize: 14 }}>✕</button>
          )}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 20 }}>
          {[
            ['all',       `Tümü (${traders.length})`,        false],
            ['following', `Takip (${followedCount})`,         false],
            ['live',      `Canlı (${recentFills.length})`,    true],
          ].map(([key, label, isLive]) => (
            <button key={key} onClick={() => { haptic('light'); setActiveTab(key) }}
              style={{
                background: 'none', border: 'none', padding: '8px 0',
                borderBottom: activeTab === key ? '2px solid #00d992' : '2px solid transparent',
                color: activeTab === key ? '#fff' : '#555',
                fontSize: 13, fontWeight: 700, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
              {isLive && (() => {
                // Green when EITHER global sentiment is flowing OR personal fills arrived.
                // Backend tracks top-50 whales 24/7 so this is almost always live.
                const liveOn = (sentiment && (sentiment.longCount + sentiment.shortCount > 0)) || recentFills.length > 0
                return (
                  <span style={{
                    width: 6, height: 6, borderRadius: 3,
                    background: liveOn ? '#00d992' : '#444',
                    boxShadow: liveOn ? '0 0 6px #00d992' : 'none',
                    animation: liveOn ? 'pulse-dot 1.6s ease-in-out infinite' : 'none',
                  }} />
                )
              })()}
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content area: live tab shows global sentiment + personal fills */}
      {activeTab === 'live' ? (
        <>
          {/* Global sentiment — always shown, doesn't depend on personal follows */}
          <div style={{ paddingTop: 12 }}>
            <WhaleCompass sentiment={sentiment} onOpen={() => setInsightsOpen(true)} />
          </div>

          {/* Personal fills feed — only shows when user has follows + activity */}
          {recentFills.length === 0 ? (
            <div style={{ padding: '40px 24px 24px', textAlign: 'center', color: '#555', fontSize: 13, lineHeight: 1.6 }}>
              {followedCount === 0
                ? 'Kişisel feed boş. Yukarıdaki sentiment tüm whaleler için. Bir trader takibe alırsan onun anlık işlemleri burada düşer.'
                : 'Takip ettiklerinden henüz canlı işlem yok. HL emir verdiğinde buraya saniyesinde düşer.'}
            </div>
          ) : (
          <div style={{ padding: '4px 16px 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {recentFills.map(f => {
              const isLong = (f.dir || '').toLowerCase().includes('long')
              const isOpen = (f.dir || '').toLowerCase().startsWith('open')
              const tone   = isLong ? '#00d992' : '#f43f5e'
              const age    = Math.max(0, Math.floor((Date.now() - (f.ts || 0)) / 1000))
              const ageStr = age < 60 ? `${age}s` : age < 3600 ? `${Math.floor(age / 60)}d` : `${Math.floor(age / 3600)}sa`
              const dirLabel = f.dir || (isLong ? 'BUY' : 'SELL')
              return (
                <div key={`${f.address}:${f.oid}`} style={{
                  display: 'grid', gridTemplateColumns: '1fr auto', gap: 10,
                  background: 'rgba(255,255,255,0.03)',
                  border: `1px solid ${isOpen ? 'rgba(0,217,146,0.15)' : 'rgba(255,255,255,0.06)'}`,
                  borderLeft: `3px solid ${tone}`,
                  borderRadius: 10, padding: '10px 12px',
                }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{
                      fontSize: 13, fontWeight: 700, color: '#fff',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {f.name}
                    </div>
                    <div style={{ fontSize: 11, color: tone, fontWeight: 700, marginTop: 2, fontFamily: 'var(--mono)' }}>
                      {dirLabel} <span style={{ color: '#888', fontWeight: 600 }}>·</span> {f.coin_label || f.coin}
                      {f.closed_pnl != null && (
                        <span style={{ color: f.closed_pnl >= 0 ? '#00d992' : '#f43f5e', marginLeft: 6, fontWeight: 700 }}>
                          {f.closed_pnl >= 0 ? '+' : ''}{fmtUSD(f.closed_pnl)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: tone }}>{fmtUSD(f.size_usd)}</div>
                    <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>
                      @ {fmtPrice(f.px)} <span style={{ color: '#555', marginLeft: 4 }}>{ageStr}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          )}
        </>
      ) : loading ? (
        <div style={{ padding: '80px 0', textAlign: 'center', color: '#555', fontSize: 28 }}>
          <span style={{ animation: 'm-spin 1s linear infinite', display: 'inline-block' }}>◌</span>
        </div>
      ) : displayed.length === 0 ? (
        <div style={{ padding: '60px 20px', textAlign: 'center', color: '#555', fontSize: 13 }}>
          {activeTab === 'following' ? 'Henüz takip edilen trader yok' : 'Trader bulunamadı'}
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

      {copyModal && <CopySheet trader={copyModal} onClose={() => setCopyModal(null)} onSave={handleSave} />}
      <WhaleInsightsSheet open={insightsOpen} onClose={() => setInsightsOpen(false)} token={token} />
    </div>
  )
}
