import { Link } from 'react-router-dom'

export default function TermsPage() {
  return (
    <div className="legal-page">
      <nav className="landing-nav">
        <Link to="/" className="landing-logo">
          <span className="logo-bracket">[</span>TT<span className="logo-bracket">]</span>
          <span className="logo-label">TRADING TERMINAL</span>
        </Link>
        <div className="landing-nav-actions">
          <Link to="/" className="nav-link">← Back</Link>
        </div>
      </nav>

      <div className="legal-content">
        <div className="legal-eyebrow">LEGAL</div>
        <h1 className="legal-title">Terms of Service</h1>
        <p className="legal-date">Last updated: March 2026</p>

        <div className="legal-body">
          <h2>1. Acceptance of Terms</h2>
          <p>By creating an account or using Trading Tools, you agree to these Terms of Service. If you do not agree, do not use the platform.</p>

          <h2>2. Description of Service</h2>
          <p>Trading Tools provides a real-time crypto market intelligence dashboard including liquidation monitoring, funding rate tracking, whale transfer feeds, volume alerts, and order execution tools. The service is provided on a subscription basis.</p>

          <h2>3. Not Financial Advice</h2>
          <p><strong>Trading Tools does not provide financial, investment, or trading advice.</strong> All data is for informational purposes only. You are solely responsible for your trading decisions. Crypto markets are highly volatile and you may lose your entire investment.</p>

          <h2>4. Subscription and Billing</h2>
          <ul>
            <li>Pro subscriptions are billed monthly at $49/month or annually at $468/year ($39/month)</li>
            <li>Payments are processed by Stripe. By subscribing, you agree to Stripe's terms</li>
            <li>You may cancel at any time — access continues until end of billing period</li>
            <li>We offer a 7-day money-back guarantee for new Pro subscribers. Contact support within 7 days of first charge</li>
          </ul>

          <h2>5. Account Responsibilities</h2>
          <p>You are responsible for maintaining the security of your account credentials. Do not share your account. One account per person. We reserve the right to suspend accounts that violate these terms.</p>

          <h2>6. Prohibited Use</h2>
          <ul>
            <li>Scraping, automated access, or reverse engineering the platform</li>
            <li>Sharing account access with others</li>
            <li>Using the platform for illegal activities</li>
            <li>Attempting to circumvent security measures</li>
          </ul>

          <h2>7. Availability and Uptime</h2>
          <p>We aim for 99.9% uptime but do not guarantee uninterrupted service. Market data depends on third-party exchange APIs which may occasionally be unavailable. We are not liable for losses resulting from data delays or outages.</p>

          <h2>8. Limitation of Liability</h2>
          <p>To the maximum extent permitted by law, Trading Tools shall not be liable for any trading losses, indirect, incidental, or consequential damages arising from use of the platform.</p>

          <h2>9. Changes to Terms</h2>
          <p>We may update these terms at any time. Continued use of the platform after changes constitutes acceptance of the new terms.</p>

          <h2>10. Contact</h2>
          <p>Questions about these terms: <a href="mailto:support@tradingtools.app" className="legal-link">support@tradingtools.app</a></p>
        </div>
      </div>
    </div>
  )
}
