import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useLang } from '../context/LangContext'
import '../pages/AuthPages.css'

export default function AuthLayout({ children, register = false }) {
  const { lang, toggleLang } = useLang()
  const tr = lang === 'tr'
  return (
    <div className="ct-auth">
      <header className="ct-auth-nav">
        <Link to="/" className="ct-auth-logo">CryptoTerminal</Link>
        <div>
          <button onClick={toggleLang} aria-label={tr ? 'Switch to English' : 'Türkçeye geç'}>{tr ? 'EN' : 'TR'}</button>
          <Link to={register ? '/login' : '/register'}>{register ? tr ? 'Giriş yap' : 'Sign in' : tr ? 'Hesap oluştur' : 'Create account'}</Link>
        </div>
      </header>
      <main className="ct-auth-main">
        <aside className="ct-auth-brand">
          <div className="ct-auth-brand-copy">
            <p>CryptoTerminal</p>
            <h2>{tr ? <>Haberdar ol. <br />Kontrol sende.</> : <>Stay informed. <br />Stay in control.</>}</h2>
            <span>{tr ? 'Haberler, piyasa analizi ve işlemler. Hepsi bir arada.' : 'News, market context and trading. All in one place.'}</span>
          </div>
          <figure className="ct-auth-monitor"><img src="/images/landing-concept.png" alt={tr ? 'CryptoTerminal ürün önizlemesi' : 'CryptoTerminal product preview'} /></figure>
          <Link className="ct-auth-back" to="/"><ArrowLeft size={16} />{tr ? 'Ana sayfaya dön' : 'Back to home'}</Link>
        </aside>
        <section className="ct-auth-content">
          {children}
          <footer className="ct-auth-legal"><Link to="/privacy">{tr ? 'Gizlilik' : 'Privacy'}</Link><Link to="/terms">{tr ? 'Koşullar' : 'Terms'}</Link></footer>
        </section>
      </main>
    </div>
  )
}
