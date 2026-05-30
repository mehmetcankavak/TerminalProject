// Hyperliquid mobile trade — exchange-grade minimal flow.
// Header → big size input → leverage pills → big LONG/SHORT CTA → numpad.
// Design mirrors PriceAlertsScreen (.pa-* classes) so it feels native to the app.
import { useState, useEffect, useRef } from 'react'
import { haptic } from '../../capacitor'
import { API_BASE } from '../../config'
import { useAuth } from '../../context/AuthContext'

const LEVS = [1, 3, 5, 10, 25]

function fmtPx(p) {
  if (p == null || isNaN(p)) return '—'
  if (p >= 1000) return p.toLocaleString('en-US', { maximumFractionDigits: 2 })
  if (p >= 1)    return p.toFixed(p < 10 ? 3 : 2)
  return p.toFixed(6)
}

export default function HLTradeScreen({ onBack, sym, price, change, type = 'crypto', initialSide = 'long' }) {
  const { token } = useAuth() || {}
  const [side, setSide] = useState(initialSide === 'short' ? 'short' : 'long')
  const [sizeInput, setSizeInput] = useState('')
  const [lev, setLev] = useState(3)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [position, setPosition] = useState(null)
  const [closing, setClosing] = useState(false)
  const chipRowRef = useRef(null)

  useEffect(() => {
    const el = chipRowRef.current
    if (el) el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2
  }, [])

  const fetchPosition = async () => {
    try {
      const r = await fetch(`${API_BASE}/api/hl/positions`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      const d = await r.json()
      const list = Array.isArray(d?.positions) ? d.positions : []
      const found = list.find(p => (p?.symbol || '').replace('USDT', '') === sym)
      setPosition(found || null)
    } catch {}
  }

  useEffect(() => {
    fetchPosition()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sym])

  const closePosition = async () => {
    haptic('medium')
    setClosing(true)
    setMsg(null)
    try {
      const r = await fetch(`${API_BASE}/api/hl/close`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ coin: sym }),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok || data?.status === 'error') {
        throw new Error(data?.message || `HTTP ${r.status}`)
      }
      setMsg({ kind: 'ok', text: `Pozisyon kapatıldı · ${sym}` })
      setPosition(null)
      setTimeout(fetchPosition, 600)
    } catch (e) {
      setMsg({ kind: 'err', text: e.message })
    } finally {
      setClosing(false)
    }
  }

  const sizeNum = parseFloat(sizeInput.replace(',', '.')) || 0
  const notional = sizeNum * lev
  const isUp = (change ?? 0) >= 0
  const sublabel = type === 'stock' ? 'TRADFI · PERP' : 'PERP'
  const accent = side === 'long' ? '#00d992' : '#f43f5e'

  const onKey = (key) => {
    haptic('light')
    setMsg(null)
    setSizeInput(prev => {
      if (key === 'back') return prev.slice(0, -1)
      if (key === ',') {
        if (prev.includes(',') || prev.includes('.')) return prev
        return prev === '' ? '0,' : prev + ','
      }
      if (prev.length >= 10) return prev
      if (prev === '0' && key !== ',') return key
      return prev + key
    })
  }

  const setBySize = (usd) => {
    haptic('light')
    setSizeInput(String(usd))
  }

  const submit = async () => {
    if (!sizeNum) {
      setMsg({ kind: 'err', text: 'Size gir' })
      return
    }
    haptic('medium')
    setBusy(true)
    setMsg(null)
    try {
      const r = await fetch(`${API_BASE}/api/hl/order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          coin: sym,
          is_buy: side === 'long',
          sz_usd: sizeNum,
          leverage: lev,
          order_type: 'market',
        }),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok || data?.status === 'error') {
        throw new Error(data?.message || data?.detail || `HTTP ${r.status}`)
      }
      setMsg({ kind: 'ok', text: `${side === 'long' ? 'Long' : 'Short'} açıldı · ${lev}×` })
      setSizeInput('')
      setTimeout(fetchPosition, 600)
    } catch (e) {
      setMsg({ kind: 'err', text: e.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="pa-screen pa-screen-numpad" style={{ background: 'var(--bg)' }}>
      {/* Header: Close · Symbol+Price · Side toggle */}
      <header className="pa-pi-header">
        <button className="pa-close-btn" onClick={() => { haptic('light'); onBack?.() }} aria-label="Back">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
        <div className="pa-pi-title-wrap">
          <div className="pa-pi-title">{sym}</div>
          <div className="pa-pi-subtitle">
            ${fmtPx(price)}
            {change != null && (
              <span style={{ marginLeft: 8, color: isUp ? '#00d992' : '#f43f5e', fontWeight: 700 }}>
                {isUp ? '+' : ''}{change.toFixed(2)}%
              </span>
            )}
            <span style={{ marginLeft: 8, color: '#56565f', fontSize: 11, letterSpacing: 0.4 }}>· HL {sublabel}</span>
          </div>
        </div>
      </header>

      {/* Open position banner — appears when user has an active position for this sym */}
      {position && (
        <div style={{
          margin: '8px 16px 0',
          padding: '12px 14px',
          borderRadius: 12,
          border: `1px solid ${position.side === 'long' ? '#00d99240' : '#f43f5e40'}`,
          background: position.side === 'long' ? '#00d9920d' : '#f43f5e0d',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexShrink: 0,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span style={{
                fontSize: 10, fontWeight: 800, letterSpacing: 0.6,
                color: position.side === 'long' ? '#00d992' : '#f43f5e',
              }}>
                ● {position.side?.toUpperCase()} {position.leverage}×
              </span>
              <span style={{
                fontSize: 11, color: '#a1a1aa', fontFamily: 'var(--mono)',
              }}>
                {position.quantity?.toFixed(4)} @ ${position.entry_price?.toFixed(2)}
              </span>
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--mono)' }}>
              <span style={{
                color: (position.unrealized_pnl ?? 0) >= 0 ? '#00d992' : '#f43f5e',
              }}>
                {(position.unrealized_pnl ?? 0) >= 0 ? '+' : ''}
                ${(position.unrealized_pnl ?? 0).toFixed(2)}
              </span>
              {position.return_on_equity != null && (
                <span style={{
                  marginLeft: 8,
                  color: position.return_on_equity >= 0 ? '#00d992' : '#f43f5e',
                }}>
                  ({position.return_on_equity >= 0 ? '+' : ''}
                  {position.return_on_equity.toFixed(2)}%)
                </span>
              )}
            </div>
          </div>
          <button
            onClick={closePosition}
            disabled={closing}
            style={{
              padding: '10px 16px',
              borderRadius: 10,
              border: '1px solid #2a2a2a',
              background: '#181818',
              color: '#fafafa',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              flexShrink: 0,
              opacity: closing ? 0.5 : 1,
            }}
          >
            {closing ? '…' : 'Close'}
          </button>
        </div>
      )}

      {/* Long / Short segmented control */}
      <div style={{
        margin: '4px 16px 0',
        display: 'flex',
        background: '#0f0f12',
        borderRadius: 14,
        padding: 4,
        gap: 4,
      }}>
        {[
          { id: 'long',  label: 'Long',  color: '#00d992' },
          { id: 'short', label: 'Short', color: '#f43f5e' },
        ].map(s => {
          const active = side === s.id
          return (
            <button
              key={s.id}
              onClick={() => { haptic('light'); setSide(s.id) }}
              style={{
                flex: 1,
                padding: '12px 0',
                borderRadius: 10,
                border: 'none',
                background: active ? s.color : 'transparent',
                color: active ? '#000' : '#56565f',
                fontSize: 14,
                fontWeight: 800,
                letterSpacing: 0.4,
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {s.label.toUpperCase()}
            </button>
          )
        })}
      </div>

      {/* Size + Notional */}
      <div style={{ flexShrink: 0, padding: '20px 16px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div className="pa-pi-label" style={{ marginBottom: 6 }}>Size</div>
        <div className="pa-pi-amount" style={{ marginBottom: 6 }}>
          <span className="pa-pi-currency">$</span>
          <span className="pa-pi-value">{sizeInput || '0'}</span>
        </div>
        <div style={{ fontSize: 14, color: '#a1a1aa', fontWeight: 500 }}>
          Notional&nbsp;
          <span style={{ color: '#fafafa', fontFamily: 'var(--mono)', fontWeight: 700 }}>
            ${notional.toLocaleString('en-US', { maximumFractionDigits: 0 })}
          </span>
          <span style={{ marginLeft: 6, color: '#52525b' }}>· {lev}×</span>
        </div>
      </div>

      {/* Quick size chips — fixed height, no shrink */}
      <div
        ref={chipRowRef}
        className="hl-chip-row"
        style={{
          flexShrink: 0,
          display: 'flex',
          gap: 8,
          overflowX: 'auto',
          overflowY: 'hidden',
          WebkitOverflowScrolling: 'touch',
          padding: '4px 16px 12px',
        }}
      >
        <style>{`.hl-chip-row::-webkit-scrollbar{display:none}`}</style>
        {[25, 50, 100, 250, 500, 1000].map(v => (
          <button
            key={v}
            onClick={() => setBySize(v)}
            style={{
              flexShrink: 0,
              height: 44,
              padding: '0 22px',
              borderRadius: 999,
              background: '#181818',
              border: '1px solid #2a2a2a',
              color: '#fafafa',
              fontSize: 14,
              fontWeight: 700,
              fontFamily: 'var(--mono)',
              cursor: 'pointer',
              lineHeight: '42px',
            }}
          >
            ${v}
          </button>
        ))}
      </div>

      {/* Leverage pills */}
      <div style={{ flexShrink: 0, display: 'flex', gap: 6, padding: '0 16px 12px' }}>
        {LEVS.map(l => {
          const active = lev === l
          return (
            <button
              key={l}
              onClick={() => { haptic('light'); setLev(l) }}
              style={{
                flex: 1,
                padding: '12px 0',
                borderRadius: 10,
                border: `1px solid ${active ? accent : '#2a2a2a'}`,
                background: active ? accent + '1a' : '#181818',
                color: active ? accent : '#a1a1aa',
                fontSize: 14,
                fontWeight: 800,
                fontFamily: 'var(--mono)',
                cursor: 'pointer',
              }}
            >
              {l}×
            </button>
          )
        })}
      </div>

      <div style={{ flex: 1, minHeight: 0 }} />

      {/* Footer: error + CTA + numpad */}
      <div className="pa-pi-foot">
        {msg && (
          <div style={{
            padding: '10px 14px',
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 600,
            marginBottom: 10,
            background: msg.kind === 'ok' ? '#00d99218' : '#f43f5e18',
            color:      msg.kind === 'ok' ? '#00d992'   : '#f43f5e',
            textAlign: 'center',
          }}>
            {msg.text}
          </div>
        )}

        <button
          className="pa-pi-cta"
          onClick={submit}
          disabled={busy || !sizeInput}
          style={{
            background: accent,
            color: '#000',
            boxShadow: `0 4px 18px ${accent}40`,
          }}
        >
          {busy
            ? '…'
            : `${side === 'long' ? 'Open Long' : 'Open Short'} · $${(notional).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
          }
        </button>

        {/* Numpad */}
        <div className="pa-numpad">
          {['1','2','3','4','5','6','7','8','9',',','0','back'].map(k => (
            <button
              key={k}
              className={`pa-key${k === 'back' ? ' pa-key-action' : ''}`}
              onClick={() => onKey(k)}
            >
              {k === 'back'
                ? <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 5H8l-7 7 7 7h13a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z"/><line x1="18" y1="9" x2="12" y2="15"/><line x1="12" y1="9" x2="18" y2="15"/></svg>
                : k}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
