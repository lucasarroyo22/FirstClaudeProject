export default function NavTabs({ activeNav, onSwitch }) {
  return (
    <div className="nav-tabs">
      <button
        className={`nav-tab${activeNav === 'search' ? ' active' : ''}`}
        onClick={() => onSwitch('search')}
      >SEARCH</button>
      <button
        className={`nav-tab${activeNav === 'portfolio' ? ' active' : ''}`}
        onClick={() => onSwitch('portfolio')}
      >PORTFOLIO</button>
    </div>
  )
}
