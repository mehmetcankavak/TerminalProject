import { useState, useEffect, useRef, Suspense, lazy } from 'react'
import { useAuth } from '../context/AuthContext'
import OnboardingModal from '../components/OnboardingModal'
import { haptic, requestNotificationPermission, requestPushPermission, isNative } from '../capacitor'
import LogoTT from '../components/LogoTT'
import ErrorBoundary from '../components/ErrorBoundary'
import './mobile.css'
import { TrendingUp, Bitcoin, Terminal, Wallet, Menu } from 'lucide-react'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { wagmiConfig } from '../wagmiConfig'
import { ensureWeb3ModalReady } from './web3ModalInit'

const queryClient = new QueryClient()
import MobileAuth from './MobileAuth'
import MarketsScreen from './screens/MarketsScreen'
import MenuScreen from './screens/MenuScreen'
import TerminalScreen from './screens/TerminalScreen'
import WalletScreen from './screens/WalletScreen'
import MobileStocksPage from '../components/MobileStocksPage'

// Sub-pages loaded on demand (from Menu)
const Portfolio = lazy(() => import('./screens/PortfolioScreen'))
const PriceAlerts = lazy(() => import('./screens/PriceAlertsScreen'))
const CustomAlerts = lazy(() => import('../components/CustomAlerts'))
const SmartMoney = lazy(() => import('./screens/SmartMoneyScreen'))
const BigTransfers = lazy(() => import('./screens/BigTransfersScreen'))
const FundingRate = lazy(() => import('./screens/FundingRateScreen'))
const LiquidationsStream = lazy(() => import('./screens/LiquidationsStreamScreen'))
const VolumeMonitor = lazy(() => import('./screens/VolumeMonitorScreen'))
const AccountSettings = lazy(() => import('./screens/AccountSettingsScreen'))
const CryptoUpgrade = lazy(() => import('../components/CryptoUpgradePage'))
const MobilePaywall = lazy(() => import('./MobilePaywall'))
const ChartScreen = lazy(() => import('./screens/ChartScreen'))
const ETFData = lazy(() => import('./screens/ETFScreen'))
const GlobalMetrics = lazy(() => import('./screens/GlobalMetricsScreen'))
const MarketCompass = lazy(() => import('./screens/MarketCompassScreen'))

// Native Capacitor builds get the App-HIG paywall; web keeps the
// existing Stripe + crypto checkout page (App Store rules forbid the
// latter inside the iOS app).
const Upgrade = isNative ? MobilePaywall : CryptoUpgrade

// Free tier: Stocks, Crypto (Markets), Settings only. Chart + Upgrade
// pages stay open because they're triggered from those free surfaces
// (coin drill-down from Markets, paywall itself).
const SUB_PAGES = {
  'portfolio': { title: 'Portfolio', component: Portfolio, pro: true },
  'custom-alerts': { title: 'Price Alerts', component: isNative ? PriceAlerts : CustomAlerts, noHeader: isNative, pro: true },
  'smart-money': { title: 'Smart Money', component: SmartMoney, pro: true },
  'big-transfers': { title: 'Big Transfers', component: BigTransfers, pro: true },
  'liquidations-stream': { title: 'Liquidation Stream', component: LiquidationsStream, pro: true },
  'funding-rate': { title: 'Funding Rate', component: FundingRate, pro: true },
  'volume-monitor': { title: 'Volume Monitor', component: VolumeMonitor, pro: true },
  'account-settings': { title: 'Settings', component: AccountSettings, pro: false },
  'upgrade': { title: 'Upgrade to Pro', component: Upgrade, noHeader: isNative, pro: false },
  'chart': { title: '', component: ChartScreen, noHeader: true, pro: false },
  'etf-data': { title: 'ETF Data', component: ETFData, pro: true },
  'global-metrics': { title: 'Global Metrics', component: GlobalMetrics, pro: true },
  'market-compass': { title: 'Market Compass', component: MarketCompass, pro: true },
}

// Pro-only main tabs (bottom bar). Terminal (trading) and Wallet (exchange
// connection) require Pro — free tier is read-only market data.
const PRO_TABS = new Set(['wallet', 'terminal'])


const TABS = [
  { id: 'stocks', icon: <TrendingUp size={22} strokeWidth={2.2} />, label: 'Stocks' },
  { id: 'markets', icon: <Bitcoin size={22} strokeWidth={2.2} />, label: 'Crypto' },
  { id: 'terminal', icon: <Terminal size={22} strokeWidth={2.2} />, label: 'Terminal' },
  { id: 'wallet', icon: <Wallet size={22} strokeWidth={2.2} />, label: 'Wallet' },
  { id: 'menu', icon: <Menu size={22} strokeWidth={2.2} />, label: 'More' },
]

function PageLoader() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--green)', fontSize: 32 }}>
      <span style={{ animation: 'm-spin 1s linear infinite', display: 'inline-block' }}>◌</span>
    </div>
  )
}

// Sub-page: slides in from the right, has a back button
function SubPage({ pageId, onBack, extraProps }) {
  const page = SUB_PAGES[pageId]
  if (!page) return null
  const Component = page.component

  // noHeader pages (like ChartScreen) manage their own header + back button
  if (page.noHeader) {
    return (
      <div className="m-subpage" style={{ display: 'flex', flexDirection: 'column' }}>
        <Suspense fallback={<PageLoader />}>
          <Component onBack={() => { haptic('light'); onBack() }} {...(extraProps || {})} />
        </Suspense>
      </div>
    )
  }

  return (
    <div className="m-subpage">
      <div className="m-subpage-header">
        <button className="m-subpage-back" onClick={() => { haptic('light'); onBack() }}>‹</button>
        <div className="m-subpage-title">{page.title}</div>
      </div>
      <div className="m-subpage-body">
        <Suspense fallback={<PageLoader />}>
          <Component />
        </Suspense>
      </div>
    </div>
  )
}

export default function MobileApp() {
  const { user, plan, isLoading, refresh, token } = useAuth()
  // Default to markets — free users land on read-only market data;
  // upgrading later unlocks Terminal & Wallet without disturbing the tab.
  const [activeTab, setActiveTab] = useState('markets')
  const [subPage, setSubPage] = useState(null)
  const [chartInfo, setChartInfo] = useState(null)
  const [alertPrefill, setAlertPrefill] = useState(null)
  const tabRefs = useRef({})

  useEffect(() => {
    ensureWeb3ModalReady()
    requestNotificationPermission()
  }, [])

  // Handle tt-navigate events dispatched by OnboardingModal finish
  useEffect(() => {
    const handler = (e) => {
      const page = e.detail?.page
      if (!page) return
      const tabs = new Set(['stocks', 'markets', 'terminal', 'wallet', 'menu'])
      if (tabs.has(page)) {
        setSubPage(null)
        setActiveTab(page)
      } else if (page in SUB_PAGES) {
        setSubPage(page)
      }
    }
    window.addEventListener('tt-navigate', handler)
    return () => window.removeEventListener('tt-navigate', handler)
  }, [])

  // Push permission + token registration — runs once after login
  useEffect(() => {
    if (!user || !token) return
    requestPushPermission(token)
  }, [user, token])

  if (isLoading) {
    return (
      <div className="m-root m-loading">
        <LogoTT width={72} height={72} />
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 3, color: '#00d992', marginTop: 4, fontFamily: 'var(--mono)' }}>
          TRADING TERMINAL
        </div>
        <div className="m-loading-dot" style={{ marginTop: 24 }}>
          <span /><span /><span />
        </div>
      </div>
    )
  }

  if (!user) return <MobileAuth onSuccess={() => { }} />

  const isPro = plan === 'pro'

  const handleTab = (id) => {
    haptic('light')
    // Pro-only tabs: free user → upgrade page
    if (PRO_TABS.has(id) && !isPro) {
      setSubPage('upgrade')
      return
    }
    if (id === activeTab && !subPage) {
      const el = tabRefs.current[id]
      if (el) el.scrollTo({ top: 0, behavior: 'smooth' })
      window.dispatchEvent(new CustomEvent('tt-tab-retap', { detail: { tab: id } }))
      return
    }
    setSubPage(null)
    setActiveTab(id)
  }

  const handleNavigate = (id, params) => {
    if (id === 'chart') {
      setChartInfo(params)
      setSubPage('chart')
      return
    }
    if (id === 'custom-alerts') {
      if (!isPro) { setSubPage('upgrade'); return }
      setAlertPrefill(params?.prefillSym || null)
      setSubPage('custom-alerts')
      return
    }
    if (id in SUB_PAGES) {
      // Pro-only subpage gate
      if (SUB_PAGES[id].pro && !isPro) {
        setSubPage('upgrade')
        return
      }
      setSubPage(id)
      return
    }
    // map to tab
    const tabMap = { stocks: 'stocks', markets: 'markets', portfolio: 'portfolio', menu: 'menu' }
    if (tabMap[id]) {
      // Tab-mapped id might also be a pro tab
      if (PRO_TABS.has(tabMap[id]) && !isPro) {
        setSubPage('upgrade')
        return
      }
      setActiveTab(tabMap[id])
    } else {
      setSubPage(id)
    }
  }

  // Tabs stay mounted so data, WebSocket and scroll position persist —
  // switching is instant, no re-fetch on tab change.
  const tabPane = (id, node) => (
    <div
      key={id}
      ref={el => { tabRefs.current[id] = el }}
      style={{
        display: activeTab === id ? 'flex' : 'none',
        flexDirection: 'column',
        flex: 1,
        height: '100%',
        minHeight: 0,
        overflow: 'auto',
      }}
      aria-hidden={activeTab !== id}
    >
      <ErrorBoundary>{node}</ErrorBoundary>
    </div>
  )

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <OnboardingModal />
        <div className="m-root m-shell">
          {/* Safe area top spacer */}
          <div className="m-status-bar" />

          {/* Top bar (hidden on some screens for custom headers) */}
          {!['wallet', 'menu'].includes(activeTab) && (
            <header className="m-topbar">
              <div className="m-topbar-logo" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <LogoTT width={28} height={28} />
                <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: 2, color: '#00d992', fontFamily: 'var(--mono)' }}>
                  TRADING TERMINAL
                </span>
              </div>
              <div className="m-topbar-right">
                <span className={`m-plan-badge ${plan === 'pro' ? '' : 'free'}`}>
                  {plan === 'pro' ? '✦ PRO' : 'FREE'}
                </span>
              </div>
            </header>
          )}

          {/* Main content — all tabs mounted, only active is visible */}
          <main className={`m-content ${['wallet', 'menu'].includes(activeTab) ? 'no-topbar' : ''}`}
            style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            {tabPane('stocks', <MobileStocksPage onNavigate={handleNavigate} />)}
            {tabPane('markets', <MarketsScreen onNavigate={handleNavigate} />)}
            {tabPane('terminal', <TerminalScreen />)}
            {tabPane('wallet', <WalletScreen />)}
            {tabPane('menu', <MenuScreen onNavigate={handleNavigate} />)}
          </main>

          {/* Sub-page overlay (slides over everything except tab bar) */}
          {subPage && (
            <ErrorBoundary key={subPage + (chartInfo?.sym || '')}>
              <SubPage
                pageId={subPage}
                onBack={() => { setSubPage(null); if (subPage === 'chart') setChartInfo(null) }}
                extraProps={
                  subPage === 'chart' ? (chartInfo ? { ...chartInfo, onNavigate: handleNavigate } : { onNavigate: handleNavigate }) :
                    subPage === 'custom-alerts' ? { prefillSym: alertPrefill } :
                      undefined
                }
              />
            </ErrorBoundary>
          )}

          {/* Bottom tab bar */}
          <nav className="m-tab-bar">
            {TABS.map(tab => {
              const locked = PRO_TABS.has(tab.id) && !isPro
              return (
                <button key={tab.id} className={`m-tab ${activeTab === tab.id && !subPage ? 'active' : ''}${locked ? ' locked' : ''}`}
                  onClick={() => handleTab(tab.id)}>
                  <span className="m-tab-icon">{tab.icon}</span>
                  {tab.label && <span className="m-tab-label">{tab.label}</span>}
                  {locked && <span className="m-tab-lock">PRO</span>}
                </button>
              )
            })}
          </nav>
        </div>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
