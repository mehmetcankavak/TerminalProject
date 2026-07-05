import { defaultWagmiConfig } from '@web3modal/wagmi/react'
import { arbitrum } from 'viem/chains'

export const projectId = import.meta.env.VITE_WC_PROJECT_ID || ''

const metadata = {
  name: 'Trading Terminal',
  description: 'Hyperliquid Trading Terminal',
  url: import.meta.env.VITE_API_URL || 'https://localhost',
  icons: [],
}

export const wagmiConfig = defaultWagmiConfig({
  chains: [arbitrum],
  projectId,
  metadata,
  enableEmail: false,
  enableCoinbase: false,
})
