import { useState, useEffect } from 'react'

export default function AuthModal({ isOpen, onClose, onSuccess }) {
  const [mode, setMode]         = useState('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  useEffect(() => {
    if (!isOpen) { setUsername(''); setPassword(''); setError(''); setMode('login') }
  }, [isOpen])

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleSubmit() {
    setError('')
    setLoading(true)
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      }).then(r => r.json())
      if (!res.ok) { setError(res.message); return }
      onSuccess(res.username)
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="auth-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="auth-modal">
        <div className="auth-tabs">
          <button className={`auth-tab${mode === 'login' ? ' active' : ''}`} onClick={() => { setMode('login'); setError('') }}>LOGIN</button>
          <button className={`auth-tab${mode === 'register' ? ' active' : ''}`} onClick={() => { setMode('register'); setError('') }}>REGISTER</button>
        </div>
        {error && <div className="auth-error">{error}</div>}
        <input
          type="text"
          placeholder="Username"
          autoComplete="off"
          spellCheck={false}
          value={username}
          onChange={e => setUsername(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          autoFocus
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
        />
        <button onClick={handleSubmit} disabled={loading}>
          {loading ? '…' : mode === 'login' ? 'LOGIN' : 'CREATE ACCOUNT'}
        </button>
      </div>
    </div>
  )
}
