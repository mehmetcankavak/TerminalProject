import { useAuth } from '../../context/AuthContext'
import { haptic } from '../../capacitor'

const IconAlert = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
const IconWhale = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12c-2.66-2-6-3-10-3-4.5 0-8 2-10 4 2 2 6 3 10 3s8-1.5 10-4z"></path></svg>
const IconTransfer = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path></svg>
const IconFunding = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20V10"></path><path d="M18 20V4"></path><path d="M6 20v-4"></path></svg>
const IconVolume = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
const IconETF = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="M7 14l4-4 4 4 5-7"/></svg>
const IconGlobe = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>
const IconCompass = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>
const IconLiquidations = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
const IconSettings = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
const IconUpgrade = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
const IconPortfolio = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="3" y2="20"/><line x1="9" y1="6"  x2="9" y2="20"/><line x1="15" y1="9" x2="15" y2="20"/><line x1="21" y1="3" x2="21" y2="20"/></svg>
const BellIcon = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>

// Free tier: Stocks, Crypto, Settings. Everything else is Pro —
// keep in sync with SUB_PAGES.pro / PRO_TABS in MobileApp.jsx.
const ITEMS = [
  { id: 'portfolio',      icon: <IconPortfolio />, label: 'Portfolio',      pro: true  },
  { id: 'custom-alerts',  icon: <IconAlert />,     label: 'Price Alerts',   pro: true  },
  { id: 'smart-money',    icon: <IconWhale />,     label: 'Smart Money',    pro: true  },
  { id: 'big-transfers',       icon: <IconTransfer />,      label: 'Big Transfers',       pro: true  },
  { id: 'liquidations-stream', icon: <IconLiquidations />,  label: 'Liquidation Stream',  pro: true  },
  { id: 'funding-rate',        icon: <IconFunding />,       label: 'Funding Rate',        pro: true  },
  { id: 'volume-monitor',      icon: <IconVolume />,        label: 'Volume Monitor',      pro: true  },
  { id: 'etf-data',            icon: <IconETF />,           label: 'ETF Data',            pro: true  },
  { id: 'global-metrics',      icon: <IconGlobe />,         label: 'Global Metrics',      pro: true  },
  { id: 'market-compass',      icon: <IconCompass />,       label: 'Market Compass',      pro: true  },
  { id: 'account-settings', icon: <IconSettings />, label: 'Settings',       pro: false },
  { id: 'upgrade',          icon: <IconUpgrade />,  label: 'Upgrade to Pro', pro: false },
]

function MenuItem({ item, onNav, plan }) {
  const locked = item.pro && plan !== 'pro'
  return (
    <button className="menu-item" onClick={() => { haptic('light'); onNav(item.id) }}>
      <div className="menu-item-icon">{item.icon}</div>
      <div className="menu-item-text">
        <div className="menu-item-name">{item.label}</div>
      </div>
      <div className="menu-item-right">
        {locked && <span className="menu-item-pro">PRO</span>}
        <span className="menu-item-chevron">›</span>
      </div>
    </button>
  )
}

export default function MenuScreen({ onNavigate }) {
  const { plan, logout } = useAuth()

  const handleLogout = () => {
    haptic('medium')
    logout()
  }

  return (
    <div style={{ paddingTop: 20 }}>
      {/* Header matching Midas "Menü" */}
      <div style={{ padding: '0 20px', marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: '0.5px' }}>Menu</h1>
        <div style={{ position: 'relative', cursor: 'pointer' }}>
          <BellIcon />
          <div style={{ position: 'absolute', top: -1, right: 1, width: 6, height: 6, background: '#8b5cf6', borderRadius: '50%' }}></div>
        </div>
      </div>

      <div className="menu-section">
        {ITEMS.map(t => <MenuItem key={t.id} item={t} onNav={onNavigate} plan={plan} />)}
      </div>

      <button className="menu-logout" onClick={handleLogout}>Sign Out</button>
    </div>
  )
}
