import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext'
import { haptic } from '../../capacitor'
import { API_BASE } from '../../config'

const SYMBOLS = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT', 'DOGE/USDT', 'AVAX/USDT', 'LINK/USDT']
const PCTS = ['25%', '50%', '75%', '100%']

function fmtPrice(p) {
  if (!p) return '—'
  if (p >= 1000) return '$' + p.toLocaleString('en-US', { maximumFractionDigits: 0 })
  return '$' + p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
}

export default function TradeModal({ onClose }) {
  const { token } = useAuth()
  const [sym, setSym]         = useState('BTC/USDT')
  const [side, setSide]       = useState('buy')
  const [qty, setQty]         = useState('')
  const [price, setPrice]     = useState(null)
  const [change, setChange]   = useState(null)
  const [balance, setBalance] = useState(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult]   = useState(null)
  const [connected, setConnected] = useState(true)

  // Fetch live price
  useEffect(() => {
    const binSym = sym.replace('/', '').toLowerCase()
    const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${binSym}@miniTicker`)
    ws.onmessage = (e) => {
      const d = JSON.parse(e.data)
      setPrice(parseFloat(d.c))
      setChange(parseFloat(d.P))
    }
    ws.onerror = () => {}
    return () => ws.close()
  }, [sym])

  // Fetch balance
  useEffect(() => {
    if (!token) return
    fetch(`${API_BASE}/api/portfolio/balance`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => {
        if (r.status === 404 || r.status === 400) { setConnected(false); return null }
        return r.ok ? r.json() : null
      })
      .then(d => {
        if (!d) return
        setConnected(true)
        const usdt = d?.USDT ?? d?.usdt ?? d?.total ?? null
        setBalance(usdt)
      })
      .catch(() => setConnected(false))
  }, [token])

  const pctClick = (pct) => {
    haptic('light')
    if (!balance || !price) return
    const fraction = parseInt(pct) / 100
    const usdtAmt = balance * fraction
    const coinQty = (usdtAmt / price).toFixed(6)
    setQty(coinQty)
  }

  const execute = async () => {
    if (!qty || !price) return
    haptic('medium')
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch(`${API_BASE}/api/trade/order`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ symbol: sym, side, quantity: parseFloat(qty), type: 'market' })
      })
      const data = await res.json()
      if (res.ok) {
        haptic('heavy')
        setResult({ ok: true, msg: `Order placed: ${side.toUpperCase()} ${qty} ${sym.split('/')[0]}` })
        setQty('')
      } else {
        haptic('light')
        setResult({ ok: false, msg: data.detail || 'Order failed' })
      }
    } catch {
      setResult({ ok: false, msg: 'Network error' })
    } finally {
      setLoading(false)
    }
  }

  const isUp = (change ?? 0) >= 0
  const coin = sym.split('/')[0]
  const usdValue = price && qty ? (parseFloat(qty) * price).toFixed(2) : null

  return (
    <>
      <div className="m-trade-overlay" onClick={onClose} />
      <div className="m-trade-sheet">
        <div className="m-trade-handle" />

        {/* Header */}
        <div className="m-trade-header">
          <div>
            <div className="m-trade-sym-row">
              <span className="m-trade-sym">{sym}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
              <span className="m-trade-price">{fmtPrice(price)}</span>
              <span className={`m-trade-chg ${isUp ? 'up' : 'down'}`}>
                {change != null ? `${isUp ? '+' : ''}${change.toFixed(2)}%` : ''}
              </span>
            </div>
          </div>
          <button className="m-trade-close" onClick={onClose}>✕</button>
        </div>

        <div className="m-trade-body">
          {!connected ? (
            <div className="m-connect-prompt">
              <div className="m-connect-icon">🔌</div>
              <div className="m-connect-title">No Exchange Connected</div>
              <div className="m-connect-desc">
                Connect your exchange API keys in Settings to enable trading.
              </div>
              <button className="m-connect-btn" onClick={() => { haptic('light'); onClose() }}>
                Go to Settings
              </button>
            </div>
          ) : (
            <>
              {/* Symbol selector */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
                {SYMBOLS.map(s => (
                  <button key={s}
                    style={{
                      padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      background: sym === s ? 'var(--green-dim)' : 'var(--card)',
                      border: sym === s ? '1px solid var(--green)' : '1px solid var(--border)',
                      color: sym === s ? 'var(--green)' : 'var(--text-2)', transition: 'all 0.15s'
                    }}
                    onClick={() => { haptic('light'); setSym(s); setQty(''); setResult(null) }}>
                    {s.split('/')[0]}
                  </button>
                ))}
              </div>

              {/* Buy / Sell toggle */}
              <div className="m-side-toggle">
                <button className={`m-side-btn buy ${side === 'buy' ? 'active' : ''}`}
                  onClick={() => { haptic('light'); setSide('buy'); setResult(null) }}>
                  Buy
                </button>
                <button className={`m-side-btn sell ${side === 'sell' ? 'active' : ''}`}
                  onClick={() => { haptic('light'); setSide('sell'); setResult(null) }}>
                  Sell
                </button>
              </div>

              {/* Quantity input */}
              <div className="m-trade-field">
                <div className="m-trade-label">Quantity ({coin})</div>
                <div className="m-trade-input-wrap">
                  <input
                    className="m-trade-input"
                    type="number"
                    placeholder="0.00"
                    value={qty}
                    onChange={e => { setQty(e.target.value); setResult(null) }}
                    inputMode="decimal"
                  />
                  <span className="m-trade-input-unit">{coin}</span>
                </div>
                <div className="m-trade-pcts">
                  {PCTS.map(p => (
                    <button key={p} className="m-trade-pct" onClick={() => pctClick(p)}>{p}</button>
                  ))}
                </div>
              </div>

              {/* Order summary */}
              <div className="m-trade-info">
                <div className="m-trade-info-row">
                  <span className="m-trade-info-key">Market Price</span>
                  <span className="m-trade-info-val">{fmtPrice(price)}</span>
                </div>
                <div className="m-trade-info-row">
                  <span className="m-trade-info-key">Order Value</span>
                  <span className="m-trade-info-val">{usdValue ? `$${Number(usdValue).toLocaleString()}` : '—'}</span>
                </div>
                <div className="m-trade-info-row">
                  <span className="m-trade-info-key">Available</span>
                  <span className="m-trade-info-val">
                    {balance != null ? `$${Number(balance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                  </span>
                </div>
                <div className="m-trade-info-row">
                  <span className="m-trade-info-key">Type</span>
                  <span className="m-trade-info-val">Market Order</span>
                </div>
              </div>

              {/* Result message */}
              {result && (
                <div style={{
                  padding: '12px 14px', borderRadius: 10, marginBottom: 16, fontSize: 13, fontWeight: 600,
                  background: result.ok ? 'var(--green-dim)' : 'var(--red-dim)',
                  color: result.ok ? 'var(--green)' : 'var(--red)',
                  border: `1px solid ${result.ok ? 'var(--green-glow)' : 'rgba(244,63,94,0.2)'}`
                }}>
                  {result.ok ? '✓ ' : '✗ '}{result.msg}
                </div>
              )}

              {/* Execute */}
              <button
                className={`m-trade-exec ${side}`}
                onClick={execute}
                disabled={!qty || loading || !price}
              >
                {loading
                  ? <span className="m-spinner" style={{ borderTopColor: side === 'buy' ? '#09090b' : '#fff' }} />
                  : `${side === 'buy' ? 'Buy' : 'Sell'} ${coin}`
                }
              </button>
            </>
          )}
        </div>
      </div>
    </>
  )
}
