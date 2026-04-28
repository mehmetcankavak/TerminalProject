import { useState, useEffect, useRef } from 'react'
import { useLang } from '../context/LangContext'

const TABS = [
  { id: 'liquidations', label: 'Liquidation Stream', tag: 'LIQ' },
  { id: 'funding',      label: 'Funding Rate',       tag: 'FUND' },
  { id: 'whale',        label: 'Whale Transfers',    tag: 'WHALE' },
  { id: 'smart',        label: 'Smart Money',        tag: 'SMART' },
  { id: 'terminal',     label: 'Terminal Trading',   tag: 'TERM' },
  { id: 'alerts',       label: 'Custom Alerts',      tag: 'ALT' },
]

/* ── Animated liquidation feed ── */
const LIQ_ITEMS = [
  { sym: 'BTC/USDT', side: 'LONG', amt: '$1,240,000', exch: 'Binance', color: '#ef4444' },
  { sym: 'ETH/USDT', side: 'SHORT', amt: '$384,500',  exch: 'OKX',    color: '#00d992' },
  { sym: 'SOL/USDT', side: 'LONG', amt: '$92,100',    exch: 'Bybit',  color: '#ef4444' },
  { sym: 'HYPE/USDT',side: 'LONG', amt: '$214,700',   exch: 'HyperLiquid', color: '#ef4444' },
  { sym: 'XRP/USDT', side: 'SHORT', amt: '$67,300',   exch: 'Binance', color: '#00d992' },
  { sym: 'BNB/USDT', side: 'LONG', amt: '$445,200',   exch: 'Binance', color: '#ef4444' },
  { sym: 'DOGE/USDT',side: 'SHORT', amt: '$38,900',   exch: 'OKX',    color: '#00d992' },
  { sym: 'AVAX/USDT',side: 'LONG', amt: '$178,600',   exch: 'Bybit',  color: '#ef4444' },
]

function LiquidationFeed() {
  const [visible, setVisible] = useState([LIQ_ITEMS[0], LIQ_ITEMS[1]])
  const idxRef = useRef(2)

  useEffect(() => {
    const id = setInterval(() => {
      const next = LIQ_ITEMS[idxRef.current % LIQ_ITEMS.length]
      idxRef.current++
      setVisible(prev => [next, ...prev].slice(0, 6))
    }, 1200)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="showcase-panel">
      <div className="showcase-panel-header">
        <span className="showcase-live-dot" /><span>LIVE FEED</span>
        <span style={{ marginLeft: 'auto', color: 'var(--text-3)', fontSize: 10 }}>4 exchanges</span>
      </div>
      <div className="showcase-liq-list">
        {visible.map((item, i) => (
          <div key={i} className={`showcase-liq-row ${i === 0 ? 'showcase-liq-new' : ''}`}>
            <span className="showcase-sym">{item.sym}</span>
            <span className="showcase-side" style={{ color: item.color }}>{item.side}</span>
            <span className="showcase-amt">{item.amt}</span>
            <span className="showcase-exch">{item.exch}</span>
          </div>
        ))}
      </div>
      <div className="showcase-totals">
        <div className="showcase-total-item">
          <span style={{ color: '#ef4444' }}>1h LONG</span>
          <span>$124.3M</span>
        </div>
        <div className="showcase-total-item">
          <span style={{ color: '#00d992' }}>1h SHORT</span>
          <span>$89.7M</span>
        </div>
        <div className="showcase-total-item">
          <span style={{ color: 'var(--text-2)' }}>TOTAL</span>
          <span>$214.0M</span>
        </div>
      </div>
    </div>
  )
}

/* ── Funding rate table ── */
const FUNDING_DATA = [
  { sym: 'BTC',  binance: '+0.0082%', okx: '+0.0091%', bybit: '+0.0079%', hype: '+0.0088%' },
  { sym: 'ETH',  binance: '+0.0034%', okx: '+0.0041%', bybit: '+0.0038%', hype: '+0.0029%' },
  { sym: 'SOL',  binance: '+0.0154%', okx: '+0.0162%', bybit: '+0.0149%', hype: '+0.0171%' },
  { sym: 'XRP',  binance: '-0.0021%', okx: '-0.0018%', bybit: '-0.0024%', hype: '-0.0019%' },
  { sym: 'HYPE', binance: '+0.0241%', okx: '-',        bybit: '-',        hype: '+0.0258%' },
  { sym: 'DOGE', binance: '+0.0067%', okx: '+0.0071%', bybit: '+0.0063%', hype: '-'        },
]

function FundingTable() {
  return (
    <div className="showcase-panel">
      <div className="showcase-panel-header">
        <span className="showcase-live-dot" /><span>FUNDING RATES</span>
        <span style={{ marginLeft: 'auto', color: 'var(--text-3)', fontSize: 10 }}>next in 2h 14m</span>
      </div>
      <table className="showcase-table">
        <thead>
          <tr>
            <th>Symbol</th><th>Binance</th><th>OKX</th><th>Bybit</th><th>Hype</th>
          </tr>
        </thead>
        <tbody>
          {FUNDING_DATA.map(row => (
            <tr key={row.sym}>
              <td className="showcase-sym">{row.sym}</td>
              {[row.binance, row.okx, row.bybit, row.hype].map((v, i) => (
                <td key={i} style={{ color: v.startsWith('+') ? '#00d992' : v.startsWith('-') && v !== '-' ? '#ef4444' : 'var(--text-3)' }}>
                  {v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ── Whale transfers feed ── */
const WHALE_ITEMS = [
  { sym: 'BTC',  dir: 'SELL', amt: '$2,400,000', from: 'Binance Perp', to: 'Unknown',   age: '1m ago' },
  { sym: 'ETH',  dir: 'BUY',  amt: '$890,000',   from: 'Coinbase',    to: 'Binance',    age: '3m ago' },
  { sym: 'SOL',  dir: 'SELL', amt: '$340,000',   from: 'OKX',         to: 'Cold Wallet',age: '5m ago' },
  { sym: 'USDT', dir: 'BUY',  amt: '$5,200,000', from: 'Unknown',     to: 'Bybit',      age: '7m ago' },
  { sym: 'BTC',  dir: 'SELL', amt: '$1,750,000', from: 'Kraken',      to: 'Binance',    age: '9m ago' },
]

function WhaleFeed() {
  const [visible, setVisible] = useState(WHALE_ITEMS.slice(0, 3))
  const idxRef = useRef(3)

  useEffect(() => {
    const id = setInterval(() => {
      const next = WHALE_ITEMS[idxRef.current % WHALE_ITEMS.length]
      idxRef.current++
      setVisible(prev => [next, ...prev].slice(0, 5))
    }, 2000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="showcase-panel">
      <div className="showcase-panel-header">
        <span className="showcase-live-dot" /><span>WHALE TRANSFERS</span>
        <span style={{ marginLeft: 'auto', color: 'var(--text-3)', fontSize: 10 }}>$200K+ threshold</span>
      </div>
      <div className="showcase-liq-list">
        {visible.map((item, i) => (
          <div key={i} className={`showcase-liq-row ${i === 0 ? 'showcase-liq-new' : ''}`}>
            <span className="showcase-sym">{item.sym}</span>
            <span className="showcase-side" style={{ color: item.dir === 'SELL' ? '#ef4444' : '#00d992' }}>{item.dir}</span>
            <span className="showcase-amt">{item.amt}</span>
            <span className="showcase-exch">{item.from}</span>
            <span style={{ color: 'var(--text-3)', fontSize: 10, marginLeft: 'auto' }}>{item.age}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Custom alerts ── */
const ALERT_ROWS = [
  { sym: 'BTC/USDT', cond: 'Price ≥', target: '$95,000',  status: 'active',    triggered: false },
  { sym: 'ETH/USDT', cond: 'Price ≤', target: '$2,800',   status: 'triggered', triggered: true  },
  { sym: 'SOL/USDT', cond: 'Price ≥', target: '$200',     status: 'active',    triggered: false },
  { sym: 'BNB/USDT', cond: 'Price ≤', target: '$550',     status: 'active',    triggered: false },
]

function AlertsPanel() {
  return (
    <div className="showcase-panel">
      <div className="showcase-panel-header">
        <span className="showcase-live-dot" /><span>CUSTOM ALERTS</span>
        <span style={{ marginLeft: 'auto', color: 'var(--text-3)', fontSize: 10 }}>4 active</span>
      </div>
      <div className="showcase-liq-list">
        {ALERT_ROWS.map((row, i) => (
          <div key={i} className="showcase-liq-row" style={{ background: row.triggered ? 'rgba(0,217,146,0.05)' : 'transparent' }}>
            <span className="showcase-sym">{row.sym}</span>
            <span style={{ color: 'var(--text-2)', fontSize: 10 }}>{row.cond}</span>
            <span className="showcase-amt">{row.target}</span>
            <span className="showcase-side" style={{
              color: row.triggered ? '#00d992' : 'var(--text-3)',
              fontSize: 9, fontWeight: 700, letterSpacing: '.06em'
            }}>
              {row.triggered ? 'TRIGGERED' : 'WATCHING'}
            </span>
          </div>
        ))}
      </div>
      <div className="showcase-alert-add">
        <span>+</span> Add alert
      </div>
    </div>
  )
}

/* ── Smart money ── */
const SMART_ITEMS = [
  { wallet: '0x9f3...04d2', action: 'COPYING', sym: 'BTC', side: 'LONG',  size: '$1.35M', roi: '+430.3%' },
  { wallet: '0x7dac...f410', action: 'FOLLOWING', sym: 'SOL', side: 'SHORT', size: '$786K', roi: '+424.8%' },
  { wallet: '0x8b83...6e36', action: 'FOLLOWING', sym: 'ETH', side: 'LONG',  size: '$2.12M', roi: '+89.9%' },
  { wallet: '0x8e0b...aab9', action: 'COPYING', sym: 'HYPE', side: 'SHORT', size: '$512K', roi: '+1166.9%' },
]

function SmartMoneyPanel() {
  return (
    <div className="showcase-panel">
      <div className="showcase-panel-header">
        <span className="showcase-live-dot" /><span>SMART MONEY</span>
        <span style={{ marginLeft: 'auto', color: 'var(--text-3)', fontSize: 10 }}>50 traders · live copy</span>
      </div>
      <div className="showcase-liq-list">
        {SMART_ITEMS.map((row, i) => (
          <div key={i} className="showcase-liq-row">
            <span className="showcase-sym">{row.wallet}</span>
            <span
              style={{
                fontSize: 9,
                letterSpacing: '.06em',
                color: row.action === 'COPYING' ? '#00d992' : 'var(--text-2)',
                fontWeight: 700
              }}
            >
              {row.action}
            </span>
            <span className="showcase-amt">{row.sym} {row.side}</span>
            <span className="showcase-exch">{row.size}</span>
            <span style={{ color: '#00d992', fontSize: 10, marginLeft: 'auto' }}>{row.roi}</span>
          </div>
        ))}
      </div>
      <div className="showcase-totals">
        <div className="showcase-total-item">
          <span style={{ color: 'var(--text-2)' }}>ACTIVE COPIES</span>
          <span>3</span>
        </div>
        <div className="showcase-total-item">
          <span style={{ color: '#00d992' }}>30D ROI AVG</span>
          <span>+241.8%</span>
        </div>
        <div className="showcase-total-item">
          <span style={{ color: 'var(--text-2)' }}>TOP WALLET</span>
          <span>0x9f3…</span>
        </div>
      </div>
    </div>
  )
}

/* ── Terminal trading ── */
const TERM_LINES = [
  '$ buy BTCUSDT 100 10',
  '✓ ORDER FILLED: LONG BTCUSDT qty=0.0137 @ 72841.2',
  '$ tp BTCUSDT 73900',
  '✓ TP SET: BTCUSDT → 73900',
  '$ sl BTCUSDT 72150',
  '✓ SL SET: BTCUSDT → 72150',
  '$ sell SOLUSDT 80 8',
  '✓ ORDER FILLED: SHORT SOLUSDT qty=9.42 @ 174.3',
]

function TerminalOpsPanel() {
  const [visibleCount, setVisibleCount] = useState(3)
  useEffect(() => {
    const id = setInterval(() => {
      setVisibleCount((v) => (v >= TERM_LINES.length ? 3 : v + 1))
    }, 1100)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="showcase-panel">
      <div className="showcase-panel-header">
        <span className="showcase-live-dot" /><span>TERMINAL EXECUTION</span>
        <span style={{ marginLeft: 'auto', color: 'var(--text-3)', fontSize: 10 }}>paper/live ready</span>
      </div>
      <div className="showcase-liq-list">
        {TERM_LINES.slice(0, visibleCount).map((line, i) => (
          <div key={i} className={`showcase-liq-row ${i === visibleCount - 1 ? 'showcase-liq-new' : ''}`}>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                color: line.startsWith('$') ? 'var(--text-1)' : '#00d992',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                width: '100%',
              }}
            >
              {line}
            </span>
          </div>
        ))}
      </div>
      <div className="showcase-totals">
        <div className="showcase-total-item">
          <span style={{ color: 'var(--text-2)' }}>COMMANDS</span>
          <span>buy · sell · tp · sl</span>
        </div>
        <div className="showcase-total-item">
          <span style={{ color: '#00d992' }}>LATENCY</span>
          <span>&lt;50ms</span>
        </div>
        <div className="showcase-total-item">
          <span style={{ color: 'var(--text-2)' }}>MODE</span>
          <span>Paper / Live</span>
        </div>
      </div>
    </div>
  )
}

const PANELS = {
  liquidations: <LiquidationFeed />,
  funding:      <FundingTable />,
  whale:        <WhaleFeed />,
  smart:        <SmartMoneyPanel />,
  terminal:     <TerminalOpsPanel />,
  alerts:       <AlertsPanel />,
}

export default function FeatureShowcase() {
  const { t } = useLang()
  const [active, setActive] = useState('liquidations')

  return (
    <section className="landing-showcase">
      <div className="landing-section-inner">
        <div className="section-eyebrow">LIVE PREVIEW</div>
        <h2 className="section-title">{t('showcase_title')}</h2>
        <p className="section-sub">{t('showcase_sub')}</p>

        <div className="showcase-tabs">
          {TABS.map(tab => (
            <button
              key={tab.id}
              className={`showcase-tab ${active === tab.id ? 'showcase-tab-active' : ''}`}
              onClick={() => setActive(tab.id)}
            >
              <span className="showcase-tab-tag">{tab.tag}</span>
              <span className="showcase-tab-label">{tab.label}</span>
            </button>
          ))}
        </div>

        <div className="showcase-window">
          <div className="showcase-window-bar">
            <span className="tp-dot tp-red" />
            <span className="tp-dot tp-yellow" />
            <span className="tp-dot tp-green" />
            <span style={{ marginLeft: 12, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)' }}>
              trading-tools — {TABS.find(t => t.id === active)?.label}
            </span>
          </div>
          <div className="showcase-window-body">
            {PANELS[active]}
          </div>
        </div>
      </div>
    </section>
  )
}
