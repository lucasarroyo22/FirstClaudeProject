import { useState, useEffect } from 'react'
import Header from './components/Header'
import NavTabs from './components/NavTabs'
import AuthModal from './components/AuthModal'
import SearchView from './components/search/SearchView'
import PortfolioView from './components/portfolio/PortfolioView'

export default function App() {
  const [currentUser, setCurrentUser] = useState(null)
  const [activeNav, setActiveNav]     = useState('search')
  const [authOpen, setAuthOpen]       = useState(false)

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(me => {
      if (me.loggedIn) setCurrentUser(me.username)
    }).catch(() => {})
  }, [])

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    setCurrentUser(null)
  }

  function handleAuthSuccess(username) {
    setCurrentUser(username)
    setAuthOpen(false)
  }

  return (
    <div className="wrap">
      <Header
        currentUser={currentUser}
        onOpenAuth={() => setAuthOpen(true)}
        onLogout={handleLogout}
      />
      <NavTabs activeNav={activeNav} onSwitch={setActiveNav} />

      {activeNav === 'search' && <SearchView />}
      {activeNav === 'portfolio' && (
        <PortfolioView currentUser={currentUser} onOpenAuth={() => setAuthOpen(true)} />
      )}

      <AuthModal
        isOpen={authOpen}
        onClose={() => setAuthOpen(false)}
        onSuccess={handleAuthSuccess}
      />
    </div>
  )
}
