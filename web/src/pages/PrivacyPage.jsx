import { Link } from 'react-router-dom'

export default function PrivacyPage() {
  return (
    <div className="legal-page">
      <nav className="landing-nav">
        <Link to="/" className="landing-logo">
          <span className="logo-bracket">[</span>TT<span className="logo-bracket">]</span>
          <span className="logo-label">TRADING TOOLS</span>
        </Link>
        <div className="landing-nav-actions">
          <Link to="/" className="nav-link">← Back</Link>
        </div>
      </nav>

      <div className="legal-content">
        <div className="legal-eyebrow">LEGAL</div>
        <h1 className="legal-title">Privacy Policy</h1>
        <p className="legal-date">Last updated: March 2026</p>

        <div className="legal-body">
          <h2>1. Information We Collect</h2>
          <p>When you create an account, we collect your email address and a hashed version of your password. We do not store your plain-text password.</p>
          <p>When you subscribe to Pro, payment is processed by <strong>Stripe</strong>. We do not store your credit card number or payment details — Stripe handles all payment information under their own privacy policy.</p>

          <h2>2. How We Use Your Information</h2>
          <ul>
            <li>To create and manage your account</li>
            <li>To process your subscription and send billing receipts</li>
            <li>To provide access to the Trading Tools platform</li>
            <li>To send important service updates (no marketing emails without consent)</li>
          </ul>

          <h2>3. Data We Do Not Collect</h2>
          <p>We do not collect personal trading data, portfolio positions, exchange API keys stored on our servers, or any behavioral tracking beyond basic session authentication.</p>

          <h2>4. Third-Party Services</h2>
          <ul>
            <li><strong>Stripe</strong> — payment processing. Stripe's privacy policy applies to all payment data.</li>
            <li><strong>Binance, OKX, Bybit, HyperLiquid</strong> — market data is fetched from public WebSocket APIs. No personal data is shared with exchanges.</li>
          </ul>

          <h2>5. Data Retention</h2>
          <p>Your account data is retained as long as your account is active. Upon account deletion request, we remove your email and subscription data within 30 days.</p>

          <h2>6. Security</h2>
          <p>All connections use TLS encryption. Passwords are stored using bcrypt hashing. API tokens are short-lived and rotated automatically.</p>

          <h2>7. Your Rights</h2>
          <p>You may request access to, correction of, or deletion of your personal data at any time by emailing <a href="mailto:support@tradingtools.app" className="legal-link">support@tradingtools.app</a>.</p>

          <h2>8. Contact</h2>
          <p>For privacy-related questions: <a href="mailto:support@tradingtools.app" className="legal-link">support@tradingtools.app</a></p>
        </div>
      </div>
    </div>
  )
}
