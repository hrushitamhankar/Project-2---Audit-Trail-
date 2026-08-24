// src/components/Layout.jsx
import Header from './Header';

function Layout({ children }) {
  return (
    <div className="app-layout">
      <Header />
      <main className="app-main">{children}</main>
    </div>
  );
}

export default Layout;