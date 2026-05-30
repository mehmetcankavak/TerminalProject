import { useEffect, useRef, useState, useCallback } from 'react'
import { useAccount, useSignTypedData, useWalletClient, useDisconnect } from 'wagmi'
import { useWeb3Modal } from '@web3modal/wagmi/react'
import { API_BASE } from '../config'
import { useAuth } from '../context/AuthContext'
import { haptic, secureSet } from '../capacitor'
import { ensureWeb3ModalReady } from './web3ModalInit'

const SIGN_TIMEOUT_MS = 60_000
const SIGNER_READY_WAIT_MS = 3_000  // signer hazır olması için tolerans

// WalletConnect tarafından saklanan deep-link'i bul. v3+: `WALLETCONNECT_DEEPLINK_CHOICE`
// veya çeşitli `wc@2:...` key'leri olabilir; en yaygın olanı tarayalım.
function getWalletDeepLink() {
  try {
    const raw = localStorage.getItem('WALLETCONNECT_DEEPLINK_CHOICE')
    if (raw) {
      const dl = JSON.parse(raw)
      if (dl?.href) return dl.href
    }
  } catch {}
  return null
}

// Cüzdan uygulamasını foreground'a getir. iOS WebView user-gesture kuralı için
// birden fazla strateji deniyoruz: window.open(_system), anchor.click(), location.href.
// Bunlardan biri başarılı olursa cüzdan ön plana gelir.
function wakeWalletForSigning() {
  const href = getWalletDeepLink()
  if (!href) return false
  // Strategy A: window.open ile _system target (Cordova/Capacitor pattern, external app)
  try { const w = window.open(href, '_system'); if (w) return true } catch {}
  // Strategy B: invisible anchor click — bazı browser'larda gesture korunmuş sayılır
  try {
    const a = document.createElement('a')
    a.href = href
    a.style.display = 'none'
    a.rel = 'noopener noreferrer'
    document.body.appendChild(a)
    a.click()
    setTimeout(() => { try { document.body.removeChild(a) } catch {} }, 100)
  } catch {}
  // Strategy C: direct location change (en yaygın)
  try { window.location.href = href } catch {}
  return true
}

const AGENT_SESSION_KEY = 'tt_hl_agent_v1'

async function postJson(path, body, token) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  let res
  try {
    res = await fetch(`${API_BASE}${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
  } catch (e) {
    throw new Error(`Network error: ${e.message || e}`)
  }
  const text = await res.text()
  if (!res.ok) {
    if (res.status === 404) throw new Error(`Endpoint not found (${path})`)
    if (res.status === 429) throw new Error('Rate limited — please wait a few seconds')
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`)
  }
  try { return JSON.parse(text) } catch { throw new Error('Unexpected response') }
}

export default function ConnectHLModalMobile({ show, onClose }) {
  const { token } = useAuth()
  const { address, isConnected } = useAccount()
  const { signTypedDataAsync } = useSignTypedData()
  const { data: walletClient } = useWalletClient()
  const { disconnect } = useDisconnect()
  const { open: openWeb3Modal } = useWeb3Modal()

  const [hlTestnet, setHlTestnet] = useState(false)
  const [busy, setBusy] = useState(false)
  const [step, setStep] = useState('idle') // idle | preparing | signing | submitting | done
  const [error, setError] = useState('')
  const [needsReconnect, setNeedsReconnect] = useState(false)
  const pendingAutoConnect = useRef(false) // wallet bağlanır bağlanmaz HL akışını sürdür
  const prepRef = useRef(null)              // arka planda hazırlanmış approval payload

  useEffect(() => {
    if (!show) {
      setError(''); setBusy(false); setStep('idle'); setNeedsReconnect(false)
      pendingAutoConnect.current = false
      prepRef.current = null
    }
  }, [show])

  // Modal açıldığında ve cüzdan bağlıyken: prepare-approval'ı ARKA PLANDA çek.
  // Böylece kullanıcı CONNECT'e bastığında await beklemeden imza+wake aynı user
  // gesture içinde tetiklenebilir → iOS WebView'in custom URL scheme engelini aşar.
  useEffect(() => {
    if (!show || !isConnected || !address || !token) return
    if (prepRef.current) return
    let cancelled = false
    ;(async () => {
      try {
        const prep = await postJson('/api/hl-agent/prepare-approval', {
          main_wallet_address: address, testnet: hlTestnet,
        }, token)
        if (cancelled) return
        if (prep?.ok) prepRef.current = prep
      } catch {/* sessiz, click anında tekrar denenir */}
    })()
    return () => { cancelled = true }
  }, [show, isConnected, address, token, hlTestnet])

  // signer (signTypedDataAsync veya walletClient) hazır mı?
  const signerReady = !!signTypedDataAsync || !!walletClient

  // Wait for signer to become available (race against wagmi state propagation)
  const waitForSigner = useCallback(async (maxMs = SIGNER_READY_WAIT_MS) => {
    const start = Date.now()
    while (Date.now() - start < maxMs) {
      if (signTypedDataAsync || walletClient) return true
      await new Promise(r => setTimeout(r, 100))
    }
    return false
  }, [signTypedDataAsync, walletClient])

  // İmza isteğini başlat + cüzdanı SENKRON aynı tick'te uyandır (user gesture
  // korunur; iOS'ta custom URL scheme engeli aşılır).
  const startSignAndWake = useCallback((signArgs) => {
    const sign = signTypedDataAsync
      ? signTypedDataAsync(signArgs)
      : walletClient.signTypedData(signArgs)
    // Gesture context'inde — beklemeden tetikle.
    wakeWalletForSigning()
    return Promise.race([
      sign,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Signature timeout')), SIGN_TIMEOUT_MS)),
    ])
  }, [signTypedDataAsync, walletClient])

  const handleConnect = useCallback(async () => {
    // STEP 1 — Cüzdan yoksa Web3Modal'ı bekleyip aç; bağlandığında auto-resume.
    if (!isConnected || !address) {
      haptic('light')
      pendingAutoConnect.current = true
      try { await ensureWeb3ModalReady() } catch {}
      openWeb3Modal()
      return
    }

    // STEP 2 — Signer hazır mı? Wagmi state propagation gecikmesi olabilir.
    if (!signerReady) {
      setStep('preparing')
      setBusy(true)
      const ok = await waitForSigner(SIGNER_READY_WAIT_MS)
      setBusy(false); setStep('idle')
      if (!ok) {
        setError('Cüzdan hazır değil — birkaç saniye sonra tekrar dene')
        return
      }
    }

    setError(''); setBusy(true); setStep('preparing')
    window.dispatchEvent(new CustomEvent('tt-hl-agent-connecting', { detail: { active: true } }))
    try {
      // Prep arka planda hazırlanmış olabilir; yoksa şimdi çek (gesture kaybedilir
      // — manuel "Cüzdanı Aç" butonu fallback olarak kalır).
      let prep = prepRef.current
      if (!prep) {
        prep = await postJson('/api/hl-agent/prepare-approval', {
          main_wallet_address: address, testnet: hlTestnet,
        }, token)
        prepRef.current = prep
      }
      if (!prep.ok) throw new Error(prep.error || 'prepare-approval failed')

      setStep('signing')
      haptic('medium')
      const td = prep.typed_data
      const signArgs = {
        domain: td.domain,
        types: td.types,
        primaryType: td.primaryType,
        message: td.message,
      }

      let signature
      try {
        signature = await startSignAndWake(signArgs)
      } catch (firstErr) {
        const msg = String(firstErr?.message || firstErr)
        // OKX / WalletConnect "Disconnect your Dapp first" hatası —
        // walletClient üzerinden doğrudan dene
        if (/disconnect.*dapp|unknown rpc|dapp first/i.test(msg) && walletClient && signTypedDataAsync) {
          try {
            signature = await Promise.race([
              walletClient.signTypedData(signArgs),
              new Promise((_, reject) => setTimeout(() => reject(new Error('Signature timeout')), SIGN_TIMEOUT_MS)),
            ])
          } catch (secondErr) {
            const msg2 = String(secondErr?.message || secondErr)
            if (/disconnect.*dapp|unknown rpc|dapp first/i.test(msg2)) {
              setNeedsReconnect(true)
              throw new Error('okx_reconnect_needed')
            }
            throw secondErr
          }
        } else {
          throw firstErr
        }
      }

      setStep('submitting')
      const submit = await postJson('/api/hl-agent/submit-approval', {
        agent_private_key: prep.agent_private_key,
        main_wallet_address: address,
        testnet: hlTestnet,
        action: prep.action,
        nonce: prep.nonce,
        signature,
      }, token)
      if (!submit.ok) throw new Error(submit.error || 'submit-approval failed')

      await secureSet(AGENT_SESSION_KEY, {
        agent_address: prep.agent_address,
        agent_private_key: prep.agent_private_key,
        main_wallet_address: address,
        testnet: hlTestnet,
        stored_at: new Date().toISOString(),
      })

      haptic('heavy')
      window.dispatchEvent(new CustomEvent('tt-hl-agent-connected', { detail: submit }))
      setStep('done')
      onClose()
    } catch (e) {
      const msg = String(e?.message || e)
      if (msg === 'okx_reconnect_needed') {
        // needsReconnect zaten set edildi — UI reconnect butonunu gösterecek
      } else if (/reject|denied|user/i.test(msg)) {
        setError('İmza reddedildi')
      } else if (/timeout/i.test(msg)) {
        setError('İmza zaman aşımına uğradı — tekrar dene')
      } else {
        setError(msg)
      }
    } finally {
      window.dispatchEvent(new CustomEvent('tt-hl-agent-connecting', { detail: { active: false } }))
      setBusy(false)
      if (step !== 'done') setStep('idle')
    }
  }, [isConnected, address, hlTestnet, token, signerReady, waitForSigner, startSignAndWake, signTypedDataAsync, walletClient, openWeb3Modal, onClose, step])

  // Tek-tap akış: kullanıcı "CONNECT" derse cüzdan bağlandıktan sonra
  // HL imzasını otomatik tetikle. Pending bayrağı ile.
  useEffect(() => {
    if (!show) return
    if (!isConnected || !address) return
    if (!pendingAutoConnect.current) return
    if (busy) return
    // Signer da hazır olunca devam et
    if (!signerReady) return
    pendingAutoConnect.current = false
    handleConnect()
  }, [show, isConnected, address, signerReady, busy, handleConnect])

  if (!show) return null

  const stepLabel = {
    idle: isConnected ? 'CONNECT TO HYPERLIQUID' : 'CONNECT WALLET FIRST',
    preparing: 'PREPARING AGENT…',
    signing: 'WAITING FOR SIGNATURE…',
    submitting: 'SUBMITTING TO HL…',
    done: 'CONNECTED',
  }[step]

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.85)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}>
      <div style={{
        background: 'var(--bg-2)', width: '100%', maxWidth: 480,
        borderTopLeftRadius: 24, borderTopRightRadius: 24,
        padding: '24px 20px calc(28px + var(--safe-bottom, 0px))',
        border: '1px solid rgba(255,255,255,0.06)',
        boxShadow: '0 -20px 60px rgba(0,0,0,0.5)',
      }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.15)', margin: '0 auto 20px' }} />

        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 10, color: '#4e4d49', letterSpacing: 2 }}>HYPERLIQUID DEX</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#fff', marginTop: 4 }}>Connect Trading Agent</div>
        </div>

        <div style={{
          background: 'rgba(0,217,146,0.06)', border: '1px solid rgba(0,217,146,0.2)',
          borderRadius: 10, padding: '12px 14px', marginBottom: 16, lineHeight: 1.55,
        }}>
          <div style={{ fontSize: 12, color: '#00d992', fontWeight: 700, marginBottom: 6 }}>
            One signature — your main key never leaves your wallet
          </div>
          <div style={{ fontSize: 11, color: '#b8b8b8' }}>
            You sign an EIP-712 message; the backend creates a trading agent.
            Agent has <b>trade-only</b> access — no withdrawals.
            Revoke anytime: HL → API Wallets → Revoke.
          </div>
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 10, padding: '10px 14px', marginBottom: 12,
        }}>
          <span style={{ fontSize: 12, color: '#b8b8b8' }}>Wallet</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: isConnected ? '#00d992' : '#f59e0b', fontFamily: 'var(--mono)' }}>
            {isConnected ? `${address.slice(0,6)}…${address.slice(-4)}` : 'Not connected'}
          </span>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, fontSize: 12, color: '#888' }}>
          <input type="checkbox" checked={hlTestnet} onChange={e => setHlTestnet(e.target.checked)} />
          Use testnet
        </label>

        {needsReconnect ? (
          <div style={{
            background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)',
            borderRadius: 8, padding: '12px 14px', marginBottom: 12,
          }}>
            <div style={{ fontSize: 12, color: '#f59e0b', fontWeight: 700, marginBottom: 6 }}>
              OKX Wallet oturumu eskimiş
            </div>
            <div style={{ fontSize: 11, color: '#b8b8b8', marginBottom: 10 }}>
              Cüzdanı yeniden bağlayıp tekrar dene.
            </div>
            <button
              onClick={() => {
                setNeedsReconnect(false)
                setError('')
                disconnect()
                setTimeout(() => openWeb3Modal(), 300)
              }}
              style={{
                width: '100%', padding: '10px 0', borderRadius: 8, border: 'none',
                background: '#f59e0b', color: '#000', fontSize: 12, fontWeight: 800, cursor: 'pointer',
              }}>
              Cüzdanı Yeniden Bağla
            </button>
          </div>
        ) : error ? (
          <div style={{
            background: 'rgba(255,59,92,0.1)', border: '1px solid rgba(255,59,92,0.3)',
            borderRadius: 8, padding: '10px 12px', marginBottom: 12, fontSize: 12, color: '#ff3b5c',
          }}>
            {error}
          </div>
        ) : null}

        {step === 'signing' ? (
          <button
            onClick={() => { haptic('medium'); wakeWalletForSigning() }}
            style={{
              width: '100%', padding: 14, borderRadius: 12, border: 'none',
              background: '#00d992', color: '#000',
              fontSize: 13, fontWeight: 800, letterSpacing: 1.2, cursor: 'pointer',
              animation: 'pulse-cta 1.6s ease-in-out infinite',
            }}>
            CÜZDANI AÇ → İMZALA
          </button>
        ) : (
          <button
            onClick={handleConnect}
            disabled={busy}
            style={{
              width: '100%', padding: 14, borderRadius: 12, border: 'none',
              background: busy ? '#1a1c25' : '#00d992', color: busy ? '#4e4d49' : '#000',
              fontSize: 13, fontWeight: 800, letterSpacing: 1.2, cursor: busy ? 'wait' : 'pointer',
            }}>
            {stepLabel}
          </button>
        )}

        <button
          onClick={onClose}
          disabled={busy && step !== 'signing'}
          style={{
            width: '100%', padding: 12, marginTop: 8, borderRadius: 12,
            background: 'transparent', border: 'none',
            color: '#666', fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}>
          {step === 'signing' ? 'İptal' : 'Close'}
        </button>
      </div>
    </div>
  )
}
