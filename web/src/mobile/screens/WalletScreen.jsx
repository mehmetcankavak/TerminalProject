import { useCallback, useEffect, useState } from 'react'
import { useWeb3Modal } from '@web3modal/wagmi/react'
import { useAccount, useBalance, useDisconnect } from 'wagmi'
import { haptic, secureRemove } from '../../capacitor'
import { useAuth } from '../../context/AuthContext'
import { useWebSocket } from '../../hooks/useWebSocket'
import { API_BASE } from '../../config'
import ConnectHLModalMobile from '../ConnectHLModalMobile'

const NATIVE_PRICE_SYMBOL = { ETH: 'ETHUSDT', BNB: 'BNBUSDT', MATIC: 'MATICUSDT' }
const AGENT_SESSION_KEY = 'tt_hl_agent_v1'

function useNativeUsdPrice(symbol) {
  const [price, setPrice] = useState(null)
  useEffect(() => {
    if (!symbol) return
    const pair = NATIVE_PRICE_SYMBOL[symbol]
    if (!pair) return
    fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${pair}`)
      .then(r => r.json())
      .then(d => setPrice(parseFloat(d.price)))
      .catch(() => {})
  }, [symbol])
  return price
}

function shortAddr(a) { return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '' }
function fmtUsd(n) {
  if (n == null || isNaN(n)) return '$0.00'
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
}

// ── Icons
const IconCopy = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
const IconDisconnect = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
const IconLink = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>

export default function WalletScreen() {
  const { token } = useAuth()
  const { open: openWeb3Modal } = useWeb3Modal()
  const { address, isConnected, chain } = useAccount()
  const { disconnect: disconnectWallet } = useDisconnect()

  const nativeSymbol = chain ? (chain.nativeCurrency?.symbol || 'ETH') : 'ETH'
  const nativeUsdPrice = useNativeUsdPrice(nativeSymbol)
  const { data: balanceData } = useBalance({
    address,
    chainId: chain?.id,
    query: { enabled: isConnected && !!address && !!chain?.id },
  })

  // ── HL state
  const [hlConnected, setHlConnected] = useState(false)
  const [hlWallet, setHlWallet] = useState('')
  const [hlBalance, setHlBalance] = useState(null)
  const [hlMode, setHlMode] = useState('PAPER')
  const [hlPositions, setHlPositions] = useState([])
  const [hlTestnet, setHlTestnet] = useState(false)
  const [showHLModal, setShowHLModal] = useState(false)
  const [hlBusy, setHlBusy] = useState(false)
  const [hlError, setHlError] = useState('')
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false)

  // Listen for HL connection events from modal
  useEffect(() => {
    const onConnected = (ev) => {
      const d = ev?.detail
      if (!d?.ok) return
      setHlConnected(true)
      setHlMode('LIVE')
      setHlWallet(d.hl_wallet || '')
      setHlBalance(d.balance || null)
      setHlPositions(Array.isArray(d.positions) ? d.positions : [])
      if (ev?.detail?.testnet) setHlTestnet(true)
    }
    window.addEventListener('tt-hl-agent-connected', onConnected)
    return () => window.removeEventListener('tt-hl-agent-connected', onConnected)
  }, [])

  // Refresh HL status from backend (initial + every 30s while connected)
  const fetchHLStatus = useCallback(async () => {
    if (!token) return
    try {
      const res = await fetch(`${API_BASE}/api/hl-status`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data?.connected) {
        setHlConnected(true)
        setHlMode(data.mode || 'LIVE')
        setHlWallet(data.hl_wallet || '')
        setHlBalance(data.balance || null)
        setHlPositions(Array.isArray(data.positions) ? data.positions : [])
      } else {
        setHlConnected(false)
        setHlMode('PAPER')
      }
    } catch {}
  }, [token])

  useEffect(() => {
    fetchHLStatus()
  }, [fetchHLStatus])

  // Polling fallback: 30s (only while connected, as safety net)
  useEffect(() => {
    if (!hlConnected) return
    const id = setInterval(fetchHLStatus, 30_000)
    return () => clearInterval(id)
  }, [hlConnected, fetchHLStatus])

  // Instant refresh on HL fill/event via WebSocket signal
  const handleWsMessage = useCallback((msg) => {
    if (msg.type === 'hl_user_event') {
      fetchHLStatus()
    }
  }, [fetchHLStatus])

  useWebSocket(handleWsMessage, [], { token })

  const handleConnectWallet = useCallback(() => { haptic('medium'); openWeb3Modal() }, [openWeb3Modal])

  const handleDisconnectWallet = useCallback(async () => {
    haptic('light')
    if (hlConnected) {
      // First disconnect HL agent so backend cleans up
      try {
        await fetch(`${API_BASE}/api/disconnect-hl`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        })
      } catch {}
      await secureRemove(AGENT_SESSION_KEY)
      setHlConnected(false); setHlMode('PAPER'); setHlBalance(null); setHlWallet(''); setHlPositions([])
    }
    disconnectWallet()
  }, [hlConnected, token, disconnectWallet])

  const handleDisconnectHL = useCallback(async () => {
    haptic('light')
    setHlBusy(true); setHlError('')
    try {
      const res = await fetch(`${API_BASE}/api/disconnect-hl`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json().catch(() => ({}))
      if (!data?.ok && data?.error) throw new Error(data.error)
      await secureRemove(AGENT_SESSION_KEY)
      setHlConnected(false); setHlMode('PAPER'); setHlBalance(null); setHlWallet(''); setHlPositions([])
      window.dispatchEvent(new CustomEvent('tt-hl-agent-disconnected'))
    } catch (e) {
      setHlError(String(e.message || e))
    } finally {
      setHlBusy(false)
    }
  }, [token])

  const copyAddress = useCallback(() => {
    if (!address) return
    navigator.clipboard.writeText(address).catch(() => {})
    haptic('light')
  }, [address])

  // Native balance USD
  const nativeUsd = (() => {
    if (!balanceData?.value || !nativeUsdPrice) return null
    const dec = balanceData.decimals ?? 18
    const num = Number(balanceData.value) / 10 ** dec
    if (isNaN(num)) return null
    return num * nativeUsdPrice
  })()

  const hlTotal = hlBalance?.total ?? hlBalance?.total_usdt ?? null
  const hlAvail = hlBalance?.available ?? hlBalance?.available_usdt ?? hlBalance?.free_margin ?? null
  const hlMargin = hlBalance?.margin_used ?? hlBalance?.used_margin ?? null

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100%', color: 'var(--text)', display: 'flex', flexDirection: 'column', paddingBottom: 40 }}>
      {/* Header */}
      <div style={{ padding: '20px 20px 8px' }}>
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.5 }}>Wallet</div>
      </div>

      {!isConnected ? (
        // ── Empty state: connect wallet
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px' }}>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Connect your wallet</div>
          <div style={{ fontSize: 13, color: '#888', textAlign: 'center', marginBottom: 28, lineHeight: 1.5 }}>
            Connect with OKX, MetaMask or Rabby. Then set up the agent to trade on Hyperliquid.
          </div>
          <button onClick={handleConnectWallet} style={{
            width: '100%', maxWidth: 320, padding: 14, borderRadius: 16, border: 'none',
            background: '#00d992', color: '#000', fontSize: 15, fontWeight: 800, cursor: 'pointer',
          }}>
            Connect Wallet
          </button>
        </div>
      ) : (
        <>
          {/* ── HL Connected state */}
          {hlConnected ? (
            <>
              <div style={{ padding: '0 20px 16px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: '#00d992', marginBottom: 4 }}>
                  HYPERLIQUID {hlTestnet ? 'TESTNET' : 'MAINNET'} · {hlMode}
                </div>
                <div style={{ fontSize: 36, fontWeight: 800, letterSpacing: -1.2, marginTop: 4 }}>
                  {fmtUsd(hlTotal)}
                </div>
                <div style={{ fontSize: 13, color: '#888', marginTop: 4, fontFamily: 'var(--mono)' }}>
                  {hlWallet ? `Main: ${hlWallet.includes('…') ? hlWallet : shortAddr(hlWallet)}` : ''}
                </div>
              </div>

              {/* Balance breakdown + Margin health */}
              <div style={{ padding: '0 20px 16px' }}>
                <div style={{
                  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 14, padding: 14,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                    <span style={{ fontSize: 12, color: '#888' }}>Available</span>
                    <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--mono)' }}>
                      {fmtUsd(hlAvail)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                    <span style={{ fontSize: 12, color: '#888' }}>Margin Used</span>
                    <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--mono)', color: hlMargin ? '#f59e0b' : '#888' }}>
                      {fmtUsd(hlMargin || 0)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: hlTotal > 0 ? 10 : 0 }}>
                    <span style={{ fontSize: 12, color: '#888' }}>Open Positions</span>
                    <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--mono)' }}>
                      {hlPositions.length}
                    </span>
                  </div>

                  {/* Margin health bar */}
                  {hlTotal > 0 && (() => {
                    const used = hlMargin || 0
                    const ratio = Math.min((used / hlTotal) * 100, 100)
                    const barColor = ratio >= 80 ? '#f43f5e' : ratio >= 50 ? '#f59e0b' : '#00d992'
                    return (
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: 11, color: '#888' }}>Margin Utilization</span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: barColor, fontFamily: 'var(--mono)' }}>
                            %{ratio.toFixed(1)}
                          </span>
                        </div>
                        <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.08)' }}>
                          <div style={{
                            height: '100%', borderRadius: 2,
                            width: `${ratio}%`,
                            background: barColor,
                            transition: 'width 0.4s ease, background 0.4s ease',
                            boxShadow: ratio >= 80 ? `0 0 6px ${barColor}` : 'none',
                          }} />
                        </div>
                      </div>
                    )
                  })()}
                </div>
              </div>

              {/* Open positions list with liquidation price */}
              {hlPositions.length > 0 && (
                <div style={{ padding: '0 20px 16px' }}>
                  <div style={{ fontSize: 11, color: '#888', letterSpacing: 1.5, fontWeight: 700, marginBottom: 8 }}>
                    OPEN POSITIONS
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {hlPositions.map((pos, i) => {
                      const sym = (pos.symbol || pos.coin || '').replace(/USDT$/i, '')
                      const side = pos.side || (pos.size > 0 ? 'long' : 'short')
                      const isLong = side === 'long' || side === 'buy'
                      const pnl = pos.unrealized_pnl ?? pos.pnl ?? null
                      const pnlColor = pnl == null ? '#888' : pnl >= 0 ? '#00d992' : '#f43f5e'
                      const entry = pos.entry_price ?? pos.entryPx
                      const liqPrice = pos.liquidation_price ?? pos.liq_price ?? pos.liquidationPx
                      const leverage = pos.leverage
                      return (
                        <div key={i} style={{
                          background: 'rgba(255,255,255,0.02)',
                          border: `1px solid ${isLong ? 'rgba(0,217,146,0.15)' : 'rgba(244,63,94,0.15)'}`,
                          borderRadius: 12, padding: '10px 12px',
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{
                                fontSize: 10, fontWeight: 800, padding: '2px 6px', borderRadius: 4,
                                background: isLong ? 'rgba(0,217,146,0.15)' : 'rgba(244,63,94,0.15)',
                                color: isLong ? '#00d992' : '#f43f5e',
                              }}>
                                {isLong ? 'LONG' : 'SHORT'}{leverage ? ` ${leverage}x` : ''}
                              </span>
                              <span style={{ fontSize: 14, fontWeight: 700 }}>{sym}</span>
                            </div>
                            {pnl != null && (
                              <span style={{ fontSize: 13, fontWeight: 800, color: pnlColor, fontFamily: 'var(--mono)' }}>
                                {pnl >= 0 ? '+' : ''}{fmtUsd(pnl)}
                              </span>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                            {entry != null && (
                              <div>
                                <div style={{ fontSize: 9, color: '#666', marginBottom: 1 }}>ENTRY</div>
                                <div style={{ fontSize: 12, fontFamily: 'var(--mono)', fontWeight: 600 }}>${Number(entry).toLocaleString('en-US', { maximumFractionDigits: 2 })}</div>
                              </div>
                            )}
                            {liqPrice != null && (
                              <div>
                                <div style={{ fontSize: 9, color: '#f43f5e', marginBottom: 1 }}>LIQUIDATION</div>
                                <div style={{ fontSize: 12, fontFamily: 'var(--mono)', fontWeight: 700, color: '#f43f5e' }}>
                                  ${Number(liqPrice).toLocaleString('en-US', { maximumFractionDigits: 2 })}
                                </div>
                              </div>
                            )}
                            {pos.size != null && (
                              <div>
                                <div style={{ fontSize: 9, color: '#666', marginBottom: 1 }}>SIZE</div>
                                <div style={{ fontSize: 12, fontFamily: 'var(--mono)', fontWeight: 600 }}>{fmtUsd(Math.abs(pos.size) * (entry || 1))}</div>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {hlError && (
                <div style={{ margin: '0 20px 12px', background: 'rgba(255,59,92,0.1)', border: '1px solid rgba(255,59,92,0.3)', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#ff3b5c' }}>
                  {hlError}
                </div>
              )}

              <div style={{ padding: '0 20px 16px' }}>
                <button
                  onClick={() => { haptic('light'); setShowDisconnectConfirm(true) }}
                  disabled={hlBusy}
                  style={{
                    width: '100%', padding: 12, borderRadius: 12, border: '1px solid rgba(255,59,92,0.3)',
                    background: 'rgba(255,59,92,0.08)', color: '#ff3b5c',
                    fontSize: 13, fontWeight: 700, cursor: hlBusy ? 'wait' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}>
                  <IconDisconnect /> {hlBusy ? 'Disconnecting…' : 'Disconnect Hyperliquid'}
                </button>
              </div>
            </>
          ) : (
            // ── Wallet connected, HL not connected: prompt to connect
            <div style={{ padding: '0 20px 20px' }}>
              <div style={{
                background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.2)',
                borderRadius: 14, padding: 16, marginBottom: 14,
              }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#f59e0b', letterSpacing: 1.5, marginBottom: 6 }}>
                  TRADING AGENT NOT CONNECTED
                </div>
                <div style={{ fontSize: 13, color: '#ccc', lineHeight: 1.5, marginBottom: 12 }}>
                  Sign an EIP-712 message with your wallet to set up the trading agent on Hyperliquid.
                  Grants <b>trade-only</b> access — no withdrawals.
                </div>
                <button
                  onClick={() => { haptic('light'); setShowHLModal(true) }}
                  style={{
                    width: '100%', padding: 12, borderRadius: 10, border: 'none',
                    background: '#00d992', color: '#000', fontSize: 13, fontWeight: 800,
                    letterSpacing: 1, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}>
                  <IconLink /> CONNECT TO HYPERLIQUID
                </button>
              </div>
            </div>
          )}

          {/* ── Wallet info card */}
          <div style={{ padding: '0 20px 16px' }}>
            <div style={{ fontSize: 11, color: '#888', letterSpacing: 1.5, fontWeight: 700, marginBottom: 8 }}>
              WALLET
            </div>
            <div style={{
              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 14, padding: 14,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#00d992' }} />
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{chain?.name || 'Arbitrum'}</span>
                </div>
                <button onClick={copyAddress} style={{
                  background: 'transparent', border: 'none', color: '#888', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 11,
                }}>
                  <span style={{ fontFamily: 'var(--mono)' }}>{shortAddr(address)}</span>
                  <IconCopy />
                </button>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: '#888' }}>{nativeSymbol} Balance</span>
                <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--mono)' }}>
                  {balanceData ? `${(Number(balanceData.value) / 10 ** (balanceData.decimals ?? 18)).toFixed(4)} ${nativeSymbol}` : '—'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: '#888' }}>USD</span>
                <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--mono)', color: '#888' }}>
                  {nativeUsd != null ? fmtUsd(nativeUsd) : '—'}
                </span>
              </div>
            </div>
          </div>

          <div style={{ padding: '8px 20px 20px' }}>
            <button
              onClick={handleDisconnectWallet}
              style={{
                width: '100%', padding: 12, borderRadius: 12, border: '1px solid rgba(255,59,92,0.3)',
                background: 'rgba(255,59,92,0.08)', color: '#ff3b5c',
                fontSize: 13, fontWeight: 700, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}>
              <IconDisconnect /> Disconnect Wallet
            </button>
          </div>
        </>
      )}

      <ConnectHLModalMobile show={showHLModal} onClose={() => setShowHLModal(false)} />

      {/* ── Disconnect confirm dialog */}
      {showDisconnectConfirm && (
        <div
          onClick={() => setShowDisconnectConfirm(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          }}>
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 480,
              background: 'var(--bg-2)', borderTopLeftRadius: 24, borderTopRightRadius: 24,
              padding: '24px 20px calc(32px + var(--safe-bottom, 0px))',
              border: '1px solid rgba(255,255,255,0.06)',
            }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.15)', margin: '0 auto 20px' }} />
            <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 8 }}>Disconnect agent?</div>
            <div style={{ fontSize: 13, color: '#888', lineHeight: 1.55, marginBottom: 24 }}>
              The Hyperliquid trading agent will be disabled. Your open positions are not affected, but you won't be able to send new orders.
            </div>
            <button
              onClick={async () => { setShowDisconnectConfirm(false); await handleDisconnectHL() }}
              style={{
                width: '100%', padding: 14, borderRadius: 12, border: 'none',
                background: 'rgba(255,59,92,0.15)', color: '#ff3b5c',
                fontSize: 14, fontWeight: 800, cursor: 'pointer', marginBottom: 8,
              }}>
              Yes, disconnect
            </button>
            <button
              onClick={() => setShowDisconnectConfirm(false)}
              style={{
                width: '100%', padding: 14, borderRadius: 12, border: 'none',
                background: 'transparent', color: '#666',
                fontSize: 14, fontWeight: 600, cursor: 'pointer',
              }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
