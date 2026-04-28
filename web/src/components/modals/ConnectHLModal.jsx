import { useEffect, useState } from 'react'
import { API_BASE } from '../../config'
import { useAuth } from '../../context/AuthContext'

// Agent wallet sessionStorage key — tab kapanınca siliner (localStorage değil).
const AGENT_SESSION_KEY = 'tt_hl_agent_v1'

const ModalIcon = ({ children, color = 'currentColor' }) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
        {children}
    </svg>
)

const IconWallet = ({ color }) => (
    <ModalIcon color={color}>
        <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H18" />
        <path d="M3 7.5v9A2.5 2.5 0 0 0 5.5 19H19a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2H5.5A2.5 2.5 0 0 1 3 7.5Z" />
        <circle cx="16.5" cy="13.5" r="1" />
    </ModalIcon>
)

const IconShield = ({ color }) => (
    <ModalIcon color={color}>
        <path d="M12 3l7 3v6c0 5-3.5 8-7 9-3.5-1-7-4-7-9V6l7-3Z" />
        <path d="m9.5 12 1.7 1.7 3.3-3.4" />
    </ModalIcon>
)

export default function ConnectHLModal({
    show, onClose,
    hlTestnet, setHlTestnet,
}) {
    const { token } = useAuth()
    // Mode seçimi — varsayılan: wallet (OKX/MetaMask in-app imza)
    const [mode, setMode] = useState('wallet')   // wallet | agent

    // ── Wallet (Phase 2) state
    const [walletError, setWalletError] = useState('')
    const [walletBusy, setWalletBusy] = useState(false)
    const [walletStep, setWalletStep] = useState('idle')  // idle | connecting | signing | submitting
    const [walletMain, setWalletMain] = useState('')

    // ── Manual agent (Phase 1) state
    const [agentAddr, setAgentAddr] = useState(() => {
        try { return JSON.parse(sessionStorage.getItem(AGENT_SESSION_KEY) || 'null')?.agent_address || '' }
        catch { return '' }
    })
    const [agentPk, setAgentPk] = useState(() => {
        try { return JSON.parse(sessionStorage.getItem(AGENT_SESSION_KEY) || 'null')?.agent_private_key || '' }
        catch { return '' }
    })
    const [mainWallet, setMainWallet] = useState('')
    const [generating, setGenerating] = useState(false)
    const [agentConnecting, setAgentConnecting] = useState(false)
    const [agentError, setAgentError] = useState('')
    const [copied, setCopied] = useState(false)
    const [step, setStep] = useState(agentAddr ? 2 : 1)

    useEffect(() => {
        if (show) return
        setWalletError('')
        setWalletBusy(false)
        setWalletStep('idle')
        setWalletMain('')
    }, [show])

    if (!show) return null

    const notifyConnected = (data) => {
        window.dispatchEvent(new CustomEvent('tt-hl-agent-connected', { detail: data }))
        onClose()
    }

    // ─── Phase 2: OKX/MetaMask ile in-app approveAgent ────────────────────
    // fetch helper: HTTP hatasını da anlamlı mesajla bas, JSON parse hatasını da yakala.
    const postJson = async (path, body) => {
        let res
        try {
            const headers = { 'Content-Type': 'application/json' }
            if (token) headers['Authorization'] = `Bearer ${token}`
            res = await fetch(`${API_BASE}${path}`, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
            })
        } catch (e) {
            throw new Error(`Ağ hatası: ${e.message || e}`)
        }
        const text = await res.text()
        if (!res.ok) {
            if (res.status === 404) {
                throw new Error(`HTTP 404 — ${path} bulunamadı. Backend restart gerekiyor (yeni endpoint).`)
            }
            if (res.status === 429) {
                throw new Error('Rate limit — birkaç saniye bekleyip tekrar dene.')
            }
            throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`)
        }
        try { return JSON.parse(text) }
        catch { throw new Error(`Beklenmeyen cevap (JSON değil): ${text.slice(0, 200)}`) }
    }

    const connectWithWallet = async () => {
        setWalletError(''); setWalletBusy(true); setWalletStep('connecting')
        window.dispatchEvent(new CustomEvent('tt-hl-agent-connecting', { detail: { active: true } }))
        try {
            const eth = window.ethereum
            if (!eth || typeof eth.request !== 'function') {
                setWalletError('OKX Wallet / MetaMask bulunamadı. Extension\'ın yüklü ve aktif olduğundan emin ol.')
                return
            }
            // 1. Hesapları iste → main wallet
            let accounts
            try {
                accounts = await eth.request({ method: 'eth_requestAccounts' })
            } catch (e) {
                if (/reject|denied/i.test(String(e?.message))) {
                    setWalletError('Wallet bağlantı isteği reddedildi')
                } else {
                    setWalletError(`Wallet bağlantısı: ${e?.message || e}`)
                }
                return
            }
            const main = Array.isArray(accounts) ? accounts[0] : null
            if (!main) { setWalletError('Wallet hiç hesap döndürmedi — unlock edilmiş mi?'); return }
            setWalletMain(main)

            // 2. Backend'den fresh agent + typed_data al
            const prep = await postJson('/api/hl-agent/prepare-approval', {
                main_wallet_address: main, testnet: hlTestnet,
            })
            if (!prep.ok) { setWalletError(prep.error || 'prepare-approval ok=false döndü'); return }

            // 3. Wallet'la EIP-712 imza
            setWalletStep('signing')
            let signature
            try {
                signature = await eth.request({
                    method: 'eth_signTypedData_v4',
                    params: [main, JSON.stringify(prep.typed_data)],
                })
            } catch (e) {
                if (/reject|denied/i.test(String(e?.message))) setWalletError('İmza reddedildi')
                else setWalletError(`İmza hatası: ${e?.message || e}`)
                return
            }

            // 4. Backend'e imzalı action'ı gönder — HL'ye forward + executor kur
            setWalletStep('submitting')
            const submit = await postJson('/api/hl-agent/submit-approval', {
                agent_private_key: prep.agent_private_key,
                main_wallet_address: main,
                testnet: hlTestnet,
                action: prep.action,
                nonce: prep.nonce,
                signature,
            })
            if (!submit.ok) { setWalletError(submit.error || 'submit-approval ok=false döndü'); return }

            // Agent PK'yı session'da tut — auto-reconnect için (isteğe bağlı)
            try {
                sessionStorage.setItem(AGENT_SESSION_KEY, JSON.stringify({
                    agent_address: prep.agent_address,
                    agent_private_key: prep.agent_private_key,
                }))
            } catch (_) { /* storage kapalı olabilir */ }

            notifyConnected(submit)
        } catch (e) {
            // Kullanıcı rejected → clean mesaj
            const msg = String(e?.message || e)
            if (/user.*reject|denied/i.test(msg)) setWalletError('İmza reddedildi')
            else setWalletError(msg)
        } finally {
            window.dispatchEvent(new CustomEvent('tt-hl-agent-connecting', { detail: { active: false } }))
            setWalletBusy(false); setWalletStep('idle')
        }
    }

    // ─── Phase 1: Manual agent flow ───────────────────────────────────────
    const generateAgent = async () => {
        setGenerating(true); setAgentError('')
        try {
            const headers = { 'Content-Type': 'application/json' }
            if (token) headers['Authorization'] = `Bearer ${token}`
            const res = await fetch(`${API_BASE}/api/hl-agent/generate`, {
                method: 'POST', headers,
            })
            const data = await res.json()
            if (!data.ok) { setAgentError(data.error || 'Agent üretilemedi'); return }
            setAgentAddr(data.agent_address)
            setAgentPk(data.agent_private_key)
            sessionStorage.setItem(AGENT_SESSION_KEY, JSON.stringify({
                agent_address: data.agent_address,
                agent_private_key: data.agent_private_key,
            }))
            setStep(2)
        } catch (e) { setAgentError(String(e.message || e)) }
        finally { setGenerating(false) }
    }

    const copyAgent = async () => {
        try { await navigator.clipboard.writeText(agentAddr); setCopied(true); setTimeout(() => setCopied(false), 2000) }
        catch { /* clipboard unavailable */ }
    }

    const discardAgent = () => {
        sessionStorage.removeItem(AGENT_SESSION_KEY)
        setAgentAddr(''); setAgentPk(''); setStep(1)
    }

    const connectAgent = async () => {
        if (!agentPk || !mainWallet.trim()) { setAgentError('Agent PK ve main wallet gerekli'); return }
        if (!mainWallet.startsWith('0x') || mainWallet.length !== 42) {
            setAgentError('Main wallet 0x ile başlayan 42 karakter olmalı'); return
        }
        setAgentConnecting(true); setAgentError('')
        try {
            const headers = { 'Content-Type': 'application/json' }
            if (token) headers['Authorization'] = `Bearer ${token}`
            const res = await fetch(`${API_BASE}/api/connect-hl-agent`, {
                method: 'POST', headers,
                body: JSON.stringify({
                    agent_private_key: agentPk,
                    main_wallet_address: mainWallet.trim(),
                    testnet: hlTestnet,
                }),
            })
            const data = await res.json()
            if (!data.ok) { setAgentError(data.error || 'Bağlantı kurulamadı'); return }
            notifyConnected(data)
        } catch (e) { setAgentError(String(e.message || e)) }
        finally { setAgentConnecting(false) }
    }

    const hlApproveUrl = hlTestnet
        ? 'https://app.hyperliquid-testnet.xyz/API'
        : 'https://app.hyperliquid.xyz/API'

    const walletStepLabel = {
        idle: 'CONNECT WITH WALLET',
        connecting: 'WALLET BAĞLANIYOR...',
        signing: 'WALLET\'TAN İMZA BEKLENİYOR...',
        submitting: 'HL\'YE GÖNDERİLİYOR...',
    }[walletStep]

    return (
        <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.90)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={e => { if (e.target === e.currentTarget) onClose() }}
        >
            <div style={{ background: '#050507', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: 24, width: 520, maxWidth: '92vw', maxHeight: '92vh', overflowY: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <div>
                        <div style={{ fontSize: 11, color: '#4e4d49', letterSpacing: 2, marginBottom: 4 }}>HYPERLIQUID DEX</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: '#e8e6e3' }}>Connect via Agent Wallet</div>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#4e4d49', fontSize: 18, cursor: 'pointer' }}>✕</button>
                </div>

                {/* ── 3-modlu toggle ── */}
                <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: '#0a0a0a', padding: 3, borderRadius: 4, border: '1px solid rgba(255,255,255,0.05)' }}>
                    <button
                        onClick={() => setMode('wallet')}
                        style={{
                            flex: 1, padding: '8px 8px', background: mode === 'wallet' ? '#00d99218' : 'transparent',
                            border: mode === 'wallet' ? '1px solid #00d99244' : '1px solid transparent',
                            color: mode === 'wallet' ? '#00d992' : '#6b6d74', borderRadius: 3, fontSize: 10,
                            fontWeight: 700, cursor: 'pointer', letterSpacing: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        }}
                    ><IconWallet color={mode === 'wallet' ? '#00d992' : '#6b6d74'} />WALLET</button>
                    <button
                        onClick={() => setMode('agent')}
                        style={{
                            flex: 1, padding: '8px 8px', background: mode === 'agent' ? '#f5a62318' : 'transparent',
                            border: mode === 'agent' ? '1px solid #f5a62344' : '1px solid transparent',
                            color: mode === 'agent' ? '#f5a623' : '#6b6d74', borderRadius: 3, fontSize: 10,
                            fontWeight: 700, cursor: 'pointer', letterSpacing: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        }}
                    ><IconShield color={mode === 'agent' ? '#f5a623' : '#6b6d74'} />MANUAL AGENT</button>
                </div>

                {mode === 'wallet' ? (
                    <>
                        {/* ── Phase 2: OKX/MetaMask ile tek-tıkla bağlan ── */}
                        <div style={{ background: '#00d99210', border: '1px solid #00d99233', borderRadius: 4, padding: '10px 12px', marginBottom: 14, lineHeight: 1.6 }}>
                            <div style={{ fontSize: 12, color: '#00d992', fontWeight: 600, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 7 }}>
                                <IconWallet color="#00d992" />
                                <span>Most secure flow, one signature</span>
                            </div>
                            <div style={{ fontSize: 11, color: '#e8e6e3' }}>
                                OKX Wallet / MetaMask / Rabby ile bağlan. Tarayıcıda fresh bir agent
                                wallet üretilir ve sen wallet popup'ında tek imza atarak HL'de onaylarsın.
                                Main private key <b>hiç ortaya çıkmaz</b>. HL sayfasına gitmene gerek yok.
                            </div>
                        </div>

                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, cursor: 'pointer', fontSize: 12, color: '#8a8884' }}>
                            <input type="checkbox" checked={hlTestnet} onChange={e => setHlTestnet(e.target.checked)} />
                            Use Testnet
                        </label>

                        {walletError && (
                            <div style={{ background: '#ff3b5c15', border: '1px solid #ff3b5c44', borderRadius: 4, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: '#ff3b5c' }}>
                                {walletError}
                            </div>
                        )}

                        {walletMain && !walletError && !walletBusy && (
                            <div style={{ fontSize: 11, color: '#8fbeaf', marginBottom: 10 }}>
                                Wallet selected: {walletMain.slice(0, 6)}...{walletMain.slice(-4)}
                            </div>
                        )}

                        <button
                            onClick={connectWithWallet}
                            disabled={walletBusy}
                            style={{ width: '100%', background: walletBusy ? '#1a1c25' : '#00d992', color: walletBusy ? '#4e4d49' : '#000', border: 'none', borderRadius: 4, padding: '12px 0', fontSize: 13, fontWeight: 700, cursor: walletBusy ? 'wait' : 'pointer', letterSpacing: 1 }}
                        >
                            {walletStepLabel}
                        </button>

                        <div style={{ fontSize: 10, color: '#4e4d49', marginTop: 12, lineHeight: 1.5 }}>
                            İmzaladığın payload: <code style={{ color: '#8a8884' }}>HyperliquidTransaction:ApproveAgent</code>.
                            Agent sadece trade yetkisi alır — <b>withdraw/transfer yok</b>. Dilediğin zaman
                            HL → API Wallets → Revoke ile iptal edebilirsin.
                        </div>
                    </>
                ) : (
                    <>
                        {/* ── Phase 1: Manual agent flow ── */}
                        <div style={{ background: '#f5a62312', border: '1px solid #f5a62344', borderRadius: 4, padding: '10px 12px', marginBottom: 14, lineHeight: 1.6 }}>
                            <div style={{ fontSize: 12, color: '#f5a623', fontWeight: 600, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 7 }}>
                                <IconShield color="#f5a623" />
                                <span>Manual agent flow</span>
                            </div>
                            <div style={{ fontSize: 11, color: '#e8e6e3' }}>
                                Wallet extension yoksa veya mobile'daysan — bu akış seni HL sayfasına
                                yönlendirip manuel onay ister. Wallet sekmesi daha hızlı.
                            </div>
                        </div>

                        {step === 1 && (
                            <div style={{ marginBottom: 16 }}>
                                <div style={{ fontSize: 13, color: '#e8e6e3', marginBottom: 10 }}>
                                    <b>1. adım</b> — Tarayıcıda fresh bir agent wallet üret
                                </div>
                                <button
                                    onClick={generateAgent} disabled={generating}
                                    style={{ width: '100%', background: generating ? '#1a1c25' : '#f5a623', color: generating ? '#4e4d49' : '#000', border: 'none', borderRadius: 4, padding: '10px 0', fontSize: 13, fontWeight: 700, cursor: generating ? 'wait' : 'pointer', letterSpacing: 1 }}
                                >
                                    {generating ? 'GENERATING...' : 'GENERATE AGENT WALLET'}
                                </button>
                            </div>
                        )}

                        {step === 2 && (
                            <>
                                <div style={{ marginBottom: 14 }}>
                                    <div style={{ fontSize: 11, color: '#4e4d49', letterSpacing: 1, marginBottom: 6 }}>AGENT ADDRESS</div>
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        <input readOnly value={agentAddr}
                                            style={{ flex: 1, background: '#000', border: '1px solid rgba(245,166,35,0.3)', borderRadius: 4, padding: '8px 10px', color: '#f5a623', fontSize: 12, fontFamily: 'var(--font-mono)', boxSizing: 'border-box' }} />
                                        <button onClick={copyAgent} style={{ background: '#f5a62318', border: '1px solid #f5a62344', color: '#f5a623', borderRadius: 4, padding: '0 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer', letterSpacing: 1 }}>
                                            {copied ? '✓' : 'COPY'}
                                        </button>
                                    </div>
                                </div>
                                <div style={{ background: '#fbbf2412', border: '1px solid #fbbf2455', borderRadius: 4, padding: '10px 12px', marginBottom: 14, lineHeight: 1.6 }}>
                                    <div style={{ fontSize: 12, color: '#fbbf24', fontWeight: 600, marginBottom: 6 }}>2. adım — HL'de onayla</div>
                                    <div style={{ fontSize: 11, color: '#c9a84c', marginBottom: 6 }}>
                                        1) HL API sayfasına git → 2) "Authorize API Wallet" → 3) Agent adresini yapıştır → 4) Main cüzdan ile imzala
                                    </div>
                                    <a href={hlApproveUrl} target="_blank" rel="noreferrer" style={{ display: 'inline-block', color: '#fbbf24', fontSize: 11, textDecoration: 'underline' }}>→ {hlApproveUrl}</a>
                                </div>
                                <div style={{ marginBottom: 14 }}>
                                    <div style={{ fontSize: 11, color: '#4e4d49', letterSpacing: 1, marginBottom: 6 }}>3. adım — MAIN WALLET ADRESİ</div>
                                    <input type="text" placeholder="0x... (sadece adres, PK DEĞİL)" value={mainWallet}
                                        onChange={e => setMainWallet(e.target.value)}
                                        style={{ width: '100%', background: '#000', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, padding: '8px 10px', color: '#e8e6e3', fontSize: 13, fontFamily: 'var(--font-mono)', boxSizing: 'border-box' }} />
                                </div>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, cursor: 'pointer', fontSize: 12, color: '#8a8884' }}>
                                    <input type="checkbox" checked={hlTestnet} onChange={e => setHlTestnet(e.target.checked)} />
                                    Use Testnet
                                </label>
                                {agentError && <div style={{ background: '#ff3b5c15', border: '1px solid #ff3b5c44', borderRadius: 4, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: '#ff3b5c' }}>{agentError}</div>}
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button onClick={discardAgent}
                                        style={{ background: '#0a0a0a', color: '#8a8884', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, padding: '10px 14px', fontSize: 11, fontWeight: 600, cursor: 'pointer', letterSpacing: 1 }}>RESET</button>
                                    <button onClick={connectAgent} disabled={agentConnecting || !mainWallet}
                                        style={{ flex: 1, background: agentConnecting || !mainWallet ? '#1a1c25' : '#f5a623', color: agentConnecting || !mainWallet ? '#4e4d49' : '#000', border: 'none', borderRadius: 4, padding: '10px 0', fontSize: 13, fontWeight: 700, cursor: agentConnecting || !mainWallet ? 'not-allowed' : 'pointer', letterSpacing: 1 }}>
                                        {agentConnecting ? 'CONNECTING...' : 'CONNECT WITH AGENT'}
                                    </button>
                                </div>
                            </>
                        )}
                    </>
                )}
            </div>
        </div>
    )
}
