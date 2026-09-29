// src/components/Layout.jsx
import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import Header from './Header';

function Layout({ children }) {
  const [theme, setTheme] = useState(() => localStorage.getItem('audit-trail-theme') || 'dark');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('audit-trail-theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme((current) => current === 'dark' ? 'light' : 'dark');

  return (
    <div className={`app-layout ${sidebarOpen ? 'sidebar-is-open' : ''}`}>
      <Header
        theme={theme}
        onThemeToggle={toggleTheme}
        onMenuToggle={() => setSidebarOpen((open) => !open)}
      />
      <aside className="app-sidebar">
        <div className="sidebar-label">Workspace</div>
        <nav className="sidebar-nav" aria-label="Primary navigation">
          <NavLink to="/" end onClick={() => setSidebarOpen(false)}>
            <span className="nav-icon">⌂</span>
            Overview
          </NavLink>
          <NavLink to="/shipment/SHIP001" onClick={() => setSidebarOpen(false)}>
            <span className="nav-icon">▣</span>
            Shipments
          </NavLink>
        </nav>
        <div className="sidebar-footer">
          <span className="connection-dot"></span>
          <div><strong>Systems online</strong><small>All services operational</small></div>
        </div>
      </aside>
      <main className="app-main">{children}</main>
      {sidebarOpen && <button className="sidebar-backdrop" aria-label="Close menu" onClick={() => setSidebarOpen(false)} />}
    </div>
  );
}

export default Layout;