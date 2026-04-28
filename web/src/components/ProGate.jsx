import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../context/LangContext'

function UpgradeModal({ onClose }) {
  const { t } = useLang()
  const goUpgrade = () => {
    window.dispatchEvent(new CustomEvent('tt-navigate', { detail: { page: 'upgrade' } }))
    onClose()
  }

  return (
    <div className="progate-overlay" onClick={onClose}>
      <div className="progate-modal" onClick={e => e.stopPropagation()}>
        <div className="progate-modal-glow" />
        <button className="progate-close" onClick={onClose}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>

        <div className="progate-badge">
          <span className="progate-badge-dot" />
          PRO
        </div>

        <h2 className="progate-title">{t('pro_only_title')}</h2>
        <p className="progate-desc">{t('pro_only_desc')}</p>

        <div className="progate-features">
          <div className="progate-feat">
            <span className="progate-feat-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
            </span>
            <span>Funding Rate · Long/Short Ratio</span>
          </div>
          <div className="progate-feat">
            <span className="progate-feat-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            </span>
            <span>Liquidation Stream + Heatmap</span>
          </div>
          <div className="progate-feat">
            <span className="progate-feat-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </span>
            <span>Volume Monitor · Token Unlock</span>
          </div>
          <div className="progate-feat">
            <span className="progate-feat-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            </span>
            <span>Whale Transfers · Custom Alerts</span>
          </div>
          <div className="progate-feat">
            <span className="progate-feat-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
            </span>
            <span>{t('pro_list_live_order')}</span>
          </div>
          <div className="progate-feat">
            <span className="progate-feat-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
            </span>
            <span>{t('pro_list_watchlist')}</span>
          </div>
        </div>

        <button className="progate-btn" onClick={goUpgrade}>
          {t('go_pro')}
        </button>

        <p className="progate-note">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{opacity:.5}}>
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          Pay with USDT/USDC on 5+ networks
        </p>
      </div>
    </div>
  )
}

export default function ProGate({ children }) {
  const { plan } = useAuth()
  const { t } = useLang()
  const [showModal, setShowModal] = useState(false)

  if (plan === 'pro') return children

  return (
    <>
      <div className="progate-preview">
        <div className="progate-preview-content">
          {children}
        </div>
        <div className="progate-preview-fade" />
        <div className="progate-preview-strip">
          <div className="progate-strip-inner">
            <span className="progate-strip-badge">PRO</span>
            <span className="progate-strip-text">
              {t('preview_upgrade_text') || 'You are viewing a limited preview. Upgrade to PRO for full access.'}
            </span>
            <button className="progate-strip-btn" onClick={() => setShowModal(true)}>
              {t('upgrade_cta') || 'Upgrade to Pro →'}
            </button>
          </div>
        </div>
      </div>
      {showModal && <UpgradeModal onClose={() => setShowModal(false)} />}
    </>
  )
}
