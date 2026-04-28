import { useState, useCallback, useEffect, useRef } from 'react'
import { API_BASE } from '../config'
import { getAuthHeaders } from '../utils/format'

// Binance credentials sessionStorage'da tutulur — tab kapanınca silinir.
// localStorage ASLA kullanılmaz (XSS / disk forensics riski).
const BNB_SESSION_KEY = 'tt_live_conn_binance_v1'

const emitTradingSync = (detail) => {
    window.dispatchEvent(new CustomEvent('tt-trading-sync', { detail }))
}

export function useTradingConnect({ token, addLog }) {
    const restoreAttemptedRef = useRef(false)

    const [tradingMode, setTradingMode] = useState('PAPER')
    const [hlWallet, setHlWallet] = useState('')
    const [hlPendingConnect, setHlPendingConnect] = useState(false)

    // Hyperliquid modal state — PK input yok, sadece agent/wallet akışı
    const [showHlModal, setShowHlModal] = useState(false)
    const [hlTestnet, setHlTestnet] = useState(false)

    // Binance modal state
    const [showBnbModal, setShowBnbModal] = useState(false)
    const [bnbApiKey, setBnbApiKey] = useState('')
    const [bnbApiSecret, setBnbApiSecret] = useState('')
    const [bnbTestnet, setBnbTestnet] = useState(false)
    const [bnbConnecting, setBnbConnecting] = useState(false)
    const [bnbError, setBnbError] = useState('')

    const persistSession = useCallback((key, payload) => {
        try { sessionStorage.setItem(key, JSON.stringify(payload)) } catch {}
    }, [])

    const clearSession = useCallback((key) => {
        try { sessionStorage.removeItem(key) } catch {}
    }, [])

    const readSession = useCallback((key) => {
        try {
            const raw = sessionStorage.getItem(key)
            return raw ? JSON.parse(raw) : null
        } catch { return null }
    }, [])

    const disconnectHL = useCallback(async () => {
        try {
            await fetch(`${API_BASE}/api/disconnect-hl`, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {} })
            setTradingMode('PAPER')
            setHlWallet('')
            setHlPendingConnect(false)
            try { sessionStorage.removeItem('tt_hl_agent_v1') } catch {}
            emitTradingSync({ mode: 'PAPER', hl_wallet: '', balance: null, free_margin: null, margin_used: 0, positions: null })
            addLog('[HL] Disconnected — switched to PAPER mode', 'warning')
        } catch (e) { addLog(`[error] ${e.message}`, 'error') }
    }, [token, addLog])

    const connectBinance = useCallback(async (options = {}) => {
        const { apiKey = bnbApiKey, apiSecret = bnbApiSecret, testnet = bnbTestnet, skipConfirm = false, persist = true, auto = false } = options
        if (!apiKey || !apiSecret) { setBnbError('API key ve secret gerekli'); return false }
        if (!skipConfirm) {
            const confirmed = window.confirm(
                '⚠ API key ve secret sunucuya şifreli bağlantı (HTTPS) üzerinden gönderilecek.\n\n' +
                'Güvenlik için:\n' +
                '• API key\'e sadece trade izni verin (withdrawal kapalı olsun)\n' +
                '• IP kısıtlaması ekleyin\n\n' +
                'Devam etmek istiyor musunuz?'
            )
            if (!confirmed) return false
        }
        setBnbConnecting(true)
        setBnbError('')
        try {
            const res = await fetch(`${API_BASE}/api/connect-binance`, {
                method: 'POST',
                headers: getAuthHeaders(token),
                body: JSON.stringify({ api_key: apiKey, api_secret: apiSecret, testnet }),
            })
            const data = await res.json()
            if (!data.ok) { setBnbError(data.error || 'Connection failed'); return false }
            setTradingMode('LIVE_BINANCE')
            setShowBnbModal(false)
            setBnbApiKey('')
            setBnbApiSecret('')
            setBnbTestnet(Boolean(testnet))
            if (persist) {
                // sessionStorage — tab kapanınca silinir. localStorage'a ASLA yazılmaz.
                persistSession(BNB_SESSION_KEY, {
                    api_key: apiKey,
                    api_secret: apiSecret,
                    testnet: Boolean(testnet),
                })
            }
            emitTradingSync({
                mode: 'LIVE_BINANCE',
                balance: data.balance?.total ?? null,
                free_margin: data.balance?.available ?? data.balance?.total ?? null,
                positions: null,
            })
            addLog(auto
                ? `[BNB] Auto-restored — balance $${data.balance?.available?.toFixed(2) ?? '?'} available`
                : `[BNB] Connected — balance $${data.balance?.available?.toFixed(2) ?? '?'} available`, 'success')
            return true
        } catch (e) {
            setBnbError(e.message)
            return false
        } finally {
            setBnbConnecting(false)
        }
    }, [token, bnbApiKey, bnbApiSecret, bnbTestnet, addLog, persistSession])

    const disconnectBinance = useCallback(async () => {
        try {
            await fetch(`${API_BASE}/api/disconnect-binance`, { method: 'POST', headers: getAuthHeaders(token) })
            setTradingMode('PAPER')
            emitTradingSync({ mode: 'PAPER', balance: null, free_margin: null, margin_used: 0, positions: null })
            clearSession(BNB_SESSION_KEY)
            addLog('[BNB] Disconnected — switched to PAPER mode', 'warning')
        } catch (e) { addLog(`[error] ${e.message}`, 'error') }
    }, [token, addLog, clearSession])

    useEffect(() => {
        restoreAttemptedRef.current = false
    }, [token])

    const restoreSavedConnection = useCallback(async () => {
        if (!token) return false

        // HL agent auto-restore için ConnectHLModal kendi sessionStorage'ını yönetir
        // (tt_hl_agent_v1). Burada sadece Binance'i restore ediyoruz.
        const savedBnb = readSession(BNB_SESSION_KEY)
        if (savedBnb?.api_key && savedBnb?.api_secret) {
            return await connectBinance({
                apiKey: savedBnb.api_key,
                apiSecret: savedBnb.api_secret,
                testnet: Boolean(savedBnb.testnet),
                skipConfirm: true,
                persist: true,
                auto: true,
            })
        }

        return false
    }, [token, readSession, connectBinance])

    useEffect(() => {
        if (!token || restoreAttemptedRef.current || tradingMode !== 'PAPER') return
        restoreAttemptedRef.current = true
        // Eski localStorage kayıtlarını temizle (upgrade path)
        try {
            localStorage.removeItem('tt_live_conn_hl_v1')
            localStorage.removeItem('tt_live_conn_binance_v1')
        } catch {}
        restoreSavedConnection()
    }, [token, tradingMode, restoreSavedConnection])

    // ─── Agent wallet akışı ConnectHLModal içinden window event ile haber veriyor.
    // Mode'u LIVE'a çek, balance/wallet state'lerini güncelle.
    useEffect(() => {
        const onAgentConnected = (ev) => {
            const data = ev?.detail
            if (!data?.ok) return
            setHlPendingConnect(false)
            setTradingMode('LIVE')
            setHlWallet(data.hl_wallet || '')
            emitTradingSync({
                mode: 'LIVE',
                hl_wallet: data.hl_wallet || '',
                balance: data.balance?.total ?? null,
                free_margin: data.balance?.available ?? data.balance?.total ?? null,
                margin_used: data.balance?.margin_used ?? null,
                positions: Array.isArray(data.positions) ? data.positions : null,
            })
            addLog(
                `[HL] Agent connected — main ${data.hl_wallet} | agent ${String(data.agent_address || '').slice(0, 6)}...${String(data.agent_address || '').slice(-4)} | balance $${data.balance?.total?.toFixed?.(2) ?? '?'}`,
                'success',
            )
        }
        const onAgentConnecting = (ev) => {
            setHlPendingConnect(Boolean(ev?.detail?.active))
        }
        window.addEventListener('tt-hl-agent-connected', onAgentConnected)
        window.addEventListener('tt-hl-agent-connecting', onAgentConnecting)
        return () => {
            window.removeEventListener('tt-hl-agent-connected', onAgentConnected)
            window.removeEventListener('tt-hl-agent-connecting', onAgentConnecting)
        }
    }, [addLog])

    return {
        tradingMode, setTradingMode,
        hlWallet, setHlWallet,
        hlPendingConnect,
        showHlModal, setShowHlModal,
        hlTestnet, setHlTestnet,
        disconnectHL,
        showBnbModal, setShowBnbModal,
        bnbApiKey, setBnbApiKey,
        bnbApiSecret, setBnbApiSecret,
        bnbTestnet, setBnbTestnet,
        bnbConnecting,
        bnbError,
        connectBinance,
        disconnectBinance,
        restoreSavedConnection,
    }
}
