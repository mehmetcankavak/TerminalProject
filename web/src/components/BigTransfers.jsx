import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { API_BASE } from '../config'

const CHAIN_MIN_USD = 2_000_000         // On-chain için $2M+ eşiği
const POLL_INTERVAL = 90_000            // 90s

function fmtUSD(n) {
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B'
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M'
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K'
  return '$' + n.toFixed(0)
}

function shortAddr(addr) {
  if (!addr) return '—'
  return addr.slice(0, 6) + '…' + addr.slice(-4)
}

function timeAgo(ts) {
  const s = Math.floor((Date.now() / 1000) - ts)
  if (s < 60)   return s + 's önce'
  if (s < 3600) return Math.floor(s / 60) + 'm önce'
  return Math.floor(s / 3600) + 'h önce'
}

/* ── On-chain büyük transferler (Blockchair — API key gerekmez) ── */
async function fetchChainWhales() {
  try {
    const [btcRes, ethRes] = await Promise.allSettled([
      fetch('https://api.blockchair.com/bitcoin/transactions?s=output_total_usd(desc)&limit=8', { signal: AbortSignal.timeout(8000) }),
      fetch('https://api.blockchair.com/ethereum/transactions?s=value_usd(desc)&limit=8', { signal: AbortSignal.timeout(8000) }),
    ])

    const results = []

    if (btcRes.status === 'fulfilled' && btcRes.value.ok) {
      const btcData = await btcRes.value.json()
      ;(btcData.data || []).forEach(tx => {
        const usd = tx.output_total_usd || 0
        if (usd < CHAIN_MIN_USD) return
        results.push({
          id:     'btc_' + tx.hash,
          time:   Math.floor(new Date(tx.time + 'Z').getTime() / 1000),
          coin:   'BTC',
          amount: usd,
          type:   'transfer',
          side:   null,
          qty:    tx.output_total ? (tx.output_total / 1e8).toFixed(4) : '—',
          chain:  'Bitcoin',
          from:   null,
          to:     null,
          link:   `https://blockchair.com/bitcoin/transaction/${tx.hash}`,
        })
      })
    }

    if (ethRes.status === 'fulfilled' && ethRes.value.ok) {
      const ethData = await ethRes.value.json()
      ;(ethData.data || []).forEach(tx => {
        const usd = tx.value_usd || 0
        if (usd < CHAIN_MIN_USD) return
        const ethAmt = tx.value ? (tx.value / 1e18).toFixed(2) : '—'
        results.push({
          id:     'eth_' + tx.hash,
          time:   Math.floor(new Date(tx.time + 'Z').getTime() / 1000),
          coin:   'ETH',
          amount: usd,
          type:   'transfer',
          side:   null,
          qty:    ethAmt,
          chain:  'Ethereum',
          from:   tx.sender   ? shortAddr(tx.sender)    : null,
          to:     tx.recipient ? shortAddr(tx.recipient) : null,
          link:   `https://blockchair.com/ethereum/transaction/${tx.hash}`,
        })
      })
    }

    return results
  } catch (err) {
    console.warn('[BigTransfers] Blockchair fetch error', err)
    return []
  }
}

/* ── CEX büyük işlem akışı (Binance + Bybit + OKX + Hyperliquid) ── */
const WHALE_SYMBOLS = ['BTCUSDT','ETHUSDT','SOLUSDT','XRPUSDT','BNBUSDT','AVAXUSDT','HYPEUSDT']
const WHALE_MIN_VOL = 200_000  // $200k+
const TRANSFER_THRESHOLDS = [5_000_000, 10_000_000, 100_000_000]
const OKX_CT_VAL_FALLBACK = {
  'BTC-USDT-SWAP': 0.01,
  'ETH-USDT-SWAP': 0.1,
  'SOL-USDT-SWAP': 1,
  'XRP-USDT-SWAP': 100,
  'BNB-USDT-SWAP': 0.1,
  'AVAX-USDT-SWAP': 1,
  'HYPE-USDT-SWAP': 1,
}

const HYPE_COINS = ['BTC', 'ETH', 'SOL', 'XRP', 'BNB', 'AVAX', 'HYPE']

function safeNum(v, d = 0) {
  const n = Number(v)
  return Number.isFinite(n) ? n : d
}

export default function BigTransfers() {
  const { token } = useAuth()
  const [wsTransfers,    setWsTransfers]    = useState([])
  const [chainTransfers, setChainTransfers] = useState([])
  const [chainError,     setChainError]     = useState(false)
  const [filter,         setFilter]         = useState('all')  // all | btc | eth | sol
  const [source,         setSource]         = useState('all')  // all | cex | chain
  const [thresholdUsd,   setThresholdUsd]   = useState(5_000_000)
  const wsRefs       = useRef([])
  const wsTransRef   = useRef([])
  const syncDirtyRef = useRef(false)

  const addWsTransfer = useCallback((t) => {
    wsTransRef.current = [t, ...wsTransRef.current].slice(0, 200)
    setWsTransfers([...wsTransRef.current])
    syncDirtyRef.current = true
  }, [])

  const chainTransfersRef = useRef(chainTransfers)
  useEffect(() => { chainTransfersRef.current = chainTransfers }, [chainTransfers])

  const syncToServer = useCallback(async () => {
    if (!token) return
    try {
      const res = await fetch(`${API_BASE}/api/big-transfers/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          cex: wsTransRef.current.slice(0, 200),
          chain: chainTransfersRef.current.slice(0, 200),
        }),
      })
      if (res.ok) syncDirtyRef.current = false
    } catch {}
  }, [token])

  useEffect(() => {
    if (!token) return
    let cancelled = false
    const loadUserTransfers = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/big-transfers`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) return
        const data = await res.json()
        if (cancelled) return
        const cex = Array.isArray(data?.cex) ? data.cex : []
        const chain = Array.isArray(data?.chain) ? data.chain : []
        wsTransRef.current = cex.slice(0, 200)
        setWsTransfers(cex.slice(0, 200))
        setChainTransfers(chain.slice(0, 200))
      } catch {}
    }
    loadUserTransfers()
    return () => { cancelled = true }
  }, [token])

  /* Multi-CEX WS — büyük trade akışı */
  useEffect(() => {
    const okxInstMap = Object.fromEntries(
      WHALE_SYMBOLS.map((sym) => {
        const c = sym.replace('USDT', '')
        return [`${c}-USDT-SWAP`, c]
      }),
    )

    // Binance: tek soket (combined stream)
    const binanceStreams = WHALE_SYMBOLS.map((s) => `${s.toLowerCase()}@aggTrade`).join('/')
    const bWs = new WebSocket(`wss://fstream.binance.com/stream?streams=${binanceStreams}`)
    wsRefs.current.push(bWs)
    bWs.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        const d = msg?.data || msg
        const sym = String(d.s || '')
        if (!sym) return
        const coin = sym.replace('USDT', '')
        const qty = safeNum(d.q)
        const px = safeNum(d.p)
        const vol = qty * px
        if (vol < WHALE_MIN_VOL) return
        addWsTransfer({
          id: `bin_${d.t || Date.now()}_${sym}`,
          time: Math.floor(safeNum(d.T, Date.now()) / 1000),
          coin,
          amount: vol,
          type: 'trade',
          side: d.m ? 'SELL' : 'BUY',
          qty: qty.toFixed(4),
          chain: 'Binance',
          from: null,
          to: null,
          link: null,
        })
      } catch (err) { console.warn('[BigTransfers] Binance WS parse error', err) }
    }

    // Bybit: tek soket + çoklu topic
    const yWs = new WebSocket('wss://stream.bybit.com/v5/public/linear')
    wsRefs.current.push(yWs)
    yWs.onopen = () => {
      try {
        yWs.send(JSON.stringify({
          op: 'subscribe',
          args: WHALE_SYMBOLS.map((sym) => `publicTrade.${sym}`),
        }))
      } catch {}
    }
    yWs.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        const topic = String(msg.topic || '')
        if (!topic.startsWith('publicTrade.')) return
        const sym = topic.split('.')[1] || ''
        const coin = sym.replace('USDT', '')
        const rows = Array.isArray(msg.data) ? msg.data : []
        for (const d of rows) {
          const qty = safeNum(d.v ?? d.s)
          const px = safeNum(d.p)
          const vol = qty * px
          if (vol < WHALE_MIN_VOL) continue
          addWsTransfer({
            id: `byb_${d.i || d.L || Date.now()}_${sym}`,
            time: Math.floor(safeNum(d.T, Date.now()) / 1000),
            coin,
            amount: vol,
            type: 'trade',
            side: String(d.S || '').toLowerCase() === 'sell' ? 'SELL' : 'BUY',
            qty: qty.toFixed(4),
            chain: 'Bybit',
            from: null,
            to: null,
            link: null,
          })
        }
      } catch (err) { console.warn('[BigTransfers] Bybit WS parse error', err) }
    }

    // OKX: tek soket + çoklu enstrüman
    const oWs = new WebSocket('wss://ws.okx.com:8443/ws/v5/public')
    wsRefs.current.push(oWs)
    oWs.onopen = () => {
      try {
        oWs.send(JSON.stringify({
          op: 'subscribe',
          args: Object.keys(okxInstMap).map((instId) => ({ channel: 'trades', instId })),
        }))
      } catch {}
    }
    oWs.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if ((msg.arg || {}).channel !== 'trades') return
        const instId = String((msg.arg || {}).instId || '')
        const coin = okxInstMap[instId]
        if (!coin) return
        const rows = Array.isArray(msg.data) ? msg.data : []
        for (const d of rows) {
          const qtyContracts = safeNum(d.sz)
          const px = safeNum(d.px)
          const ctVal = OKX_CT_VAL_FALLBACK[instId] ?? 1
          const baseQty = qtyContracts * ctVal
          const vol = baseQty * px
          if (vol < WHALE_MIN_VOL) continue
          addWsTransfer({
            id: `okx_${d.tradeId || Date.now()}_${instId}`,
            time: Math.floor(safeNum(d.ts, Date.now()) / 1000),
            coin,
            amount: vol,
            type: 'trade',
            side: String(d.side || '').toLowerCase() === 'sell' ? 'SELL' : 'BUY',
            qty: baseQty.toFixed(4),
            chain: 'OKX',
            from: null,
            to: null,
            link: null,
          })
        }
      } catch (err) { console.warn('[BigTransfers] OKX WS parse error', err) }
    }

    // Hyperliquid: tek soket + coin başına subscribe
    const hWs = new WebSocket('wss://api.hyperliquid.xyz/ws')
    wsRefs.current.push(hWs)
    hWs.onopen = () => {
      for (const coin of HYPE_COINS) {
        try {
          hWs.send(JSON.stringify({
            method: 'subscribe',
            subscription: { type: 'trades', coin },
          }))
        } catch {}
      }
    }
    hWs.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if ((msg.channel || msg.type) !== 'trades') return
        const rows = Array.isArray(msg.data) ? msg.data : []
        for (const d of rows) {
          const coin = String(d.coin || '')
          if (!coin) continue
          const qty = safeNum(d.sz)
          const px = safeNum(d.px)
          const vol = qty * px
          if (vol < WHALE_MIN_VOL) continue
          addWsTransfer({
            id: `hl_${d.tid || d.hash || Date.now()}_${coin}`,
            time: Math.floor(safeNum(d.time, Date.now()) / 1000),
            coin,
            amount: vol,
            type: 'trade',
            side: String(d.side || '').toLowerCase() === 'sell' ? 'SELL' : 'BUY',
            qty: qty.toFixed(4),
            chain: 'Hyperliquid',
            from: null,
            to: null,
            link: null,
          })
        }
      } catch (err) { console.warn('[BigTransfers] Hyperliquid WS parse error', err) }
    }

    return () => {
      wsRefs.current.forEach(ws => { try { ws.close() } catch {} })
      wsRefs.current = []
    }
  }, [addWsTransfer])

  /* On-chain polling — 90s */
  useEffect(() => {
    let cancelled = false

    const load = async () => {
      const data = await fetchChainWhales()
      if (cancelled) return
      if (data.length > 0) {
        setChainTransfers(data)
        setChainError(false)
        syncDirtyRef.current = true
      } else {
        setChainError(true)
      }
    }

    load()
    const id = setInterval(load, POLL_INTERVAL)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  useEffect(() => {
    if (!token) return
    const id = setInterval(() => {
      if (!syncDirtyRef.current) return
      syncToServer()
    }, 15000)
    return () => clearInterval(id)
  }, [token, syncToServer])

  /* Birleştir + filtrele */
  const allTransfers = source === 'cex'
    ? wsTransfers
    : source === 'chain'
      ? chainTransfers
      : [...chainTransfers, ...wsTransfers]

  const filteredByCoin = filter === 'all'
    ? allTransfers
    : allTransfers.filter(t => t.coin.toLowerCase() === filter.toLowerCase())

  const filtered = filteredByCoin.filter((t) => (t.amount || 0) >= thresholdUsd)

  // Zaman sırasına göre sırala
  const sorted = [...filtered].sort((a, b) => b.time - a.time)

  const FILTERS = ['all', 'BTC', 'ETH', 'SOL', 'XRP', 'BNB', 'HYPE']

  return (
    <div className="whale-page">

      {/* Header */}
      <div className="whale-header">
        <div className="whale-header-left">
          <span className="whale-live-pill"><span className="lsr-live-dot2"/>CANLI</span>
          <span className="whale-source">
            {source === 'chain'
              ? 'On-chain · $2M+'
              : source === 'cex'
                ? 'Binance + OKX + Bybit + Hyperliquid · $200K+'
                : 'Multi-CEX WS + On-chain'}
          </span>
          <span className="whale-count">{sorted.length} işlem</span>
        </div>
        <div className="whale-filters">
          {/* Source toggle */}
          {['all', 'cex', 'chain'].map(s => (
            <button
              key={s}
              className={`whale-filter-btn ${source === s ? 'active' : ''}`}
              onClick={() => setSource(s)}
              style={{ fontSize: 10, opacity: 0.9 }}
            >
              {s === 'all' ? 'Tümü' : s === 'cex' ? 'CEX' : 'On-chain'}
            </button>
          ))}
          <span style={{ width: 1, background: 'var(--border-0)', margin: '0 4px', alignSelf: 'stretch' }}/>
          {FILTERS.map(f => (
            <button
              key={f}
              className={`whale-filter-btn ${filter === (f === 'all' ? 'all' : f) ? 'active' : ''}`}
              onClick={() => setFilter(f === 'all' ? 'all' : f)}
            >
              {f === 'all' ? 'Tümü' : f}
            </button>
          ))}
          <span style={{ width: 1, background: 'var(--border-0)', margin: '0 4px', alignSelf: 'stretch' }}/>
          {TRANSFER_THRESHOLDS.map((v) => (
            <button
              key={v}
              className={`whale-filter-btn ${thresholdUsd === v ? 'active' : ''}`}
              onClick={() => setThresholdUsd(v)}
              style={{ fontSize: 10 }}
            >
              {v >= 1_000_000 ? `${Math.round(v / 1_000_000)}M+` : `${Math.round(v / 1_000)}K+`}
            </button>
          ))}
        </div>
      </div>

      {/* Threshold info */}
      <div className="whale-threshold">
        <span>Görünen eşik: <strong>{fmtUSD(thresholdUsd)}+</strong> · CEX minimum toplama: <strong>$200K+</strong> · On-chain minimum toplama: <strong>$2M+</strong></span>
        {chainError && (
          <span style={{ color: 'var(--danger)', fontSize: 10 }}>⚠ On-chain verisi alınamadı</span>
        )}
        {!chainError && chainTransfers.length > 0 && (
          <span style={{ color: 'var(--accent)', fontSize: 10 }}>
            {chainTransfers.length} on-chain transfer · 90s güncelleniyor
          </span>
        )}
      </div>

      {/* Feed */}
      <div className="whale-feed">
        {sorted.length === 0 ? (
          <div className="whale-empty">
            <div className="ldash-spinner"/>
            <span>Büyük işlem bekleniyor...</span>
          </div>
        ) : (
          sorted.map(t => {
            const isChain = t.type === 'transfer'
            const isGreen = t.side === 'BUY' || isChain
            return (
              <div key={t.id} className={`whale-row ${isChain ? '' : isGreen ? 'whale-buy' : 'whale-sell'}`}
                   style={isChain ? { borderLeft: '2px solid var(--text-3)', opacity: 0.9 } : {}}>
                <div className="whale-row-left">
                  {isChain ? (
                    <span className="whale-side-badge" style={{ background: 'rgba(100,100,120,0.2)', color: 'var(--text-2)', fontSize: 9 }}>
                      TRANSFER
                    </span>
                  ) : (
                    <span className={`whale-side-badge ${isGreen ? 'buy' : 'sell'}`}>
                      {t.side}
                    </span>
                  )}
                  <div className="whale-coin-info">
                    <span className="whale-coin">{t.coin}{isChain ? '' : '/USDT'}</span>
                    <span className="whale-chain">{t.chain}</span>
                  </div>
                </div>

                <div className="whale-row-center">
                  <span className="whale-amount" style={{ color: isChain ? 'var(--text-1)' : isGreen ? '#22ab94' : '#f23645' }}>
                    {fmtUSD(t.amount)}
                  </span>
                  <span className="whale-qty">{t.qty} {t.coin}</span>
                </div>

                <div className="whale-row-right">
                  {isChain && t.link ? (
                    <a href={t.link} target="_blank" rel="noreferrer"
                       style={{ fontSize: 10, color: 'var(--text-3)', textDecoration: 'none' }}
                       onClick={e => e.stopPropagation()}>
                      ↗ txn
                    </a>
                  ) : null}
                  {isChain && (t.from || t.to) && (
                    <span style={{ fontSize: 9, color: 'var(--text-3)' }}>
                      {t.from && `${t.from}`}{t.from && t.to && ' → '}{t.to && `${t.to}`}
                    </span>
                  )}
                  <span className="whale-time">{timeAgo(t.time)}</span>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
