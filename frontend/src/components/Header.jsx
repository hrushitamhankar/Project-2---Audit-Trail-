// src/components/Header.jsx
import { Link, useLocation } from 'react-router-dom';

function Header({ theme, onThemeToggle, onMenuToggle }) {
  const location = useLocation();
  const isDashboard = location.pathname.startsWith('/shipment/');

  return (
    <header className="app-header">
      <div className="header-left">
        <button className="menu-toggle" onClick={onMenuToggle} aria-label="Toggle navigation menu">☰</button>
        <Link to="/" className="app-logo"><span className="logo-mark">AT</span><span>Audit Trail</span></Link>
      </div>
      <div className="header-context">
        <span className="breadcrumb-muted">Workspace</span>
        <span className="breadcrumb-separator">/</span>
        <span>{isDashboard ? 'Shipment detail' : 'Overview'}</span>
      </div>
      <div className="header-actions">
        <span className="header-status"><span className="connection-dot"></span>Live system</span>
        <button className="theme-toggle" onClick={onThemeToggle} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
          <span>{theme === 'dark' ? '☼' : '☾'}</span>
          {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </button>
        <div className="avatar" aria-label="Account">AT</div>
      </div>
    </header>
  );
}

export default Header;