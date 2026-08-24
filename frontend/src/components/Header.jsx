// src/components/Header.jsx
import { Link } from 'react-router-dom';

function Header() {
  return (
    <header className="app-header">
      <Link to="/" className="app-logo">
        Audit Trail
      </Link>
      <nav>
        <Link to="/">Home</Link>
      </nav>
    </header>
  );
}

export default Header;