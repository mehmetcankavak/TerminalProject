import { useEffect, useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'

// Order ticket for the terminal: builds the same `long/short <symbol> <collateral> <lev>`
// command the console uses; TP/SL ride on the bracket state so the risk guard still applies.
const fmt = (n, d = 2) => n == null || !Number.isFinite(n) ? '—' : n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })

export default function OrderPanel({ chartSymbol, tickers, tradeBalance, leverages, sendOrder, cmdLoading, bracketTP, setBracketTP, bracketSL, setBracketSL, setBracketMode }) {
  const [side, setSide] = useState('buy')
  const [type, setType] = useState('market')
  const [size, setSize] = useState(() => String(Math.min(tradeBalance || 10000, 10000)))
  const [leverage, setLeverage] = useState(String(leverages?.[1] || 10))
  const [limitPrice, setLimitPrice] = useState('')

  const price = tickers?.[chartSymbol]?.last_price
  const base = String(chartSymbol || '').replace(/USDT$/i, '')
  const sizeNum = parseFloat(size) || 0
  const levNum = parseFloat(leverage) || 1
  const entry = type === 'market' ? price : (parseFloat(limitPrice) || price)
  const notional = sizeNum * levNum
  const fee = notional * 0.001
  const liq = entry ? (side === 'buy' ? entry * (1 - 1 / levNum + 0.004) : entry * (1 + 1 / levNum - 0.004)) : null
  const levOptions = useMemo(() => [...new Set([1, 2, 3, 5, 10, 15, 20, 25, 50, ...(leverages || [])])].sort((a, b) => a - b), [leverages])

  useEffect(() => { if (price && !limitPrice) setLimitPrice(price.toFixed(price < 10 ? 4 : 2)) }, [price]) // eslint-disable-line react-hooks/exhaustive-deps

  // TP/SL are only sent when the bracket is armed; arm it whenever either field has a value.
  useEffect(() => { setBracketMode(Boolean(parseFloat(bracketTP) > 0 || parseFloat(bracketSL) > 0)) }, [bracketTP, bracketSL, setBracketMode])

  const submit = () => {
    if (!sizeNum || sizeNum < 10) return
    sendOrder(chartSymbol, side, sizeNum, levNum)
  }

  return (
    <div className="ws-card op-panel">
      <div className="op-side">
        <button className={side === 'buy' ? 'active' : ''} onClick={() => setSide('buy')}>Long</button>
        <button className={side === 'sell' ? 'active short' : ''} onClick={() => setSide('sell')}>Short</button>
      </div>
      <div className="op-body">
        <div className="ws-seg op-type">
          {[['market', 'Market'], ['limit', 'Limit'], ['stop', 'Stop']].map(([k, l]) => <button key={k} className={type === k ? 'active' : ''} onClick={() => setType(k)} disabled={k === 'stop'} title={k === 'stop' ? 'Use `stop` from the console' : ''}>{l}</button>)}
        </div>

        <div className="ws-field"><label>Size (USDT)</label><input className="ws-input ws-mono" type="number" min="10" value={size} onChange={e => setSize(e.target.value)} /></div>
        <div className="op-pct">{[25, 50, 75, 100].map(p => <button key={p} className={`ws-pill ws-pill-sm ${Math.round((sizeNum / (tradeBalance || 1)) * 100) === p ? 'active' : ''}`} onClick={() => setSize(String(Math.floor((tradeBalance || 0) * p / 100)))}>{p}%</button>)}</div>

        <div className="ws-field"><label>Leverage</label>
          <div className="ws-inline-select" style={{ width: '100%' }}>{leverage}x <ChevronDown size={14} style={{ marginLeft: 'auto' }} />
            <select value={leverage} onChange={e => setLeverage(e.target.value)}>{levOptions.map(l => <option key={l} value={l}>{l}x</option>)}</select>
          </div>
        </div>

        <div className="ws-field"><label>Entry Price (USDT)</label><input className="ws-input ws-mono" type="number" value={type === 'market' ? (price ? price.toFixed(price < 10 ? 4 : 2) : '') : limitPrice} disabled={type === 'market'} onChange={e => setLimitPrice(e.target.value)} placeholder="Market" /></div>
        <div className="ws-field"><label>Take Profit (USDT)</label><input className="ws-input ws-mono" type="number" value={bracketTP} onChange={e => setBracketTP(e.target.value)} placeholder={entry ? fmt(entry * (side === 'buy' ? 1.05 : 0.95)) : '—'} /></div>
        <div className="ws-field"><label>Stop Loss (USDT)</label><input className="ws-input ws-mono" type="number" value={bracketSL} onChange={e => setBracketSL(e.target.value)} placeholder={entry ? fmt(entry * (side === 'buy' ? 0.97 : 1.03)) : '—'} /></div>

        <div className="op-summary">
          <div><span>Est. Liq. Price</span><b>{fmt(liq)}</b></div>
          <div><span>Required Margin</span><b>{fmt(sizeNum)} USDT</b></div>
          <div><span>Est. Fee (0.1%)</span><b>{fmt(fee)} USDT</b></div>
          <div><span>Position Value</span><b>{fmt(notional)} USDT</b></div>
        </div>

        {type === 'limit' && <div className="ws-note ws-note-warn ws-small">Limit entries are placed as market orders once price reaches the entry via the console (`limit` command). This ticket sends at market.</div>}
        <button className={`ws-btn ws-btn-lg ws-btn-block ${side === 'buy' ? 'ws-btn-success' : 'op-sell-btn'}`} onClick={submit} disabled={cmdLoading || !sizeNum || !price}>
          {cmdLoading ? 'Sending…' : side === 'buy' ? `Buy / Long ${base}` : `Sell / Short ${base}`}
        </button>
      </div>
    </div>
  )
}
