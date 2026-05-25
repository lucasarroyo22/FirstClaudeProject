export default function Header({ currentUser, onOpenAuth, onLogout }) {
  return (
    <header>
      <div className="header-top">
        <div>
          <div className="header-accent"></div>
          <h1>STOCK ANALYZER</h1>
          <p className="sub">Real-Time Price Swings &bull; Powered by Yahoo Finance</p>
        </div>
        <div className="auth-controls">
          {currentUser ? (
            <>
              <span className="user-greeting">WELCOME, {currentUser.toUpperCase()}</span>
              <button onClick={onLogout}>LOGOUT</button>
            </>
          ) : (
            <button onClick={onOpenAuth}>LOGIN / REGISTER</button>
          )}
        </div>
      </div>
    </header>
  )
}
