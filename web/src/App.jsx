import { useState, useEffect, useRef } from 'react'
import ErrorBoundary from './components/ErrorBoundary'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { GoogleOAuthProvider } from '@react-oauth/google'
import { useAuth } from './context/AuthContext'
import { useLang } from './context/LangContext'
import { isNative } from './capacitor'
import MobileApp from './mobile/MobileApp'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import Sidebar from './components/Sidebar'
import DashboardPage from './components/DashboardPage'
import SystemAlerts from './components/SystemAlerts'
import TerminalPage from './components/TerminalPage'
import PortfolioPage from './components/PortfolioPage'
import ScrollTicker from './components/ScrollTicker'
import MarketsPage from './components/MarketsPage'
import MobileStocksPage from './components/MobileStocksPage'
import StocksPage from './components/StocksPage'
import GlobalMetrics from './components/GlobalMetrics'
import FundingRate from './components/FundingRate'
import LiquidationsStream from './components/LiquidationsStream'
import VolumeMonitor from './components/VolumeMonitor'
import MarketCompass from './components/MarketCompass'
import ETFPage from './components/ETFPage'
import EconomicCalendar from './components/EconomicCalendar'
import LongShortRatio from './components/LongShortRatio'
import BigTransfers from './components/BigTransfers'
import SmartMoney from './components/SmartMoney'
import TokenUnlock from './components/TokenUnlock'
import CustomAlerts from './components/CustomAlerts'
import GlobalAlertSound from './components/GlobalAlertSound'
import ProGate from './components/ProGate'
import AccountSettings from './components/AccountSettings'
import CryptoUpgradePage from './components/CryptoUpgradePage'
import AIChat from './components/AIChat'
import AlertMonitoring from './components/AlertMonitoring'
import AdminPage from './pages/AdminPage'
import PrivacyPage from './pages/PrivacyPage'
import TermsPage from './pages/TermsPage'
import NotFoundPage from './pages/NotFoundPage'
import OnboardingModal from './components/OnboardingModal'

// Pro-only pages
const PRO_PAGES = new Set([
  'terminal',
  'etf',
  'market-compass',
  'long-short-ratio',
  'funding-rate',
  'liquidations-stream',
  'volume-monitor',
  'custom-alerts',
  'token-unlock',
  'big-transfers',
  'smart-money',
  'portfolio',
  'stocks',
])

function ProtectedRoute({ children }) {
  const { token, isLoading } = useAuth()
  if (isLoading) {
    return (
      <div className="auth-loading-screen">
        <div className="auth-loading-logo">
          <span className="logo-bracket">[</span>TT<span className="logo-bracket">]</span>
        </div>
        <div className="auth-loading-spinner" />
      </div>
    )
  }
  if (!token) return <Navigate to="/login" replace />
  return children
}

function UpgradedBanner({ onDismiss }) {
  const { t } = useLang()
  return (
    <div className="upgraded-banner">
      <span>{t('welcome_pro')}</span>
      <button onClick={onDismiss}>✕</button>
    </div>
  )
}

function UserProfileBadge({ onPageChange }) {
  const { user, plan, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const isPro = plan === 'pro'

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const email    = user?.email || ''
  const username = user?.username || user?.name || email.split('@')[0] || 'User'
  const initials = username.slice(0, 2).toUpperCase()

  return (
    <div className="upb-wrap" ref={ref}>
      <button className={`upb-chip${isPro ? ' pro' : ''}`} onClick={() => setOpen(p => !p)}>
        <span className={`upb-avatar${isPro ? ' pro' : ''}`}>{initials}</span>
        <span className="upb-name">{username}</span>
        <span className={`upb-plan-badge${isPro ? ' pro' : ''}`}>{isPro ? 'PRO' : 'FREE'}</span>
        <svg className="upb-chevron" width="10" height="10" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      {open && (
        <div className="upb-dropdown">
          <div className="upb-dd-email">{email}</div>
          {!isPro && (
            <button className="upb-dd-item upgrade" onClick={() => { setOpen(false); onPageChange('upgrade') }}>
              ⚡ Upgrade to Pro
            </button>
          )}
          <button className="upb-dd-item" onClick={() => { setOpen(false); onPageChange('account-settings') }}>
            Account Settings
          </button>
          <button className="upb-dd-item danger" onClick={() => { setOpen(false); logout() }}>
            Sign Out
          </button>
        </div>
      )}
    </div>
  )
}

function MobileMenuBtn({ onClick }) {
  return (
    <button className="mobile-menu-btn" onClick={onClick} aria-label="Menu">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
      </svg>
    </button>
  )
}

function TerminalApp() {
  const location = useLocation()
  const [activePage, setActivePage] = useState(() => {
    const page = sessionStorage.getItem('tt_start_page')
    if (page) { sessionStorage.removeItem('tt_start_page'); return page }
    const hash = window.location.hash.replace('#', '')
    return hash || 'dashboard'
  })
  const [showUpgradedBanner, setShowUpgradedBanner] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  // Sync URL hash when page changes
  const handlePageChange = (page) => {
    setActivePage(page)
    setMobileMenuOpen(false)
    window.history.replaceState({}, '', page === 'dashboard' ? '/app' : `/app#${page}`)
  }

  useEffect(() => {
    if (location.search.includes('upgraded=true')) {
      setShowUpgradedBanner(true)
      window.history.replaceState({}, '', '/app')
    }
  }, [location.search])

  useEffect(() => {
    const navHandler = (e) => {
      if (e.detail?.page) handlePageChange(e.detail.page)
    }
    const sessionHandler = () => {
      handlePageChange('dashboard')
    }
    window.addEventListener('tt-navigate', navHandler)
    window.addEventListener('tt-session-expired', sessionHandler)
    return () => {
      window.removeEventListener('tt-navigate', navHandler)
      window.removeEventListener('tt-session-expired', sessionHandler)
    }
  }, [])

  const renderContent = () => {
    const EB = ({ children }) => <ErrorBoundary inline key={activePage}>{children}</ErrorBoundary>
    switch (activePage) {
      case 'system-alerts':      return <EB><SystemAlerts /></EB>
      case 'spot-markets':       return <EB><MarketsPage /></EB>
      case 'etf':                return <ProGate><EB><ETFPage /></EB></ProGate>
      case 'stocks':             return <ProGate><EB><StocksPage /></EB></ProGate>
      case 'global-metrics':     return <EB><GlobalMetrics /></EB>
      case 'economic-calendar':  return <EB><EconomicCalendar /></EB>
      case 'portfolio':
        return <ProGate><EB><PortfolioPage /></EB></ProGate>
      case 'terminal':
        return <ProGate><EB><TerminalPage /></EB></ProGate>
      case 'funding-rate':
        return <ProGate><EB><FundingRate /></EB></ProGate>
      case 'liquidations-stream':
        return <ProGate><EB><LiquidationsStream /></EB></ProGate>
      case 'volume-monitor':
        return <ProGate><EB><VolumeMonitor /></EB></ProGate>
      case 'market-compass':
        return <ProGate><EB><MarketCompass /></EB></ProGate>
      case 'long-short-ratio':
        return <ProGate><EB><LongShortRatio /></EB></ProGate>
      case 'custom-alerts':
        return <ProGate><EB><CustomAlerts /></EB></ProGate>
      case 'token-unlock':
        return <ProGate><EB><TokenUnlock /></EB></ProGate>
      case 'big-transfers':
        return <ProGate><EB><BigTransfers /></EB></ProGate>
      case 'alert-monitoring':
        return <EB><AlertMonitoring /></EB>
      case 'smart-money':
        return <ProGate><EB><SmartMoney /></EB></ProGate>
      case 'account-settings':
        return <EB><AccountSettings /></EB>
      case 'upgrade':
        return <EB><CryptoUpgradePage /></EB>
      case 'admin':
        return <EB><AdminPage /></EB>
      case 'dashboard':
      default:
        return <EB><DashboardPage /></EB>
    }
  }

  const PAGE_TITLES = {
    'alert-monitoring':     { title: 'Alert Monitoring',      sub: 'Triggered Alerts History' },
    'dashboard':            { title: 'Trading Terminal (Beta)', sub: 'Beta Version' },
    'terminal':             { title: 'Trading Terminal',      sub: 'News + Trade Execution' },
    'system-alerts':        { title: 'System Alerts',         sub: 'Manage Notifications' },
    'spot-markets':         { title: 'Markets',               sub: 'Hyperliquid Perps' },
    'etf':                  { title: 'ETF Data',              sub: 'BTC & ETH ETFs · Yahoo Finance' },
    'stocks':               { title: 'Stocks',                sub: 'US Equities · TradFi' },
    'global-metrics':       { title: 'Global Metrics',        sub: 'Market Overview' },
    'market-compass':       { title: 'Market Compass',         sub: '7-Signal Composite Direction' },
    'long-short-ratio':     { title: 'Long Short Ratio',      sub: 'BTC Analysis' },
    'funding-rate':         { title: 'Funding Rate',          sub: 'Perpetual Futures' },
    'liquidations-stream':  { title: 'Liquidations Stream',   sub: 'Real-time' },
    'custom-alerts':        { title: 'Custom Alerts',         sub: 'Your Alerts' },
    'volume-monitor':       { title: 'Volume Monitor',        sub: '24h Analysis' },
    'token-unlock':         { title: 'Token Unlock',          sub: 'Upcoming Events' },
    'big-transfers':        { title: 'Big Transfers',         sub: 'Whale Activity' },
    'smart-money':          { title: 'Smart Money',           sub: 'Top Traders · Copy Trade' },
    'economic-calendar':    { title: 'Economic Calendar',     sub: 'Global Events' },
    'account-settings':     { title: 'Account Settings',      sub: 'Plan & Security' },
    'upgrade':              { title: 'Upgrade',               sub: 'Crypto Billing' },
    'admin':                { title: 'Admin Panel',           sub: 'Users & Revenue' },
    'portfolio':            { title: 'Portfolio',             sub: 'Performance & Stats' },
  }

  const currentPage = PAGE_TITLES[activePage] || PAGE_TITLES['dashboard']
  const isTerminal  = activePage === 'terminal'

  return (
    <div className="app-layout">
      {/* Desktop sidebar (hidden on mobile via CSS) */}
      <Sidebar activePage={activePage} onPageChange={handlePageChange} proPages={PRO_PAGES} />

      {/* Mobile sidebar overlay */}
      {mobileMenuOpen && (
        <div className="mobile-sidebar-overlay" onClick={() => setMobileMenuOpen(false)}>
          <div className="mobile-sidebar" onClick={e => e.stopPropagation()}>
            <Sidebar activePage={activePage} onPageChange={handlePageChange} proPages={PRO_PAGES} />
          </div>
        </div>
      )}

      <OnboardingModal />

      <div className="main-content">
        {showUpgradedBanner && (
          <UpgradedBanner onDismiss={() => setShowUpgradedBanner(false)} />
        )}
        <ScrollTicker />
        {!isTerminal && (
          <div className="header">
            <MobileMenuBtn onClick={() => setMobileMenuOpen(true)} />
            <div className="header-title">
              <h1>{currentPage.title}</h1>
              <span>{currentPage.sub}</span>
            </div>
            <div className="header-actions">
              <div className="status-badge connected">
                <span className="status-dot" />
                Connected
              </div>
              <UserProfileBadge onPageChange={handlePageChange} />
            </div>
          </div>
        )}
        {!isTerminal && <GlobalAlertSound />}
        {renderContent()}
      </div>
      <AIChat />
    </div>
  )
}

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''

function AppRouter() {
  return <TerminalApp />
}

export default function App() {
  // Native Capacitor app: bypass all web routing, go straight to MobileApp
  if (isNative) {
    return <MobileApp />
  }

  const inner = (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route
        path="/app"
        element={
          <ProtectedRoute>
            <ErrorBoundary>
              <AppRouter />
            </ErrorBoundary>
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )

  if (!GOOGLE_CLIENT_ID) return inner
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      {inner}
    </GoogleOAuthProvider>
  )
}
