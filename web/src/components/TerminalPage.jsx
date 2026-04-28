import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useWebSocket } from '../hooks/useWebSocket'
import { useNewsAlert } from '../hooks/useNewsAlert'
import { useNotifications } from '../hooks/useNotifications'
import { useTradingConnect } from '../hooks/useTradingConnect'
import { useAuth } from '../context/AuthContext'
import { API_BASE } from '../config'
import { COINS } from '../constants/terminal'
import TerminalNewsFeed from './TerminalNewsFeed'
import TerminalCoinBar from './TerminalCoinBar'
import TerminalBottomTabs from './TerminalBottomTabs'
import ShortcutsModal from './modals/ShortcutsModal'
import ConnectHLModal from './modals/ConnectHLModal'
import ConnectBinanceModal from './modals/ConnectBinanceModal'
import { COINS as DEFAULT_COINS } from '../constants/terminal'

import TopStatusBar from './terminal/TopStatusBar'
import QuickAlertsPanel from './terminal/QuickAlertsPanel'
import BracketOrderPanel from './terminal/BracketOrderPanel'
import CommandConsole from './terminal/CommandConsole'
import ChartPanel from './terminal/ChartPanel'
import { createWsMessageHandler } from './terminal/wsHandlers'
import { useTerminalStatus } from '../hooks/useTerminalStatus'
import { useTradingActions } from '../hooks/useTradingActions'

export default function TerminalPage() {
    const { token } = useAuth()

    // ─── Core trading state
    const [tickers, setTickers] = useState({})
    const [news, setNews] = useState([])
    const [newsHealth, setNewsHealth] = useState([])
    const [positions, setPositions] = useState({})
    const [logs, setLogs] = useState([])
    const [balance, setBalance] = useState(10000)
    const [freeMargin, setFreeMargin] = useState(null)
    const [marginUsed, setMarginUsed] = useState(0)
    const [hlSpot, setHlSpot] = useState(0)
    const [unrealizedTotal, setUnrealizedTotal] = useState(0)
    const [realizedToday, setRealizedToday] = useState(0)
    const [connected, setConnected] = useState(false)
    const [wsRetries, setWsRetries] = useState(0)
    const [wsGaveUp, setWsGaveUp] = useState(false)
    const [slInputs, setSlInputs] = useState({})
    const [tpInputs, setTpInputs] = useState({})
    const [staleSymbols, setStaleSymbols] = useState([])

    // ─── Bracket order state
    const [bracketMode, setBracketMode] = useState(false)
    const [bracketTP, setBracketTP] = useState('')
    const [bracketSL, setBracketSL] = useState('')
    const [bracketRisk, setBracketRisk] = useState(() => localStorage.getItem('nt_bracket_risk') || '1')
    const bracketRef = useRef({ enabled: false, tp: '', sl: '' })

    // ─── Command input state
    const [cmdLoading, setCmdLoading] = useState(false)
    const [input, setInput] = useState('')
    const [history, setHistory] = useState([])
    const [histIdx, setHistIdx] = useState(-1)

    // ─── UI preferences
    const [soundOn, setSoundOn] = useState(true)
    const [newsCoinInputs, setNewsCoinInputs] = useState({})
    const [leverages, setLeverages] = useState(() => {
        try { return JSON.parse(localStorage.getItem('nt_leverages')) || [5, 10, 15] } catch { return [5, 10, 15] }
    })
    const [showLevSettings, setShowLevSettings] = useState(false)
    const [levInputs, setLevInputs] = useState(leverages.map(String))
    const [tradeBalance, setTradeBalance] = useState(() => {
        try { return parseFloat(localStorage.getItem('nt_trade_balance')) || 10000 } catch { return 10000 }
    })
    const [showBalSettings, setShowBalSettings] = useState(false)
    const [balInput, setBalInput] = useState(() => {
        try { return localStorage.getItem('nt_trade_balance') || '10000' } catch { return '10000' }
    })
    const [showShortcuts, setShowShortcuts] = useState(false)

    // ─── Chart state
    const [chartSymbol, setChartSymbol] = useState(() => {
        const sym = sessionStorage.getItem('tt_trade_symbol')
        if (!sym) return 'BTCUSDT'
        return sym.endsWith('USDT') ? sym : sym + 'USDT'
    })
    const [searchSymbol, setSearchSymbol] = useState('')
    const [chartInterval, setChartInterval] = useState('15m')
    const [chartMode, setChartMode] = useState(() =>
      localStorage.getItem('nt_chart_mode') || 'tv'
    )
    const [allSymbols, setAllSymbols] = useState([])

    // ─── Bottom tabs state
    const [activeTab, setActiveTab] = useState('positions')
    const [openOrders, setOpenOrders] = useState([])
    const [tradeHistory, setTradeHistory] = useState([])
    const [focusedTP, setFocusedTP] = useState(null)
    const [focusedSL, setFocusedSL] = useState(null)
    const [editingTPSL, setEditingTPSL] = useState(null)
    const [fundingHistory, setFundingHistory] = useState([])
    const [balances, setBalances] = useState(null)
    const [tabLoading, setTabLoading] = useState(false)
    const [quickAlerts, setQuickAlerts] = useState([])
    const [quickAlertCoin, setQuickAlertCoin] = useState(() => {
        const sym = sessionStorage.getItem('tt_trade_symbol') || 'BTC'
        return sym.replace(/USDT$/i, '').toUpperCase()
    })
    const [quickAlertDirection, setQuickAlertDirection] = useState('above')
    const [quickAlertPrice, setQuickAlertPrice] = useState('')
    const [quickAlertBusy, setQuickAlertBusy] = useState(false)
    const [quickAlertsCollapsed, setQuickAlertsCollapsed] = useState(true)
    // Conditional order: alarm tetiklendiğinde otomatik emir
    const [quickAlertAction, setQuickAlertAction] = useState('notify')   // notify | long | short | close
    const [quickAlertActionAmount, setQuickAlertActionAmount] = useState('')
    const [quickAlertActionLev, setQuickAlertActionLev] = useState('10')

    // ─── Refs
    const logRef = useRef(null)
    const inputRef = useRef(null)
    const quickCmdHandledRef = useRef(false)
    const chartSearchInputRef = useRef(null)
    const chartToolbarLockRef = useRef(false)
    const lastTickRef = useRef({})  // { [symbol]: tsMs } — stale-data uyarısı için
    const [chartStaleMs, setChartStaleMs] = useState(0)
    const liveChartTicker = (() => {
        const q = (searchSymbol || '').trim().toUpperCase()
        if (!q) return chartSymbol
        return q.endsWith('USDT') ? q : `${q}USDT`
    })()

    // ─── Hooks
    const { alertNews, alertAlarm } = useNewsAlert(soundOn)
    const { notifEnabled, notifEnabledRef, sendNotif, toggleNotif } = useNotifications()

    const addLog = useCallback((text, style = 'info') =>
        setLogs(prev => [...prev.slice(-200), { text, style, ts: Date.now() }]), [])

    const connect = useTradingConnect({ token, addLog })
    const exchangeConnected = connect.tradingMode === 'LIVE' || connect.tradingMode === 'LIVE_BINANCE'
    const exchangeConnecting = connect.hlPendingConnect || connect.hlConnecting || connect.bnbConnecting
    const exchangeStatusLabel = exchangeConnecting ? 'CONNECTING...' : exchangeConnected ? 'CONNECTED' : 'PAPER'

    // Ref'e al — useEffect deps'lerini sabit tutmak için
    const connectRef = useRef(connect)
    const addLogRef  = useRef(addLog)
    const tokenRef   = useRef(token)
    useEffect(() => { connectRef.current = connect }, [connect])
    useEffect(() => { addLogRef.current  = addLog  }, [addLog])
    useEffect(() => { tokenRef.current   = token   }, [token])

    // /api/status + /api/alerts polling + tt-trading-sync listener — hooks/useTerminalStatus
    const { fetchStatus, fetchQuickAlerts } = useTerminalStatus({
        token, tokenRef, connectRef, addLogRef,
        setTickers, setNews, setNewsHealth,
        setPositions, setSlInputs, setTpInputs,
        setStaleSymbols, setBalance, setFreeMargin,
        setMarginUsed, setHlSpot,
        setUnrealizedTotal, setRealizedToday,
        setQuickAlerts,
    })

    // ─── Binance full symbol list (for autocomplete)
    useEffect(() => {
        fetch(`${API_BASE}/api/binance/exchange-info`)
            .then(r => r.json())
            .then(data => {
                const syms = (data.symbols || [])
                    .filter(s => s.status === 'TRADING' && s.quoteAsset === 'USDT')
                    .map(s => s.symbol)
                    .sort()
                setAllSymbols(syms)
            })
            .catch(() => {})
    }, [])

    const wsSymbols = useMemo(() => Array.from(new Set([
        ...DEFAULT_COINS.map(c => c.sym),
        chartSymbol,
        ...Object.keys(positions),
        ...news.flatMap(n => (n.mentioned_assets || []).flatMap(ma => ma.tradable_symbols || [])),
    ].filter(Boolean))).slice(0, 80), [chartSymbol, positions, news])

    const newsSymbols = useMemo(() => (
        Array.from(new Set(
            news.flatMap(n => (n.mentioned_assets || []).flatMap(ma => ma.tradable_symbols || []))
        ))
            .filter(Boolean)
            .slice(0, 120)
    ), [news])

    // ─── Binance REST — initial prices for watchlist
    useEffect(() => {
        const symbols = COINS.map(c => c.sym)
        const symbolsParam = JSON.stringify(symbols)
        let cancelled = false
        const fetchPrices = async () => {
            try {
                const [priceRes, tickerRes] = await Promise.all([
                    fetch(`${API_BASE}/api/binance/ticker/price?symbols=${encodeURIComponent(symbolsParam)}`),
                    fetch(`${API_BASE}/api/binance/ticker/24hr?symbols=${encodeURIComponent(symbolsParam)}`),
                ])
                const prices = await priceRes.json()
                const tickers24 = await tickerRes.json()
                const priceMap = {}, chgMap = {}
                if (Array.isArray(prices)) prices.forEach(p => { priceMap[p.symbol] = parseFloat(p.price) })
                if (Array.isArray(tickers24)) tickers24.forEach(t => { chgMap[t.symbol] = parseFloat(t.priceChangePercent) })
                if (cancelled) return
                setTickers(prev => {
                    const next = { ...prev }
                    symbols.forEach(sym => {
                        const patch = {}
                        if (priceMap[sym] != null && Number.isFinite(priceMap[sym])) patch.last_price = priceMap[sym]
                        if (chgMap[sym] != null && Number.isFinite(chgMap[sym])) patch.change_24h_pct = chgMap[sym]
                        if (Object.keys(patch).length) {
                            next[sym] = { ...next[sym], ...patch }
                        }
                    })
                    return next
                })
            } catch (err) { console.warn('[Terminal] fetchPrices error', err) }
        }
        fetchPrices()
        const id = setInterval(fetchPrices, 5000)
        return () => {
            cancelled = true
            clearInterval(id)
        }
    }, [])

    useEffect(() => {
        if (!newsSymbols.length) return
        const missing = newsSymbols.filter(sym => {
            const t = tickers[sym]
            return !t || t.last_price == null || t.change_24h_pct == null
        })
        if (!missing.length) return

        const symbolsParam = JSON.stringify(missing.slice(0, 80))
        let cancelled = false

        const hydrateNewsPrices = async () => {
            try {
                const [priceRes, tickerRes] = await Promise.all([
                    fetch(`${API_BASE}/api/binance/ticker/price?symbols=${encodeURIComponent(symbolsParam)}`),
                    fetch(`${API_BASE}/api/binance/ticker/24hr?symbols=${encodeURIComponent(symbolsParam)}`),
                ])
                const prices = await priceRes.json()
                const tickers24 = await tickerRes.json()
                if (cancelled) return

                const priceMap = {}
                const chgMap = {}
                if (Array.isArray(prices)) prices.forEach(p => { priceMap[p.symbol] = parseFloat(p.price) })
                if (Array.isArray(tickers24)) tickers24.forEach(t => { chgMap[t.symbol] = parseFloat(t.priceChangePercent) })

                setTickers(prev => {
                    const next = { ...prev }
                    missing.forEach(sym => {
                        const patch = {}
                        if (priceMap[sym] != null && Number.isFinite(priceMap[sym])) patch.last_price = priceMap[sym]
                        if (chgMap[sym] != null && Number.isFinite(chgMap[sym])) patch.change_24h_pct = chgMap[sym]
                        if (Object.keys(patch).length) next[sym] = { ...next[sym], ...patch }
                    })
                    return next
                })
            } catch (err) {
                console.warn('[Terminal] hydrateNewsPrices error', err)
            }
        }

        hydrateNewsPrices()
        return () => { cancelled = true }
    }, [newsSymbols, tickers])

    // ─── Navigate-to-symbol from other pages
    useEffect(() => {
        const handler = (e) => {
            if (e.detail?.symbol) {
                const sym = e.detail.symbol
                const full = sym.endsWith('USDT') ? sym : sym + 'USDT'
                setChartSymbol(full)
                sessionStorage.setItem('tt_trade_symbol', sym.replace(/USDT$/, ''))
                setQuickAlertCoin(sym.replace(/USDT$/, '').toUpperCase())
            }
            if (e.detail?.command) {
                const cmd = String(e.detail.command).trim()
                if (!cmd) return
                setInput(cmd)
                if (e.detail?.autoSend) {
                    executeCommand(cmd)
                }
            }
        }
        window.addEventListener('tt-navigate', handler)
        return () => window.removeEventListener('tt-navigate', handler)
    }, [cmdLoading])

    // ─── One-shot pending command (from Stocks quick trade)
    useEffect(() => {
        if (quickCmdHandledRef.current) return
        const cmd = sessionStorage.getItem('tt_terminal_prefill_cmd')
        if (!cmd) return

        quickCmdHandledRef.current = true
        const autoSend = sessionStorage.getItem('tt_terminal_autosend') === '1'
        sessionStorage.removeItem('tt_terminal_prefill_cmd')
        sessionStorage.removeItem('tt_terminal_autosend')

        setInput(cmd)
        if (autoSend) {
            executeCommand(cmd)
        }
    }, [cmdLoading])

    // ─── WebSocket handler — switch case'i terminal/wsHandlers.js'e taşındı
    useWebSocket(useCallback(createWsMessageHandler({
        setTickers, setNews, setPositions, setSlInputs, setTpInputs,
        setBalance, setConnected, setWsRetries, setWsGaveUp,
        addLog, alertNews, alertAlarm, notifEnabledRef, sendNotif,
        fetchStatus, fetchQuickAlerts, lastTickRef,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }), [addLog, alertNews, alertAlarm, sendNotif, fetchQuickAlerts]), wsSymbols, {
        onStatusChange: ({ connected: c, retries, gaveUp }) => {
            setConnected(c)
            setWsRetries(retries ?? 0)
            if (gaveUp) setWsGaveUp(true)
        }
    })

    // ─── Auto-scroll logs
    useEffect(() => {
        if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
    }, [logs])

    // ─── Stale-data watchdog: chart sembolü için son tick'in yaşını 2s'de bir hesapla
    useEffect(() => {
        const id = setInterval(() => {
            const t = lastTickRef.current[chartSymbol]
            setChartStaleMs(t ? Date.now() - t : 0)
        }, 2000)
        return () => clearInterval(id)
    }, [chartSymbol])

    // ─── Trading actions hook (executeCommand, sendOrder, handleSubmit, onKeyDown, autocomplete)
    const {
        executeCommand,
        sendOrder,
        handleSubmit,
        onKeyDown,
        filteredCmds,
        symbolMatches,
        inputParts: _inputParts,
    } = useTradingActions({
        token, cmdLoading, setCmdLoading, addLog,
        positions, tradingMode: connect.tradingMode,
        bracketRef, bracketMode, bracketTP, bracketSL,
        input, setInput, history, setHistory, histIdx, setHistIdx,
        setShowShortcuts,
        setBalance, setUnrealizedTotal, setRealizedToday,
        setFreeMargin, setMarginUsed, setPositions,
        allSymbols, tickers,
    })

    // ─── Tab data fetch
    const fetchOpenOrdersSilently = useCallback(async () => {
        if (!token) return
        try {
            const d = await fetch(`${API_BASE}/api/open-orders`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json())
            setOpenOrders(d.orders || [])
        } catch (err) { console.warn('[Terminal] fetchOpenOrders error', err) }
    }, [token])

    const fetchTab = async (tab) => {
        setActiveTab(tab)
        if (tab === 'positions') return
        setTabLoading(true)
        try {
            const headers = token ? { Authorization: `Bearer ${token}` } : {}
            if (tab === 'orders') {
                const d = await fetch(`${API_BASE}/api/open-orders`, { headers }).then(r => r.json())
                setOpenOrders(d.orders || [])
            } else if (tab === 'history') {
                const d = await fetch(`${API_BASE}/api/trade-history`, { headers }).then(r => r.json())
                setTradeHistory(d.trades || [])
            } else if (tab === 'funding') {
                const d = await fetch(`${API_BASE}/api/funding-history`, { headers }).then(r => r.json())
                setFundingHistory(d.funding || [])
            } else if (tab === 'balances') {
                const d = await fetch(`${API_BASE}/api/balances`, { headers }).then(r => r.json())
                setBalances(d.balances || null)
            }
        } catch (e) { addLog(`[error] tab fetch: ${e.message}`, 'error') }
        finally { setTabLoading(false) }
    }

    const createQuickAlert = async () => {
        const coin = quickAlertCoin.trim().toUpperCase().replace(/USDT$/i, '')
        const target = parseFloat(quickAlertPrice)
        if (!coin || !Number.isFinite(target) || target <= 0 || !token) return
        // Conditional order payload'ı
        const payload = { coin, direction: quickAlertDirection, target_price: target }
        if (quickAlertAction !== 'notify') {
            payload.action = quickAlertAction
            if (quickAlertAction === 'long' || quickAlertAction === 'short') {
                const amt = parseFloat(quickAlertActionAmount)
                const lev = parseInt(quickAlertActionLev, 10)
                if (!Number.isFinite(amt) || amt <= 0) {
                    addLog('[alert] action için amount gerekli', 'error')
                    return
                }
                if (!Number.isFinite(lev) || lev < 1 || lev > 125) {
                    addLog('[alert] leverage 1–125 arası olmalı', 'error')
                    return
                }
                payload.action_amount_usd = amt
                payload.action_leverage = lev
            }
        }
        setQuickAlertBusy(true)
        try {
            const res = await fetch(`${API_BASE}/api/alerts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(payload),
            })
            if (!res.ok) {
                const d = await res.json().catch(() => ({}))
                addLog(`[alert] ${d?.detail || 'Alarm oluşturulamadı'}`, 'error')
            } else {
                addLog(`[alert] ${coin} ${quickAlertDirection} $${target}`, 'success')
                setQuickAlertPrice('')
                fetchQuickAlerts()
            }
        } catch (e) {
            addLog(`[alert] ${e.message}`, 'error')
        } finally {
            setQuickAlertBusy(false)
        }
    }

    const deleteQuickAlert = async (id) => {
        if (!token) return
        try {
            await fetch(`${API_BASE}/api/alerts/${id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
            })
            fetchQuickAlerts()
        } catch (e) {
            addLog(`[alert] ${e.message}`, 'error')
        }
    }

    // ─── Disconnect guard — açık pozisyon varken kazara kopmayı engelle
    const confirmDisconnect = (venue, disconnectFn) => {
        const openCount = Object.keys(positions).length
        const msg =
            `${venue} bağlantısını kes?\n\n` +
            (openCount > 0
                ? `⚠ ${openCount} açık pozisyonun var. Bağlantı kesildikten sonra:\n` +
                  '  • Pozisyonlar borsada açık kalır\n' +
                  '  • Canlı PnL ve TP/SL tetiklemesi güncellenmez\n' +
                  '  • Panic close / quick close çalışmaz\n\n'
                : '') +
            'Devam edilsin mi?'
        if (window.confirm(msg)) disconnectFn()
    }
    const chartBase = chartSymbol.replace(/USDT$/i, '').toUpperCase()
    const chartAlertLines = quickAlerts.filter((a) => {
        if (a.triggered) return false
        const c = String(a.coin || '').toUpperCase().replace(/USDT$/i, '')
        return c === chartBase
    })

    const recentAlerts = quickAlerts.slice(0, 5)
    const posEntries = Object.entries(positions)

    return (
        <>
        <div className="nt-layout">
            {/* ═══ TOP STATUS BAR ═══ */}
            <TopStatusBar
                balance={balance}
                freeMargin={freeMargin}
                marginUsed={marginUsed}
                hlSpot={hlSpot}
                token={token}
                addLog={addLog}
                onTransferDone={() => fetchStatus({ silent: true })}
                unrealizedTotal={unrealizedTotal}
                realizedToday={realizedToday}
                connect={connect}
                confirmDisconnect={confirmDisconnect}
                exchangeConnecting={exchangeConnecting}
                exchangeConnected={exchangeConnected}
                exchangeStatusLabel={exchangeStatusLabel}
                soundOn={soundOn}
                setSoundOn={setSoundOn}
                notifEnabled={notifEnabled}
                toggleNotif={toggleNotif}
                showShortcuts={showShortcuts}
                setShowShortcuts={setShowShortcuts}
                leverages={leverages}
                setLeverages={setLeverages}
                levInputs={levInputs}
                setLevInputs={setLevInputs}
                showLevSettings={showLevSettings}
                setShowLevSettings={setShowLevSettings}
                tradeBalance={tradeBalance}
                setTradeBalance={setTradeBalance}
                balInput={balInput}
                setBalInput={setBalInput}
                showBalSettings={showBalSettings}
                setShowBalSettings={setShowBalSettings}
            />

            {/* ═══ COIN QUICK-TRADE BAR ═══ */}
            <TerminalCoinBar
                COINS={COINS}
                tickers={tickers}
                chartSymbol={chartSymbol}
                setChartSymbol={setChartSymbol}
                leverages={leverages}
                tradeBalance={tradeBalance}
                sendOrder={sendOrder}
                staleSymbols={staleSymbols}
            />

            {/* ═══ MAIN AREA ═══ */}
            <div className="nt-main">
                <TerminalNewsFeed
                    news={news}
                    newsHealth={newsHealth}
                    newsCoinInputs={newsCoinInputs}
                    setNewsCoinInputs={setNewsCoinInputs}
                    setChartSymbol={setChartSymbol}
                    tickers={tickers}
                    supportedSymbols={allSymbols}
                    tradeBalance={tradeBalance}
                    leverages={leverages}
                    sendOrder={sendOrder}
                    addLog={addLog}
                    wsConnected={connected}
                />

                <div className="nt-right">
                    <QuickAlertsPanel
                        quickAlerts={quickAlerts}
                        quickAlertsCollapsed={quickAlertsCollapsed}
                        setQuickAlertsCollapsed={setQuickAlertsCollapsed}
                        quickAlertCoin={quickAlertCoin}
                        setQuickAlertCoin={setQuickAlertCoin}
                        quickAlertDirection={quickAlertDirection}
                        setQuickAlertDirection={setQuickAlertDirection}
                        quickAlertPrice={quickAlertPrice}
                        setQuickAlertPrice={setQuickAlertPrice}
                        quickAlertBusy={quickAlertBusy}
                        quickAlertAction={quickAlertAction}
                        setQuickAlertAction={setQuickAlertAction}
                        quickAlertActionAmount={quickAlertActionAmount}
                        setQuickAlertActionAmount={setQuickAlertActionAmount}
                        quickAlertActionLev={quickAlertActionLev}
                        setQuickAlertActionLev={setQuickAlertActionLev}
                        createQuickAlert={createQuickAlert}
                        deleteQuickAlert={deleteQuickAlert}
                        recentAlerts={recentAlerts}
                    />
                    {/* ─── Bracket Order Panel ─── */}
                    <BracketOrderPanel
                        bracketMode={bracketMode}
                        setBracketMode={setBracketMode}
                        bracketTP={bracketTP}
                        setBracketTP={setBracketTP}
                        bracketSL={bracketSL}
                        setBracketSL={setBracketSL}
                        bracketRisk={bracketRisk}
                        setBracketRisk={setBracketRisk}
                        curPrice={tickers[chartSymbol]?.last_price}
                        tradeBalance={tradeBalance}
                    />

                    {/* ─── Command Input + Autocomplete ─── */}
                    <CommandConsole
                        input={input}
                        setInput={setInput}
                        inputRef={inputRef}
                        onKeyDown={onKeyDown}
                        handleSubmit={handleSubmit}
                        cmdLoading={cmdLoading}
                        filteredCmds={filteredCmds}
                        symbolMatches={symbolMatches}
                        tickers={tickers}
                        inputParts={_inputParts}
                        logs={logs}
                        logRef={logRef}
                        setLogs={setLogs}
                    />

                    {/* ─── Chart ─── */}
                    <ChartPanel
                        chartSymbol={chartSymbol}
                        setChartSymbol={setChartSymbol}
                        chartInterval={chartInterval}
                        setChartInterval={setChartInterval}
                        chartMode={chartMode}
                        setChartMode={setChartMode}
                        searchSymbol={searchSymbol}
                        setSearchSymbol={setSearchSymbol}
                        chartSearchInputRef={chartSearchInputRef}
                        chartToolbarLockRef={chartToolbarLockRef}
                        liveChartTicker={liveChartTicker}
                        chartStaleMs={chartStaleMs}
                        connected={connected}
                        allSymbols={allSymbols}
                        tickers={tickers}
                        chartAlertLines={chartAlertLines}
                        positions={positions}
                        openOrders={openOrders}
                        setInput={setInput}
                        inputRef={inputRef}
                        setPositions={setPositions}
                        setTpInputs={setTpInputs}
                        setSlInputs={setSlInputs}
                        executeCommand={executeCommand}
                    />
                </div>
            </div>

            {/* ═══ BOTTOM TABS ═══ */}
            <TerminalBottomTabs
                token={token}
                activeTab={activeTab}
                fetchTab={fetchTab}
                fetchOpenOrdersSilently={fetchOpenOrdersSilently}
                tabLoading={tabLoading}
                posEntries={posEntries}
                openOrders={openOrders}
                tradeHistory={tradeHistory}
                fundingHistory={fundingHistory}
                balances={balances}
                tickers={tickers}
                editingTPSL={editingTPSL}
                setEditingTPSL={setEditingTPSL}
                focusedSL={focusedSL}
                setFocusedSL={setFocusedSL}
                slInputs={slInputs}
                setSlInputs={setSlInputs}
                focusedTP={focusedTP}
                setFocusedTP={setFocusedTP}
                tpInputs={tpInputs}
                setTpInputs={setTpInputs}
                setPositions={setPositions}
                addLog={addLog}
            />
        </div>

        {/* ═══ MODALS ═══ */}
        <ShortcutsModal
            show={showShortcuts}
            onClose={() => setShowShortcuts(false)}
            onCommandSelect={cmd => { setInput(cmd); inputRef.current?.focus() }}
        />
        <ConnectHLModal
            show={connect.showHlModal}
            onClose={() => connect.setShowHlModal(false)}
            hlTestnet={connect.hlTestnet} setHlTestnet={connect.setHlTestnet}
        />
        <ConnectBinanceModal
            show={connect.showBnbModal}
            onClose={() => connect.setShowBnbModal(false)}
            bnbApiKey={connect.bnbApiKey} setBnbApiKey={connect.setBnbApiKey}
            bnbApiSecret={connect.bnbApiSecret} setBnbApiSecret={connect.setBnbApiSecret}
            bnbTestnet={connect.bnbTestnet} setBnbTestnet={connect.setBnbTestnet}
            bnbConnecting={connect.bnbConnecting}
            bnbError={connect.bnbError}
            onConnect={connect.connectBinance}
        />
        </>
    )
}
