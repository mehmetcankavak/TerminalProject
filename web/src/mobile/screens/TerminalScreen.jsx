import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useWebSocket } from '../../hooks/useWebSocket'
import { haptic, sendNewsNotification, secureGet } from '../../capacitor'
import ConnectHLModalMobile from '../ConnectHLModalMobile'
import LiveTicker from '../LiveTicker'
import { API_BASE } from '../../config'
import { useAccount } from 'wagmi'

// ─── Priority
const PRIO = {
  HIGH:   { text: '#ff3b5c', border: 'rgba(255,59,92,0.15)', bg: 'rgba(255,59,92,0.03)', badge: 'rgba(255,59,92,0.15)' },
  MEDIUM: { text: '#e5a236', border: 'rgba(229,162,54,0.15)', bg: 'rgba(229,162,54,0.03)', badge: 'rgba(229,162,54,0.15)' },
  MED:    { text: '#e5a236', border: 'rgba(229,162,54,0.15)', bg: 'rgba(229,162,54,0.03)', badge: 'rgba(229,162,54,0.15)' },
  LOW:    { text: '#a1a1aa', border: 'var(--border)', bg: 'rgba(255,255,255,0.01)', badge: 'rgba(255,255,255,0.05)' },
}

// ─── Event type badges
const EVT = {
  listing:    { label: 'LIST',    color: '#00d992' },
  delisting:  { label: 'DELIST', color: '#f43f5e' },
  exploit:    { label: 'HACK',   color: '#f43f5e' },
  regulation: { label: 'REG',    color: '#f59e0b' },
  macro:      { label: 'MACRO',  color: '#f59e0b' },
  product:    { label: 'PROD',   color: '#c084fc' },
  funding:    { label: 'FUND',   color: '#34d399' },
  operations: { label: 'OPS',    color: '#7dd3fc' },
  general:    { label: 'NEWS',   color: '#6b7280' },
}

const LOG_COLORS = {
  info: '#a1a1aa', success: '#00d992', error: '#f43f5e',
  warning: '#f59e0b', risk: '#f59e0b', trade: '#00d992', system: '#a1a1aa',
}

const FILTERS = [
  { key: 'all',      label: 'All' },
  { key: 'high',     label: 'Critical' },
  { key: 'official', label: 'Official' },
  { key: 'listing',  label: 'Listing' },
  { key: 'exploit',  label: 'Hack' },
]

const QUICK_CMDS = ['status', 'pos', 'balance', 'close all', 'help']

function timeAgo(ts) {
  if (!ts) return ''
  const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000)
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  return `${Math.floor(s / 3600)}h`
}

function fmtSize(balance, lev) {
  const pos = Math.floor(balance * lev)
  return pos >= 1000 ? `$${(pos / 1000).toFixed(1)}K` : `$${pos}`
}

function fmtAmt(val) {
  if (val >= 1000) return `${+(val / 1000).toFixed(1)}K`
  return String(val)
}

const _decodeEl = typeof document !== 'undefined' ? document.createElement('textarea') : null
function decodeEntities(str) {
  if (!_decodeEl) return str
  _decodeEl.innerHTML = str
  return _decodeEl.value
}

function cleanHeadline(text) {
  if (!text) return ''
  let t = decodeEntities(text)
  return t
    // Retweet prefix "RT @handle:"
    .replace(/^RT\s+@\w+:\s*/i, '')
    // Repeated same emoji (3+ → 1)
    .replace(/([\u{1F300}-\u{1FAFF}])\1{2,}/gu, '$1')
    .replace(/([\u{2600}-\u{27BF}])\1{2,}/gu, '$1')
    // Repeated ! or ? (more than 2)
    .replace(/([!?]){3,}/g, '$1$1')
    // Markdown bold/italic artifacts
    .replace(/\*{1,3}(.*?)\*{1,3}/g, '$1')
    .replace(/_{1,2}(.*?)_{1,2}/g, '$1')
    // Raw URLs in text
    .replace(/https?:\/\/\S+/g, '')
    // Collapse multiple spaces
    .replace(/\s{2,}/g, ' ')
    .trim()
}

// ─── Single news card (swipeable)
function NewsCard({ item, leverages, tradeBalance, onOrder, onTrade, tickers }) {
  const prio = PRIO[item.priority] || PRIO.LOW
  const overrideKey = `nt_sym_override_${item.id || item.headline || 'x'}`
  const [symOverride, setSymOverride] = useState(() => {
    try { return localStorage.getItem(overrideKey) || '' } catch { return '' }
  })
  useEffect(() => {
    try {
      if (symOverride) localStorage.setItem(overrideKey, symOverride)
      else localStorage.removeItem(overrideKey)
    } catch {}
  }, [symOverride, overrideKey])

  const sourceName = item.source || item.source_name || '@news'
  let displaySource = sourceName.startsWith('@') ? sourceName : `@${sourceName.toLowerCase().replace(/\s+/g, '')}`
  if (displaySource.length > 20) displaySource = displaySource.substring(0, 20)

  const sym = useMemo(() => {
    const mentioned = item.mentioned_assets || []
    if (item.primary_symbol) {
      const ma = mentioned.find(m => m.asset_id === item.primary_asset_id)
      if (ma && ma.tradable_symbols?.length) return ma.tradable_symbols[0]
      if (item.primary_symbol) return item.primary_symbol
    }
    const direct = mentioned.find(m =>
      m.tradable_symbols?.length > 0 &&
      !['theme_primary','theme_secondary'].includes(m.match_type)
    )
    if (direct) return direct.tradable_symbols[0]
    return (Array.isArray(item.symbols) ? item.symbols[0] : item.symbols) || ''
  }, [item])

  const activeSym = symOverride ? (symOverride.toUpperCase().endsWith('USDT') ? symOverride.toUpperCase() : symOverride.toUpperCase() + 'USDT') : sym
  const dispSym = activeSym ? activeSym.replace(/USDT$/i, '') : ''

  const ambiguous = useMemo(() => {
    if (symOverride) return false
    const mentioned = item.mentioned_assets || []
    const tradable = mentioned.filter(m =>
      m.tradable_symbols?.length > 0 &&
      !['theme_primary','theme_secondary'].includes(m.match_type)
    )
    return new Set(tradable.map(m => m.asset_id)).size > 1
  }, [item, symOverride])

  const tags = useMemo(() => {
    const t = []
    if (item.event_type) {
      const e = EVT[item.event_type]
      if (e) t.push({ label: e.label, color: e.color, bg: `${e.color}22` })
    }
    if (item.source_tier === 'official') t.push({ label: 'OFFICIAL', color: '#00d992', bg: 'rgba(0,217,146,0.15)' })
    ;(item.mentioned_assets || []).forEach(ma => {
      if (ma.match_type === 'theme_primary' || ma.match_type === 'theme_secondary')
        t.push({ label: ma.asset_id.toLowerCase(), color: '#888', bg: '#222' })
    })
    return t
  }, [item])

  const ticker = activeSym ? tickers[activeSym] : null
  const price = ticker?.last_price ? Number(ticker.last_price).toLocaleString('en-US', { maximumFractionDigits: 2 }) : '—'
  const chg = ticker?.change_24h_pct ?? 0
  const isUp = chg >= 0

  return (
    <div style={{
      background: prio.bg, border: `1px solid ${prio.border}`,
      borderRadius: 14, padding: '14px 16px', marginBottom: 10,
      display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0, overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <div style={{ width: 20, height: 20, borderRadius: 6, background: prio.badge, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: prio.text }}>
          {displaySource.replace('@','')[0]?.toUpperCase() || 'N'}
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', flexShrink: 0, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {sourceName}
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-3)', flexShrink: 0 }}>
          {timeAgo(item.received_at || item.published_at)}
        </span>
      </div>

      {/* Headline */}
      <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.4, color: '#ffffff', wordBreak: 'break-word', overflowWrap: 'break-word' }}>
        {cleanHeadline(item.headline || item.title)}
      </div>

      {/* Embedded Terminal/Trade Box */}
      <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: 12, marginTop: 4 }}>
        {/* Token input row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 14, height: 14, borderRadius: '50%', background: '#fff', color: '#000', fontSize: 9, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>$</div>
            <input
              value={symOverride || dispSym}
              onChange={e => setSymOverride(e.target.value)}
              placeholder="TOKEN"
              autoCorrect="off" autoCapitalize="characters" spellCheck={false}
              style={{ background: 'none', border: 'none', outline: 'none', fontSize: 14, fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--text)', width: 80, padding: 0 }}
            />
            {ticker && (
              <span style={{ fontSize: 11, fontWeight: 600, color: isUp ? '#00d992' : '#f43f5e', background: isUp ? 'rgba(0,217,146,0.1)' : 'rgba(244,63,94,0.1)', padding: '2px 6px', borderRadius: 4 }}>
                {isUp ? '+' : ''}{chg.toFixed(2)}%
              </span>
            )}
          </div>
          <div style={{ fontSize: 14, fontWeight: 800, fontFamily: 'var(--mono)' }}>
            {ticker ? `$${price}` : ''}
          </div>
        </div>

        {/* Trade buttons */}
        {ambiguous ? (
          <div style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', fontSize: 11, color: '#f59e0b', fontWeight: 600, lineHeight: 1.4 }}>
            ⚠ Multiple coins detected — enter the symbol in the box above to trade
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {leverages.map(lev => (
                <button key={'l'+lev}
                  onClick={() => { haptic('heavy'); onOrder(activeSym, 'buy', lev) }}
                  disabled={!activeSym}
                  style={{ flex: 1, padding: '6px 0', borderRadius: 6, border: '1px solid rgba(0,217,146,0.2)', background: activeSym ? 'rgba(0,217,146,0.08)' : 'rgba(255,255,255,0.03)', color: activeSym ? '#00d992' : '#444', fontSize: 11, fontWeight: 700, cursor: activeSym ? 'pointer' : 'not-allowed', fontFamily: 'var(--mono)' }}>
                  {fmtAmt(tradeBalance * lev)}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {leverages.map(lev => (
                <button key={'s'+lev}
                  onClick={() => { haptic('heavy'); onOrder(activeSym, 'sell', lev) }}
                  disabled={!activeSym}
                  style={{ flex: 1, padding: '6px 0', borderRadius: 6, border: '1px solid rgba(244,63,94,0.2)', background: activeSym ? 'rgba(244,63,94,0.08)' : 'rgba(255,255,255,0.03)', color: activeSym ? '#f43f5e' : '#444', fontSize: 11, fontWeight: 700, cursor: activeSym ? 'pointer' : 'not-allowed', fontFamily: 'var(--mono)' }}>
                  {fmtAmt(tradeBalance * lev)}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer: Tags & Stats */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {tags.map((t, i) => (
            <span key={i} style={{
              fontSize: 10, fontWeight: 700, color: t.color, background: t.bg,
              padding: '2px 6px', borderRadius: 4, letterSpacing: 0.5,
            }}>
              {t.label}
            </span>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-3)', fontSize: 11, marginLeft: 4 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
            {timeAgo(item.received_at || item.published_at)}
            {item.received_at && item.published_at && (() => {
              const latMs = new Date(item.received_at).getTime() - new Date(item.published_at).getTime()
              if (latMs > 0 && latMs < 300_000) {
                const latS = (latMs / 1000).toFixed(1)
                return (
                  <>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginLeft: 6 }}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
                    {latS}s
                  </>
                )
              }
              return null
            })()}
          </div>
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-3)' }}>
          Source: {displaySource}
        </div>
      </div>
    </div>
  )
}

// ─── Settings sheet (size + leverages + TP/SL)
function SettingsSheet({ tradeBalance, setTradeBalance, leverages, setLeverages, tpPct, setTpPct, slPct, setSlPct, riskMode, setRiskMode, riskPct, setRiskPct, hlEquity, onClose }) {
  const [bal, setBal] = useState(String(tradeBalance))
  const [levs, setLevs] = useState(leverages.map(String))
  const [tp, setTp] = useState(String(tpPct))
  const [sl, setSl] = useState(String(slPct))
  const [rMode, setRMode] = useState(riskMode)
  const [rPct, setRPct] = useState(String(riskPct))

  const save = () => {
    if (!rMode) {
      const b = parseFloat(bal)
      if (!isNaN(b) && b > 0) { setTradeBalance(b); localStorage.setItem('nt_trade_balance', b) }
    }
    const ls = levs.map(v => parseInt(v)).filter(v => !isNaN(v) && v >= 1 && v <= 50)
    if (ls.length === 3) { setLeverages(ls); localStorage.setItem('nt_leverages', JSON.stringify(ls)) }
    const tpVal = parseFloat(tp)
    if (!isNaN(tpVal) && tpVal >= 0) { setTpPct(tpVal); localStorage.setItem('nt_tp_pct', tpVal) }
    const slVal = parseFloat(sl)
    if (!isNaN(slVal) && slVal >= 0) { setSlPct(slVal); localStorage.setItem('nt_sl_pct', slVal) }
    setRiskMode(rMode); localStorage.setItem('nt_risk_mode', String(rMode))
    const rpVal = parseFloat(rPct)
    if (!isNaN(rpVal) && rpVal > 0) { setRiskPct(rpVal); localStorage.setItem('nt_risk_pct', rpVal) }
    onClose()
  }

  // Preview effective size in risk mode
  const riskPreview = (() => {
    if (!rMode || !hlEquity) return null
    const rp = parseFloat(rPct)
    const slVal = parseFloat(sl)
    if (isNaN(rp) || rp <= 0) return null
    if (slVal > 0) {
      return (hlEquity * rp / 100) / (slVal / 100)
    }
    return hlEquity * rp / 100
  })()

  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 100,
      background: 'var(--bg-2)', borderTop: '1px solid var(--border)',
      borderRadius: '20px 20px 0 0', padding: '20px 20px 36px',
      boxShadow: '0 -20px 60px rgba(0,0,0,0.5)',
    }}>
      <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border)', margin: '0 auto 20px' }} />
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Trade Settings</div>

      {/* Size */}
      {/* Size Mode Toggle */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, letterSpacing: 0.6 }}>
            {rMode ? 'RISK MODE (% OF ACCOUNT)' : 'FIXED SIZE ($)'}
          </div>
          <button
            onClick={() => setRMode(v => !v)}
            style={{
              padding: '3px 10px', borderRadius: 20, border: 'none', fontSize: 10, fontWeight: 800,
              background: rMode ? 'rgba(0,217,146,0.2)' : 'rgba(255,255,255,0.08)',
              color: rMode ? '#00d992' : '#888', cursor: 'pointer', letterSpacing: 0.5,
            }}>
            {rMode ? 'RISK' : 'FIXED'}
          </button>
        </div>

        {rMode ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                value={rPct}
                onChange={e => setRPct(e.target.value)}
                type="number" min={0.1} max={10} step={0.1}
                style={{
                  flex: 1, background: 'var(--bg-3)', border: '1px solid rgba(0,217,146,0.3)',
                  borderRadius: 10, padding: '10px 14px', color: 'var(--text)',
                  fontSize: 16, fontFamily: 'var(--mono)', boxSizing: 'border-box',
                }}
              />
              <span style={{ fontSize: 15, fontWeight: 800, color: '#00d992' }}>% risk</span>
            </div>
            {riskPreview != null && (
              <div style={{ fontSize: 11, color: '#00d992', marginTop: 6 }}>
                ≈ ${riskPreview.toFixed(0)} margin ({hlEquity ? `$${hlEquity.toFixed(0)} account` : '?'})
              </div>
            )}
            {!hlEquity && (
              <div style={{ fontSize: 10, color: '#888', marginTop: 4 }}>
                Connect to Hyperliquid to use account balance
              </div>
            )}
          </div>
        ) : (
          <input
            value={bal}
            onChange={e => setBal(e.target.value)}
            type="number"
            style={{
              width: '100%', background: 'var(--bg-3)', border: '1px solid var(--border)',
              borderRadius: 10, padding: '10px 14px', color: 'var(--text)',
              fontSize: 16, fontFamily: 'var(--mono)', boxSizing: 'border-box',
            }}
          />
        )}
      </div>

      {/* Leverages */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, letterSpacing: 0.6, marginBottom: 8 }}>LEVERAGE (3 SLOTS)</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {levs.map((v, i) => (
            <div key={i} style={{ flex: 1 }}>
              <input
                value={v}
                onChange={e => setLevs(ls => ls.map((x, j) => j === i ? e.target.value : x))}
                type="number" min={1} max={50}
                placeholder={`Slot ${i+1}`}
                style={{
                  width: '100%', background: 'var(--bg-3)',
                  border: `1px solid ${(parseInt(v) >= 1 && parseInt(v) <= 50) ? 'var(--border)' : 'rgba(255,59,92,0.4)'}`,
                  borderRadius: 10, padding: '10px 10px', color: 'var(--text)',
                  fontSize: 15, fontFamily: 'var(--mono)', textAlign: 'center', boxSizing: 'border-box',
                }}
              />
              <div style={{ fontSize: 10, color: 'var(--text-3)', textAlign: 'center', marginTop: 4 }}>
                {!isNaN(parseInt(v)) && !isNaN(parseFloat(bal)) ? fmtSize(parseFloat(bal), parseInt(v)) : '—'}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* TP / SL */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, letterSpacing: 0.6, marginBottom: 8 }}>
          DEFAULT TP / SL (%) — 0 = disabled
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: '#00d992', marginBottom: 4 }}>Take Profit %</div>
            <input
              value={tp}
              onChange={e => setTp(e.target.value)}
              type="number" min={0} max={500} step={0.5}
              style={{
                width: '100%', background: 'var(--bg-3)',
                border: `1px solid ${parseFloat(tp) > 0 ? 'rgba(0,217,146,0.4)' : 'var(--border)'}`,
                borderRadius: 10, padding: '10px 10px', color: 'var(--text)',
                fontSize: 15, fontFamily: 'var(--mono)', textAlign: 'center', boxSizing: 'border-box',
              }}
            />
            {parseFloat(tp) > 0 && <div style={{ fontSize: 10, color: '#00d992', textAlign: 'center', marginTop: 4 }}>+%{tp}</div>}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: '#f43f5e', marginBottom: 4 }}>Stop Loss %</div>
            <input
              value={sl}
              onChange={e => setSl(e.target.value)}
              type="number" min={0} max={100} step={0.5}
              style={{
                width: '100%', background: 'var(--bg-3)',
                border: `1px solid ${parseFloat(sl) > 0 ? 'rgba(244,63,94,0.4)' : 'var(--border)'}`,
                borderRadius: 10, padding: '10px 10px', color: 'var(--text)',
                fontSize: 15, fontFamily: 'var(--mono)', textAlign: 'center', boxSizing: 'border-box',
              }}
            />
            {parseFloat(sl) > 0 && <div style={{ fontSize: 10, color: '#f43f5e', textAlign: 'center', marginTop: 4 }}>-%{sl}</div>}
          </div>
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 6, lineHeight: 1.4 }}>
          These percentages are automatically appended as TP/SL on every order.
        </div>
      </div>

      <button onClick={save} style={{
        width: '100%', padding: 14, borderRadius: 14, border: 'none',
        background: 'var(--green)', color: '#09090b', fontSize: 15, fontWeight: 700, cursor: 'pointer',
      }}>Save</button>
    </div>
  )
}

// ─── Main
export default function TerminalScreen() {
  const { token } = useAuth()
  const { address: walletAddress, isConnected: walletConnected } = useAccount()

  const [news, setNews]             = useState([])
  const [tickers, setTickers]       = useState({})
  const [connected, setConnected]   = useState(false)
  const [logs, setLogs]             = useState([])
  const [input, setInput]           = useState('')
  const [cmdLoading, setCmdLoading] = useState(false)
  const [kbOpen, setKbOpen]         = useState(false)
  const [filter, setFilter]         = useState('all')
  const [showSettings, setShowSettings] = useState(false)
  const [showHLConnect, setShowHLConnect] = useState(false)
  const [pendingOrder, setPendingOrder] = useState(null) // { cmd, timer }
  const pendingRef = useRef(null)
  const [hlMode, setHlMode]         = useState('PAPER')   // 'PAPER' | 'LIVE'
  const [hlWallet, setHlWallet]     = useState('')

  // Persisted settings
  const [tradeBalance, setTradeBalance] = useState(() => {
    try { return parseFloat(localStorage.getItem('nt_trade_balance')) || 500 } catch { return 500 }
  })
  const [leverages, setLeverages] = useState(() => {
    try { return JSON.parse(localStorage.getItem('nt_leverages')) || [5, 10, 20] } catch { return [5, 10, 20] }
  })
  const [tpPct, setTpPct] = useState(() => {
    try { return parseFloat(localStorage.getItem('nt_tp_pct')) || 0 } catch { return 0 }
  })
  const [slPct, setSlPct] = useState(() => {
    try { return parseFloat(localStorage.getItem('nt_sl_pct')) || 0 } catch { return 0 }
  })
  const [riskMode, setRiskMode] = useState(() => {
    try { return localStorage.getItem('nt_risk_mode') === 'true' } catch { return false }
  })
  const [riskPct, setRiskPct] = useState(() => {
    try { return parseFloat(localStorage.getItem('nt_risk_pct')) || 1 } catch { return 1 }
  })
  const [hlEquity, setHlEquity] = useState(null)

  const inputRef = useRef(null)
  const logRef   = useRef(null)
  const feedRef  = useRef(null)
  const addedIds = useRef(new Set())

  useEffect(() => {
    const onRetap = (e) => {
      if (e.detail?.tab === 'terminal') {
        feedRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
      }
    }
    window.addEventListener('tt-tab-retap', onRetap)
    return () => window.removeEventListener('tt-tab-retap', onRetap)
  }, [])

  const addLog = useCallback((text, style = 'info') => {
    setLogs(prev => [...prev.slice(-199), { text, style, ts: Date.now() }])
    setTimeout(() => logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' }), 30)
  }, [])

  // ── WebSocket
  // Indicator stability — kısa kopuş/reconnect'ler kullanıcıya gösterilmez.
  // Sadece 30sn'den uzun süre offline ya da ilk bağlantı log'lanır.
  const disconnectTimer = useRef(null)
  const hasConnectedOnce = useRef(false)
  const handleWsMessage = useCallback((msg) => {
    if (msg.type === 'ws_connected') {
      clearTimeout(disconnectTimer.current)
      setConnected(true)
      if (!hasConnectedOnce.current) {
        hasConnectedOnce.current = true
        addLog('● Connected', 'success')
      }
      // Reconnect log'u suppress (sadece offline'dan stable'a dönüş)
      return
    }
    if (msg.type === 'ws_disconnected') {
      // Debounce: kısa kopuş + hızlı reconnect'lerde indikatör titremesin.
      // 30 saniye boyunca bağlanmazsa gerçek disconnect say.
      clearTimeout(disconnectTimer.current)
      disconnectTimer.current = setTimeout(() => {
        setConnected(false)
        addLog('○ Disconnected — reconnecting...', 'warning')
      }, 30_000)
      return
    }
    if (msg.type === 'ticker') {
      setTickers(prev => ({ ...prev, [msg.symbol]: msg }))
      return
    }
    if (msg.type === 'news') {
      const id = msg.id || msg.headline
      if (!id || addedIds.current.has(id)) return
      addedIds.current.add(id)
      setNews(prev => [msg, ...prev].slice(0, 300))
      if (msg.priority === 'HIGH') haptic('medium')
      const headline = cleanHeadline(msg.headline || msg.title || '')
      const sym = (Array.isArray(msg.symbols) ? msg.symbols[0] : msg.symbols) || msg.primary_symbol || ''
      sendNewsNotification({
        title: sym ? `${sym.replace(/USDT$/i,'')} · ${msg.priority === 'HIGH' ? '🔴 CRITICAL' : 'News'}` : '📡 New',
        body: headline.slice(0, 120),
        priority: msg.priority || 'LOW',
      })
      return
    }
  }, [addLog])

  useWebSocket(handleWsMessage, ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'], { token })

  // ── HL agent state — listen for connection events
  useEffect(() => {
    const onConnected = (ev) => {
      const d = ev?.detail
      if (!d?.ok) return
      setHlMode('LIVE')
      setHlWallet(d.hl_wallet || '')
      if (d.balance?.total != null) setHlEquity(d.balance.total)
      addLog(`[HL] Connected — ${(d.hl_wallet || '').slice(0,6)}…${(d.hl_wallet || '').slice(-4)} | balance $${d.balance?.total?.toFixed?.(2) ?? '?'}`, 'success')
    }
    window.addEventListener('tt-hl-agent-connected', onConnected)
    return () => window.removeEventListener('tt-hl-agent-connected', onConnected)
  }, [addLog])

  // ── Auto-restore HL agent from secure storage on mount.
  // 500 ms defer: Capacitor Preferences batching + auth context propagation için tolerans.
  useEffect(() => {
    if (!token || hlMode === 'LIVE') return
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const saved = await secureGet('tt_hl_agent_v1')
        if (cancelled) return
        if (!saved?.agent_private_key || !saved?.main_wallet_address) return
        const res = await fetch(`${API_BASE}/api/connect-hl-agent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            agent_private_key: saved.agent_private_key,
            main_wallet_address: saved.main_wallet_address,
            testnet: Boolean(saved.testnet),
          }),
        })
        if (cancelled) return
        const d = await res.json().catch(() => null)
        if (d?.ok) {
          window.dispatchEvent(new CustomEvent('tt-hl-agent-connected', { detail: d }))
        } else {
          console.warn('[TerminalScreen] HL agent restore failed:', d?.error)
        }
      } catch (err) {
        console.warn('[TerminalScreen] HL agent restore error:', err.message || err)
      }
    }, 500)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [token, hlMode])

  // ── Açılışta REST'ten mevcut haberleri çek
  useEffect(() => {
    if (!token) return
    fetch(`${API_BASE}/api/status`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data?.news?.length) return
        const seen  = new Set()
        const fresh = []
        for (const item of [...data.news].reverse()) {
          const id = item.id || item.headline
          if (id && !seen.has(id)) { seen.add(id); fresh.push(item) }
        }
        addedIds.current = seen
        setNews(fresh.slice(0, 300))
      })
      .catch(() => {})
  }, [token])

  // ── Keyboard visibility
  useEffect(() => {
    const el = inputRef.current
    const onFocus = () => setKbOpen(true)
    const onBlur  = () => setKbOpen(false)
    el?.addEventListener('focus', onFocus)
    el?.addEventListener('blur', onBlur)
    return () => { el?.removeEventListener('focus', onFocus); el?.removeEventListener('blur', onBlur) }
  }, [])

  // ── Execute command
  const executeCommand = useCallback(async (cmd) => {
    const trimmed = cmd.trim()
    if (!trimmed || cmdLoading) return
    addLog(`$ ${trimmed}`, 'info')
    setInput('')
    setCmdLoading(true)
    haptic('light')
    try {
      const res = await fetch(`${API_BASE}/api/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ command: trimmed }),
      })
      const data = await res.json()
      if (data.results?.length) {
        data.results.forEach(r => addLog(r.text, r.style || 'info'))
      } else if (data.detail) {
        addLog(data.detail, 'error')
      }
    } catch {
      addLog('Connection error', 'error')
    } finally {
      setCmdLoading(false)
    }
  }, [token, cmdLoading, addLog])

  // ── Send order with 3s undo window
  const sendOrder = useCallback((symbol, side, leverage) => {
    if (hlMode !== 'LIVE') {
      addLog('⚠ Hyperliquid not connected — tap the LIVE/PAPER button to set up the agent', 'warning')
      haptic('heavy')
      setShowHLConnect(true)
      return
    }
    const dir = side === 'buy' ? 'long' : 'short'

    // Risk mode: size = equity × riskPct% / slPct% (if sl set), else equity × riskPct%
    let effectiveSize = tradeBalance
    if (riskMode && hlEquity && riskPct > 0) {
      if (slPct > 0) {
        effectiveSize = Math.round((hlEquity * riskPct / 100) / (slPct / 100))
      } else {
        effectiveSize = Math.round(hlEquity * riskPct / 100)
      }
    }

    // Backend expects sl/tp as absolute prices, not percentages
    const currentPrice = tickers[symbol]?.last_price ? Number(tickers[symbol].last_price) : null
    const isLong = side === 'buy'

    let cmd = `${dir} ${symbol} ${effectiveSize} ${leverage}`
    if (tpPct > 0 && currentPrice) {
      const tpPrice = isLong
        ? currentPrice * (1 + tpPct / 100)
        : currentPrice * (1 - tpPct / 100)
      cmd += ` tp=${tpPrice.toFixed(2)}`
    }
    if (slPct > 0 && currentPrice) {
      const slPrice = isLong
        ? currentPrice * (1 - slPct / 100)
        : currentPrice * (1 + slPct / 100)
      cmd += ` sl=${slPrice.toFixed(2)}`
    }

    // Cancel any existing pending order
    if (pendingRef.current) {
      clearTimeout(pendingRef.current.timer)
    }

    haptic('heavy')
    addLog(`⏳ ${cmd} — you have 3s to cancel`, 'warning')

    const timer = setTimeout(() => {
      setPendingOrder(null)
      pendingRef.current = null
      addLog(`→ ${cmd}`, 'trade')
      executeCommand(cmd)
    }, 3000)

    const order = { cmd, timer }
    pendingRef.current = order
    setPendingOrder(order)
  }, [tradeBalance, tpPct, slPct, riskMode, riskPct, hlEquity, tickers, executeCommand, addLog, hlMode])

  const cancelPendingOrder = useCallback(() => {
    if (!pendingRef.current) return
    clearTimeout(pendingRef.current.timer)
    addLog('✕ Order cancelled', 'warning')
    haptic('light')
    setPendingOrder(null)
    pendingRef.current = null
  }, [addLog])

  const sendNow = useCallback(() => {
    if (!pendingRef.current) return
    clearTimeout(pendingRef.current.timer)
    const { cmd } = pendingRef.current
    setPendingOrder(null)
    pendingRef.current = null
    haptic('heavy')
    addLog(`→ ${cmd}`, 'trade')
    executeCommand(cmd)
  }, [addLog, executeCommand])

  const handleSubmit = (e) => {
    e?.preventDefault()
    if (input.trim()) executeCommand(input)
  }

  // ── Filter
  const filterApply = (n, key) => {
    if (key === 'all')      return true
    if (key === 'high')     return n.priority === 'HIGH'
    if (key === 'official') return n.source_tier === 'official'
    if (key === 'listing')  return n.event_type === 'listing' || n.event_type === 'delisting'
    if (key === 'exploit')  return n.event_type === 'exploit'
    return true
  }

  const filterCounts = useMemo(() => {
    const counts = {}
    for (const f of FILTERS) {
      counts[f.key] = news.filter(n => filterApply(n, f.key)).length
    }
    return counts
  }, [news])

  const filtered = useMemo(() => {
    const sorted = [...news].sort((a, b) => {
      const ta = Math.max(
        a.received_at ? new Date(a.received_at).getTime() : 0,
        a.published_at ? new Date(a.published_at).getTime() : 0,
      )
      const tb = Math.max(
        b.received_at ? new Date(b.received_at).getTime() : 0,
        b.published_at ? new Date(b.published_at).getTime() : 0,
      )
      return tb - ta
    })
    return sorted.filter(n => filterApply(n, filter))
  }, [news, filter])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)', position: 'relative', overflowX: 'hidden' }}>

      {/* ── Status bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        padding: '8px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0,
      }}>
        <div style={{
          width: 7, height: 7, borderRadius: '50%',
          background: connected ? '#00d992' : '#f43f5e',
          boxShadow: connected ? '0 0 6px #00d992' : 'none',
        }} />
        <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 700 }}>
          {connected ? 'LIVE' : 'CONNECTING'}
        </span>
        <button
          onClick={() => { haptic('light'); setShowHLConnect(true) }}
          style={{
            fontSize: 9, fontWeight: 800, letterSpacing: 0.8,
            padding: '2px 7px', borderRadius: 20, border: 'none',
            background: hlMode === 'LIVE' ? 'rgba(0,217,146,0.18)' : 'rgba(245,158,11,0.18)',
            color: hlMode === 'LIVE' ? '#00d992' : '#f59e0b',
            cursor: 'pointer',
          }}>
          {hlMode === 'LIVE' ? 'LIVE' : 'PAPER'} · HL
        </button>

        {hlMode === 'LIVE' && hlWallet ? (
          <span style={{
            fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 600, color: '#00d992',
            background: 'rgba(0,217,146,0.08)', borderRadius: 8, padding: '2px 8px',
            maxWidth: 86, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{hlWallet.slice(0,6)}…{hlWallet.slice(-4)}</span>
        ) : walletConnected && walletAddress && (
          <span style={{
            fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 600, color: 'var(--text-3)',
            background: 'var(--bg-3)', borderRadius: 8, padding: '2px 8px',
            maxWidth: 86, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{walletAddress.slice(0,6)}…{walletAddress.slice(-4)}</span>
        )}

      </div>

      {/* ── Live price ticker — top 20 crypto + top 20 stocks */}
      <LiveTicker />

      {/* ── Settings bar: size + leverages */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '6px 16px', borderBottom: '1px solid var(--border)',
        flexShrink: 0, overflowX: 'auto',
      }}>
        {/* Size button */}
        <button
          onClick={() => { haptic('light'); setShowSettings(true) }}
          style={{
            flexShrink: 0, padding: '4px 6px', borderRadius: 0,
            background: 'none', border: 'none',
            color: '#fff', fontSize: 13, fontWeight: 800,
            fontFamily: 'var(--mono)', cursor: 'pointer',
          }}>
          {riskMode
            ? <span style={{ color: '#00d992' }}>%{riskPct} risk</span>
            : `$${tradeBalance.toLocaleString()}`
          }
        </button>

        <span style={{ fontSize: 10, color: 'var(--text-3)', flexShrink: 0 }}>×</span>

        {/* Leverage pills */}
        {leverages.map(lev => (
          <span key={lev} style={{
            flexShrink: 0, padding: '4px 6px',
            color: '#fff', fontSize: 12, fontWeight: 800, fontFamily: 'var(--mono)',
          }}>{lev}x</span>
        ))}

        {(tpPct > 0 || slPct > 0) && (
          <span style={{ flexShrink: 0, display: 'flex', gap: 4, alignItems: 'center' }}>
            {tpPct > 0 && <span style={{ fontSize: 9, fontWeight: 800, color: '#00d992', background: 'rgba(0,217,146,0.12)', padding: '2px 5px', borderRadius: 4 }}>TP%{tpPct}</span>}
            {slPct > 0 && <span style={{ fontSize: 9, fontWeight: 800, color: '#f43f5e', background: 'rgba(244,63,94,0.12)', padding: '2px 5px', borderRadius: 4 }}>SL%{slPct}</span>}
          </span>
        )}

        <span style={{ fontSize: 10, color: 'var(--text-3)', marginLeft: 'auto', flexShrink: 0 }}>
          {filtered.length} news
        </span>
      </div>

      {/* ── Filter chips */}
      <div style={{ display: 'flex', gap: 14, padding: '8px 16px', flexShrink: 0, overflowX: 'auto' }}>
        {FILTERS.map(f => {
          const count = filterCounts[f.key] || 0
          const isActive = filter === f.key
          return (
            <button key={f.key}
              onClick={() => { haptic('light'); setFilter(f.key) }}
              style={{
                flexShrink: 0, padding: 0, display: 'flex', alignItems: 'center', gap: 5,
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
                background: 'none', border: 'none',
                color: isActive ? '#ffffff' : 'var(--text-3)',
              }}>
              {f.label}
              {f.key !== 'all' && count > 0 && (
                <span style={{
                  fontSize: 9, fontWeight: 800,
                  background: isActive ? (f.key === 'high' ? '#f43f5e' : '#00d992') : 'var(--bg-3)',
                  color: isActive ? '#fff' : 'var(--text-3)',
                  padding: '1px 5px', borderRadius: 99, lineHeight: 1.6,
                }}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* ── News feed */}
      <div ref={feedRef} style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '0 16px', WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-3)', paddingTop: 48 }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>📡</div>
            <div style={{ fontSize: 13 }}>{connected ? 'Waiting for news...' : 'Connecting...'}</div>
          </div>
        ) : (
          filtered.map((item, i) => (
            <NewsCard
              key={item.id || i}
              item={item}
              leverages={leverages}
              tradeBalance={tradeBalance}
              onOrder={sendOrder}
              onTrade={(cmd) => { setInput(cmd); inputRef.current?.focus() }}
              tickers={tickers}
            />
          ))
        )}
        <div style={{ height: 8 }} />
      </div>

      {/* ── Command log */}
      {logs.length > 0 && (
        <div ref={logRef} style={{
          maxHeight: 120, overflowY: 'auto', background: 'var(--bg-2)',
          borderTop: '1px solid var(--border)', padding: '6px 16px', flexShrink: 0,
          WebkitOverflowScrolling: 'touch',
        }}>
          {logs.slice(-15).map((l, i) => (
            <div key={i} style={{ fontSize: 11, color: LOG_COLORS[l.style] || LOG_COLORS.info, fontFamily: 'var(--mono)', lineHeight: 1.6 }}>
              {l.text}
            </div>
          ))}
        </div>
      )}

      {/* ── Order undo toast */}
      {pendingOrder && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 16px', background: 'rgba(245,158,11,0.12)',
          borderTop: '1px solid rgba(245,158,11,0.25)', flexShrink: 0, gap: 8,
        }}>
          <span style={{ fontSize: 12, color: '#f59e0b', fontFamily: 'var(--mono)', fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            ⏳ {pendingOrder.cmd.split(' ').slice(0, 3).join(' ')}…
          </span>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <button
              onClick={sendNow}
              style={{
                padding: '4px 12px', borderRadius: 8, border: '1px solid rgba(0,217,146,0.5)',
                background: 'rgba(0,217,146,0.15)', color: '#00d992',
                fontSize: 12, fontWeight: 800, cursor: 'pointer',
              }}>
              NOW
            </button>
            <button
              onClick={cancelPendingOrder}
              style={{
                padding: '4px 12px', borderRadius: 8, border: '1px solid rgba(245,158,11,0.4)',
                background: 'rgba(245,158,11,0.15)', color: '#f59e0b',
                fontSize: 12, fontWeight: 800, cursor: 'pointer',
              }}>
              CANCEL
            </button>
          </div>
        </div>
      )}

      {/* ── Quick commands */}
      {!kbOpen && (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 18,
          padding: '8px 16px',
          overflowX: 'auto',
          flexShrink: 0,
          borderTop: 'none',
          width: '100%',
          minWidth: 0,
        }}>
          {QUICK_CMDS.map(cmd => (
            <button key={cmd}
              onClick={() => { haptic('light'); executeCommand(cmd) }}
              style={{
                flexShrink: 0, padding: 0, fontSize: 13,
                fontWeight: 600, cursor: 'pointer', background: 'none',
                border: 'none', color: 'var(--text-3)', fontFamily: 'var(--mono)',
              }}>{cmd}</button>
          ))}
        </div>
      )}

      {/* ── Command bar */}
      <form onSubmit={handleSubmit} style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: `10px 16px ${kbOpen ? '10px' : 'calc(10px + var(--safe-bottom, 0px))'}`,
        borderTop: 'none', background: '#000000', flexShrink: 0,
      }}>
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center',
          minHeight: 46,
          background: '#000000', borderRadius: 999,
          border: '2px solid #ffffff',
          boxShadow: '0 0 0 1px rgba(255,255,255,0.08), inset 0 0 0 1px rgba(255,255,255,0.04)',
          padding: '0 14px', gap: 8,
          minWidth: 0,
        }}>
          <span style={{ fontSize: 14, color: '#ffffff', fontFamily: 'var(--mono)', fontWeight: 800, flexShrink: 0 }}>
            {cmdLoading ? '…' : '$'}
          </span>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="long BTCUSDT 500 10 · pos · balance"
            style={{
              flex: 1, background: 'none', border: 'none', outline: 'none',
              color: '#ffffff', fontSize: 14, fontFamily: 'var(--mono)', padding: '12px 0',
              minWidth: 0,
            }}
            autoCorrect="off" autoCapitalize="off" spellCheck={false}
            disabled={cmdLoading}
            enterKeyHint="send"
          />
          {input && (
            <button type="button" onClick={() => setInput('')}
              style={{ background: 'none', border: 'none', color: 'var(--text-3)', fontSize: 16, cursor: 'pointer', padding: 0, lineHeight: 1 }}>
              ✕
            </button>
          )}
        </div>
        <button type="submit" disabled={!input.trim() || cmdLoading}
          style={{
            width: 46, height: 46, borderRadius: '50%',
            border: '2px solid #ffffff',
            background: '#000000',
            color: '#ffffff',
            boxShadow: '0 0 0 1px rgba(255,255,255,0.08), inset 0 0 0 1px rgba(255,255,255,0.04)',
            opacity: input.trim() && !cmdLoading ? 1 : 0.45,
            fontSize: 19, cursor: input.trim() && !cmdLoading ? 'pointer' : 'not-allowed', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.15s',
          }}>
          {cmdLoading
            ? <span style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.25)', borderTopColor: '#ffffff', borderRadius: '50%', display: 'inline-block', animation: 'm-spin 0.7s linear infinite' }} />
            : '↑'}
        </button>
      </form>

      {/* ── Settings sheet overlay */}
      {showSettings && (
        <>
          <div
            onClick={() => setShowSettings(false)}
            style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 99 }}
          />
          <SettingsSheet
            tradeBalance={tradeBalance}
            setTradeBalance={setTradeBalance}
            leverages={leverages}
            setLeverages={setLeverages}
            tpPct={tpPct}
            setTpPct={setTpPct}
            slPct={slPct}
            setSlPct={setSlPct}
            riskMode={riskMode}
            setRiskMode={setRiskMode}
            riskPct={riskPct}
            setRiskPct={setRiskPct}
            hlEquity={hlEquity}
            onClose={() => setShowSettings(false)}
          />
        </>
      )}

      {/* ── HL Connect Modal */}
      <ConnectHLModalMobile show={showHLConnect} onClose={() => setShowHLConnect(false)} />
    </div>
  )
}
