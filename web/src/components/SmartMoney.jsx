import { useState, useEffect, useCallback, useRef } from 'react'
import { requestNotifPermission } from '../hooks/useNewsAlert'
import { useAuth } from '../context/AuthContext'
import { API_BASE } from '../config'

const API    = `${API_BASE}/api/smart-money`
const HL_WS  = 'wss://api.hyperliquid.xyz/ws'

function fmtUSD(n) {
  if (!n && n !== 0) return '—'
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1e9) return sign + '$' + (abs / 1e9).toFixed(2) + 'B'
  if (abs >= 1e6) return sign + '$' + (abs / 1e6).toFixed(2) + 'M'
  if (abs >= 1e3) return sign + '$' + (abs / 1e3).toFixed(1) + 'K'
  return sign + '$' + abs.toFixed(0)
}
function fmtPct(n) {
  if (!n && n !== 0) return '—'
  return (n >= 0 ? '+' : '') + (n * 100).toFixed(1) + '%'
}
function fmtPrice(n) {
  if (!n && n !== 0) return '—'
  if (n >= 1000) return n.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  if (n >= 1)    return n.toFixed(3)
  return n.toFixed(5)
}
function shortAddr(addr) {
  if (!addr) return '—'
  return addr.slice(0, 6) + '…' + addr.slice(-4)
}
function WhaleAvatar() {
  return (
    <span className="sm-whale-avatar">
      <img
        src="https://coin-images.coingecko.com/coins/images/50882/large/hyperliquid.jpg?1729431300"
        alt="HYPE"
        className="sm-whale-img"
      />
    </span>
  )
}

/* ── Alert Toast ─────────────────────────────────────────────────────────── */
function AlertToast({ alerts, onDismiss }) {
  if (!alerts.length) return null
  return (
    <div className="sm-alerts-container">
      {alerts.map(a => (
        <div key={a.id} className={`sm-alert-toast sm-alert-${a.type}`}>
          <div className="sm-alert-icon">{a.type === 'open' ? '▲' : a.type === 'close' ? '▼' : a.type === 'error' ? '⚠' : '↕'}</div>
          <div className="sm-alert-body">
            <div className="sm-alert-trader">{a.traderName}</div>
            <div className="sm-alert-msg">{a.message}</div>
          </div>
          <button className="sm-alert-dismiss" onClick={() => onDismiss(a.id)}>✕</button>
        </div>
      ))}
    </div>
  )
}

/* ── Trader WebSocket Tracker ────────────────────────────────────────────── */
function useTraderWatcher(followed, onAlert, onCopyTrade) {
  const wsMap    = useRef({})   // addr → WebSocket
  const prevPos  = useRef({})   // addr → { coin → {side, notional} }
  const pingMap  = useRef({})   // addr → interval id

  useEffect(() => {
    const addresses = Object.keys(followed)

    // Yeni takip edilenleri bağla
    addresses.forEach(addr => {
      if (wsMap.current[addr]) return  // zaten bağlı

      const traderName = followed[addr]?.displayName || shortAddr(addr)
      let ws
      let retries = 0
      const MAX_WS_RETRIES = 6

      function connect() {
        if (retries >= MAX_WS_RETRIES) return
        ws = new WebSocket(HL_WS)
        wsMap.current[addr] = ws

        ws.onopen = () => {
          retries = 0
          ws.send(JSON.stringify({
            method: 'subscribe',
            subscription: { type: 'webData2', user: addr }
          }))
          pingMap.current[addr] = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ method: 'ping' }))
          }, 30000)
        }

        ws.onmessage = (e) => {
          try {
            const msg = JSON.parse(e.data)
            if (msg.channel !== 'webData2') return

            const assetPositions = msg.data?.clearinghouseState?.assetPositions || []
            const curr = {}
            assetPositions.forEach(p => {
              const pos    = p.position
              const szi    = parseFloat(pos.szi || 0)
              if (szi === 0) return
              const entry  = parseFloat(pos.entryPx || 0)
              curr[pos.coin] = {
                side:     szi > 0 ? 'LONG' : 'SHORT',
                notional: Math.abs(szi) * entry,
                szi:      Math.abs(szi),
              }
            })

            const prev = prevPos.current[addr]
            if (!prev) {
              // İlk snapshot — kaydet, bildirim gönderme
              prevPos.current[addr] = curr
              return
            }

            const settings = followed[addr]
            const prevCoins = new Set(Object.keys(prev))
            const currCoins = new Set(Object.keys(curr))

            // Yeni açılan pozisyonlar
            currCoins.forEach(coin => {
              if (!prevCoins.has(coin)) {
                onAlert({
                  type:       'open',
                  traderName,
                  addr,
                  message:    `${coin} ${curr[coin].side} ${fmtUSD(curr[coin].notional)} açtı`,
                  coin,
                })
                // Copy trade: pozisyon açıldığında kopyala
                if (settings?.copyEnabled && onCopyTrade) {
                  onCopyTrade(addr, coin, curr[coin].side, curr[coin].notional, settings, 'open')
                }
              } else {
                // Mevcut pozisyon boyutu değişti mi? (%15+ değişim)
                const pNot = prev[coin].notional
                const cNot = curr[coin].notional
                const chg  = pNot > 0 ? Math.abs(cNot - pNot) / pNot : 0
                if (chg >= 0.15) {
                  const dir = cNot > pNot ? 'büyüttü' : 'küçülttü'
                  onAlert({
                    type:       'change',
                    traderName,
                    addr,
                    message:    `${coin} ${curr[coin].side} pozisyonunu ${dir} ${fmtUSD(pNot)} → ${fmtUSD(cNot)}`,
                    coin,
                  })
                }
              }
            })

            // Kapanan pozisyonlar
            prevCoins.forEach(coin => {
              if (!currCoins.has(coin)) {
                onAlert({
                  type:       'close',
                  traderName,
                  addr,
                  message:    `${coin} ${prev[coin].side} pozisyonunu kapattı`,
                  coin,
                })
                // Copy trade: otomatik kapat
                if (settings?.copyEnabled && settings?.autoClose && onCopyTrade) {
                  onCopyTrade(addr, coin, prev[coin].side, prev[coin].notional, settings, 'close')
                }
              }
            })

            prevPos.current[addr] = curr
          } catch (err) { console.warn('[SmartMoney] WS parse error', err) }
        }

        ws.onclose = () => {
          clearInterval(pingMap.current[addr])
          if (followed[addr]) {
            retries++
            if (retries < MAX_WS_RETRIES) {
              const delay = Math.min(2000 * Math.pow(2, retries - 1), 30000)
              setTimeout(connect, delay)
            }
          }
        }

        ws.onerror = () => ws.close()
      }

      connect()
    })

    // Takipten çıkarılanları kapat
    Object.keys(wsMap.current).forEach(addr => {
      if (!followed[addr]) {
        wsMap.current[addr]?.close()
        delete wsMap.current[addr]
        delete prevPos.current[addr]
        clearInterval(pingMap.current[addr])
      }
    })
  }, [followed, onAlert, onCopyTrade])

  // Unmount temizliği
  useEffect(() => {
    return () => {
      Object.values(wsMap.current).forEach(ws => ws?.close())
      Object.values(pingMap.current).forEach(id => clearInterval(id))
    }
  }, [])
}

/* ── Trader Row ─────────────────────────────────────────────────────────── */
function TraderRow({ trader, followed, followedSettings, onFollow, onSelect, selected }) {
  const pnl   = trader.pnl_alltime
  const roi   = trader.roi_alltime
  const month = trader.pnl_month

  return (
    <div
      className={`sm-trader-row ${selected ? 'sm-trader-selected' : ''}`}
      onClick={() => onSelect(trader)}
    >
      <div className="sm-trader-name">
        <WhaleAvatar />
        <div>
          <div className="sm-trader-display" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {trader.displayName}
            {followed && followedSettings?.copyEnabled && (
              <span style={{ fontSize: 9, background: 'rgba(0,217,146,0.15)', color: 'var(--accent)', borderRadius: 3, padding: '1px 5px', fontWeight: 700, letterSpacing: 0.5 }}>
                COPYING
              </span>
            )}
          </div>
          <div className="sm-trader-addr">{shortAddr(trader.address)}</div>
        </div>
      </div>
      <div className={`sm-stat ${pnl >= 0 ? 'pos' : 'neg'}`}>
        <div className="sm-stat-val">{fmtUSD(pnl)}</div>
        <div className="sm-stat-lbl">All-time PnL</div>
      </div>
      <div className={`sm-stat ${roi >= 0 ? 'pos' : 'neg'}`}>
        <div className="sm-stat-val">{fmtPct(roi)}</div>
        <div className="sm-stat-lbl">ROI</div>
      </div>
      <div className={`sm-stat ${month >= 0 ? 'pos' : 'neg'}`}>
        <div className="sm-stat-val">{fmtUSD(month)}</div>
        <div className="sm-stat-lbl">30d PnL</div>
      </div>
      <div className="sm-stat">
        <div className="sm-stat-val">{fmtUSD(trader.accountValue)}</div>
        <div className="sm-stat-lbl">Account</div>
      </div>
      <button
        className={`sm-follow-btn ${followed ? 'sm-follow-active' : ''}`}
        onClick={(e) => { e.stopPropagation(); onFollow(trader) }}
      >
        {followed ? '★ Following' : '☆ Follow'}
      </button>
    </div>
  )
}

/* ── Position Card ──────────────────────────────────────────────────────── */
function PositionCard({ pos }) {
  const isLong = pos.side === 'LONG'
  return (
    <div className={`sm-pos-card sm-pos-card-${isLong ? 'long' : 'short'}`}>
      <div className="sm-pos-header">
        <span className="sm-pos-coin">{pos.coin}</span>
        <span className={`sm-pos-side ${isLong ? 'long' : 'short'}`}>{pos.side}</span>
        {pos.leverage && <span className="sm-pos-lev">x{pos.leverage}</span>}
      </div>
      <div className="sm-pos-row">
        <span className="sm-pos-lbl">Size</span>
        <span className="sm-pos-val">{pos.size.toLocaleString('en-US', { maximumFractionDigits: 4 })}</span>
      </div>
      <div className="sm-pos-row">
        <span className="sm-pos-lbl">Entry</span>
        <span className="sm-pos-val">${fmtPrice(pos.entry_px)}</span>
      </div>
      <div className="sm-pos-row">
        <span className="sm-pos-lbl">Notional</span>
        <span className="sm-pos-val">{fmtUSD(pos.notional)}</span>
      </div>
      <div className="sm-pos-row">
        <span className="sm-pos-lbl">uPnL</span>
        <span className={`sm-pos-val ${pos.unrealized_pnl >= 0 ? 'pos' : 'neg'}`}>
          {fmtUSD(pos.unrealized_pnl)}
        </span>
      </div>
      {pos.liq_px && (
        <div className="sm-pos-row">
          <span className="sm-pos-lbl">Liq.</span>
          <span className="sm-pos-val neg">${fmtPrice(pos.liq_px)}</span>
        </div>
      )}
    </div>
  )
}

/* ── Copy Settings Modal ────────────────────────────────────────────────── */
function CopyModal({ trader, onClose, onSave }) {
  const [budget,      setBudget]      = useState('500')
  const [ratio,       setRatio]       = useState('1')
  const [autoClose,   setAutoClose]   = useState(true)
  const [copyEnabled, setCopyEnabled] = useState(false)

  return (
    <div className="sm-modal-overlay" onClick={onClose}>
      <div className="sm-modal" onClick={e => e.stopPropagation()}>
        <div className="sm-modal-title">Copy Trade Settings</div>
        <div className="sm-modal-sub">{trader.displayName}</div>
        <div className="sm-modal-field">
          <label>Max Budget (USD)</label>
          <input type="number" value={budget} onChange={e => setBudget(e.target.value)} placeholder="500" />
          <span className="sm-modal-hint">Bu trader için maksimum toplam marjin</span>
        </div>
        <div className="sm-modal-field">
          <label>Size Ratio (%)</label>
          <input type="number" value={ratio} onChange={e => setRatio(e.target.value)} placeholder="1" min="0.01" max="100" step="0.1" />
          <span className="sm-modal-hint">Trader'ın pozisyon büyüklüğünün %'si · örn. 1% → $5k pozisyon için $50</span>
        </div>
        <div className="sm-modal-toggle">
          <label>
            <input type="checkbox" checked={autoClose} onChange={e => setAutoClose(e.target.checked)} />
            Trader kapatınca otomatik kapat
          </label>
        </div>
        <div className="sm-modal-toggle" style={{ marginTop: 8, padding: '8px 0', borderTop: '1px solid var(--border-0)' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={copyEnabled} onChange={e => setCopyEnabled(e.target.checked)} />
            <span>
              <strong>Otomatik Copy Trade</strong>
              <span style={{ display: 'block', fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>
                Trader pozisyon açınca/kapatınca otomatik emir gönder (Paper Mode önerilir)
              </span>
            </span>
          </label>
        </div>
        {copyEnabled && (
          <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 6, padding: '8px 10px', fontSize: 10, color: '#f59e0b', marginTop: 8 }}>
            ⚠ Copy trade aktifken sistem, trader her pozisyon değişikliğinde otomatik emir gönderir.
            Lütfen Paper Mode'da test edin.
          </div>
        )}
        <div className="sm-modal-actions">
          <button className="sm-modal-cancel" onClick={onClose}>İptal</button>
          <button className="sm-modal-save" onClick={() => onSave({ budget: parseFloat(budget) || 500, ratio: parseFloat(ratio) || 1, autoClose, copyEnabled })}>
            Takibi Başlat
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Main Component ─────────────────────────────────────────────────────── */
export default function SmartMoney() {
  const { token } = useAuth()
  const [traders,    setTraders]    = useState([])
  const [loading,    setLoading]    = useState(true)
  const [selected,   setSelected]   = useState(null)
  const [positions,  setPositions]  = useState(null)
  const [posLoading, setPosLoading] = useState(false)
  const [followed,   setFollowed]   = useState(() => {
    try { return JSON.parse(localStorage.getItem('sm_followed') || '{}') } catch { return {} }
  })
  const [copyModal,  setCopyModal]  = useState(null)
  const [sortBy,     setSortBy]     = useState('pnl_alltime')
  const [filter,     setFilter]     = useState('')
  const [alerts,     setAlerts]     = useState([])
  const [copyLogs,   setCopyLogs]   = useState([])
  const alertIdRef = useRef(0)
  const copyEventGuardRef = useRef({})

  // Bildirim izni al
  useEffect(() => { requestNotifPermission() }, [])

  // Yeni alert ekle
  const onAlert = useCallback((data) => {
    const id = ++alertIdRef.current
    const alert = { id, ...data, ts: Date.now() }

    setAlerts(prev => [alert, ...prev].slice(0, 5))  // max 5 toast

    // Browser notification (başka sekmede olsa bile)
    if (Notification.permission === 'granted') {
      const icons = { open: '▲', close: '▼', change: '↕' }
      new Notification(`${icons[data.type]} ${data.traderName}`, {
        body: data.message,
        tag:  `sm-${data.addr}-${data.coin}`,
        silent: false,
      })
    }

    // 10s sonra otomatik kaldır
    setTimeout(() => setAlerts(prev => prev.filter(a => a.id !== id)), 10000)
  }, [])

  const pushCopyLog = useCallback((entry) => {
    const ts = Date.now()
    setCopyLogs(prev => [{ id: ts + Math.random(), ts, ...entry }, ...prev].slice(0, 10))
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
    } catch (err) { console.warn('[SmartMoney] sync followed error', err) }
  }, [token])

  // Copy trade emir gönderimi
  const sendCopyOrder = useCallback(async (addr, coin, side, notional, settings, action) => {
    if (!token) return
    const safeCoin = String(coin || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
    if (!safeCoin) return
    // action='open': trader yönünde aç; action='close': ters yönde kapat
    const symbol = safeCoin.endsWith('USDT') ? safeCoin : `${safeCoin}USDT`
    const rawSize = notional * ((settings.ratio || 1) / 100)
    const size = Number(Math.min(rawSize, settings.budget || 500).toFixed(2))
    if (size < 10) return  // $10 altı işleme değmez

    const roundedNotional = Math.round(Number(notional) || 0)
    const eventKey = `${addr}:${action}:${symbol}:${side}:${roundedNotional}`
    const nowTs = Date.now()
    const lastTs = copyEventGuardRef.current[eventKey] || 0
    if (nowTs - lastTs < 12000) {
      pushCopyLog({
        status: 'skip',
        traderName: followed[addr]?.displayName || shortAddr(addr),
        action,
        symbol,
        detail: 'Tekrarlayan sinyal filtrelendi',
      })
      return
    }
    copyEventGuardRef.current[eventKey] = nowTs

    // Guard map'i küçük tut
    Object.keys(copyEventGuardRef.current).forEach((k) => {
      if (nowTs - copyEventGuardRef.current[k] > 120000) delete copyEventGuardRef.current[k]
    })

    let dir
    let cmd
    if (action === 'open') {
      dir = side === 'LONG' ? 'long' : 'short'
      cmd = `${dir} ${symbol} ${size} 1`
    } else {
      // Kapat: takipçi hesapta drift olmaması için doğrudan close kullan
      cmd = `close ${symbol}`
    }
    pushCopyLog({
      status: 'pending',
      traderName: followed[addr]?.displayName || shortAddr(addr),
      action,
      symbol,
      detail: cmd,
    })

    try {
      const res = await fetch(`${API_BASE}/api/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ command: cmd }),
      })
      let payload = {}
      try { payload = await res.json() } catch (err) { console.warn('[SmartMoney] json parse error', err) }

      if (!res.ok) {
        const msg = payload?.detail || payload?.error || `HTTP ${res.status}`
        throw new Error(String(msg))
      }
      if (payload?.ok === false) {
        throw new Error(payload?.error || 'Komut başarısız')
      }
      const errorRow = Array.isArray(payload?.results)
        ? payload.results.find((r) => r?.style === 'error')
        : null
      if (errorRow?.text) {
        throw new Error(errorRow.text)
      }
      pushCopyLog({
        status: 'ok',
        traderName: followed[addr]?.displayName || shortAddr(addr),
        action,
        symbol,
        detail: cmd,
      })
    } catch (err) {
      delete copyEventGuardRef.current[eventKey]
      pushCopyLog({
        status: 'error',
        traderName: followed[addr]?.displayName || shortAddr(addr),
        action,
        symbol,
        detail: err?.message || 'Bilinmeyen hata',
      })
      onAlert({
        type: 'error',
        traderName: followed[addr]?.displayName || shortAddr(addr),
        addr,
        message: `${symbol} copy emri başarısız: ${err?.message || 'Bilinmeyen hata'}`,
        coin: symbol,
      })
    }
  }, [token, onAlert, followed, pushCopyLog])

  // WebSocket tracker — takip edilen her trader için
  useTraderWatcher(followed, onAlert, sendCopyOrder)

  // Leaderboard yükle
  useEffect(() => {
    setLoading(true)
    fetch(`${API}/leaderboard`)
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setTraders(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  // Follow ayarlarını kullanıcı bazlı backend'den yükle
  useEffect(() => {
    if (!token) return
    fetch(`${API_BASE}/api/smart-money/followed`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => {
        const remote = data?.followed
        if (remote && typeof remote === 'object') {
          setFollowed(remote)
          localStorage.setItem('sm_followed', JSON.stringify(remote))
        }
      })
      .catch(() => {})
  }, [token])

  // Seçili trader pozisyonları
  useEffect(() => {
    if (!selected) return
    setPosLoading(true)
    setPositions(null)
    fetch(`${API}/positions/${selected.address}`)
      .then(r => r.json())
      .then(data => { setPositions(data); setPosLoading(false) })
      .catch(() => setPosLoading(false))

    const id = setInterval(() => {
      fetch(`${API}/positions/${selected.address}`)
        .then(r => r.json())
        .then(data => setPositions(data))
        .catch(() => {})
    }, 15000)
    return () => clearInterval(id)
  }, [selected])

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

  const displayed = traders
    .filter(t =>
      !filter ||
      t.displayName.toLowerCase().includes(filter.toLowerCase()) ||
      t.address.toLowerCase().includes(filter.toLowerCase())
    )
    .sort((a, b) => {
      if (sortBy === 'pnl_month')    return b.pnl_month - a.pnl_month
      if (sortBy === 'roi_alltime')  return b.roi_alltime - a.roi_alltime
      if (sortBy === 'accountValue') return b.accountValue - a.accountValue
      return b.pnl_alltime - a.pnl_alltime
    })

  const followedCount = Object.keys(followed).length

  return (
    <div className="smart-money-page">
      {/* ── Alert Toasts ── */}
      <AlertToast alerts={alerts} onDismiss={id => setAlerts(prev => prev.filter(a => a.id !== id))} />

      {/* ── Header ── */}
      <div className="sm-header">
        <div className="sm-header-left">
          <div className="sm-title">Smart Money</div>
          <div className="sm-sub">
            Hyperliquid Top Traders · {traders.length} traders
            {followedCount > 0 && (
              <span className="sm-ws-dot" title="WebSocket aktif" />
            )}
          </div>
        </div>
        <div className="sm-header-right">
          {followedCount > 0 && (
            <span className="sm-following-badge">● {followedCount} takipte · CANLI</span>
          )}
          <input
            className="sm-search"
            placeholder="Trader ara…"
            value={filter}
            onChange={e => setFilter(e.target.value)}
          />
          <select className="sm-sort" value={sortBy} onChange={e => setSortBy(e.target.value)}>
            <option value="pnl_alltime">All-time PnL</option>
            <option value="pnl_month">30d PnL</option>
            <option value="roi_alltime">ROI</option>
            <option value="accountValue">Account Value</option>
          </select>
        </div>
      </div>

      <div className="sm-body">
        {/* ── Trader Listesi ── */}
        <div className="sm-list">
          {loading ? (
            <div className="sm-loading">Yükleniyor…</div>
          ) : displayed.length === 0 ? (
            <div className="sm-loading">Trader bulunamadı</div>
          ) : (
            displayed.map(t => (
              <TraderRow
                key={t.address}
                trader={t}
                followed={!!followed[t.address]}
                followedSettings={followed[t.address] || null}
                onFollow={handleFollow}
                onSelect={setSelected}
                selected={selected?.address === t.address}
              />
            ))
          )}
        </div>

        {/* ── Pozisyon Paneli ── */}
        {selected && (
          <div className="sm-detail">
            <div className="sm-detail-header">
              <div>
                <div className="sm-detail-name">{selected.displayName}</div>
                <div className="sm-detail-addr">{selected.address}</div>
              </div>
              {positions && <div className="sm-detail-val">{fmtUSD(positions.accountValue)}</div>}
              <button className="sm-detail-close" onClick={() => setSelected(null)}>✕</button>
            </div>
            {posLoading ? (
              <div className="sm-loading">Pozisyonlar yükleniyor…</div>
            ) : positions?.positions?.length === 0 ? (
              <div className="sm-loading">Açık pozisyon yok</div>
            ) : (
              <div className="sm-pos-grid">
                {(positions?.positions || []).map(pos => (
                  <PositionCard key={pos.coin} pos={pos} />
                ))}
              </div>
            )}
            <div className="sm-copy-log">
              <div className="sm-copy-log-head">
                <span>Copy Activity</span>
                <span>{copyLogs.length}</span>
              </div>
              {copyLogs.length === 0 ? (
                <div className="sm-copy-log-empty">Henüz copy işlem kaydı yok</div>
              ) : (
                <div className="sm-copy-log-list">
                  {copyLogs.map(row => (
                    <div key={row.id} className={`sm-copy-log-row sm-copy-${row.status}`}>
                      <span className="sm-copy-dot" />
                      <div className="sm-copy-main">
                        <div className="sm-copy-title">
                          {row.traderName} · {row.symbol} · {row.action === 'open' ? 'Açılış' : 'Kapanış'}
                        </div>
                        <div className="sm-copy-detail">{row.detail}</div>
                      </div>
                      <div className="sm-copy-time">
                        {new Date(row.ts).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="sm-detail-note">15sn güncelleniyor · Hyperliquid Mainnet</div>
          </div>
        )}
      </div>

      {/* ── Copy Modal ── */}
      {copyModal && (
        <CopyModal
          trader={copyModal}
          onClose={() => setCopyModal(null)}
          onSave={handleSaveCopy}
        />
      )}
    </div>
  )
}
