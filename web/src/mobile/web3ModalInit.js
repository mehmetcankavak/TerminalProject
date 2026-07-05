import { createWeb3Modal } from '@web3modal/wagmi/react'
import { wagmiConfig, projectId } from '../wagmiConfig'
import { arbitrum } from 'viem/chains'

// WalletConnect modal initialization — singleton promise.
// Idempotent: birden fazla çağrı tek init yapar; promise tüm tüketicilere paylaşılır.
// Ayrı modülde tutuluyor — MobileApp ile ConnectHLModalMobile arasındaki circular
// import'u önler.
let _promise = null

export function ensureWeb3ModalReady() {
  if (_promise) return _promise
  _promise = new Promise((resolve) => {
    if (!projectId) {
      console.warn('[Web3Modal] projectId missing — skipping init')
      resolve(false)
      return
    }
    try {
      createWeb3Modal({
        wagmiConfig,
        projectId,
        chains: [arbitrum],
        themeMode: 'dark',
        themeVariables: {
          '--w3m-accent': '#00d992',
          '--w3m-border-radius-master': '12px',
        },
        featuredWalletIds: [
          '971e689d0a5be527bac79dde4b6b455e3f9e9a0f2c3e2e6c4a7f2e3b1d4c5a6', // OKX Wallet
        ],
      })
      resolve(true)
    } catch (err) {
      console.error('[Web3Modal] init failed:', err)
      _promise = null  // tekrar denenebilsin
      resolve(false)
    }
  })
  return _promise
}
