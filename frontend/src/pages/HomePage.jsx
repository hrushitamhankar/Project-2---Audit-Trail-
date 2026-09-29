// src/pages/HomePage.jsx
import { useNavigate } from 'react-router-dom';
import SearchBar from '../components/SearchBar';

function HomePage() {
  const navigate = useNavigate();

  const handleSearch = (shipmentId) => {
    navigate(`/shipment/${shipmentId}`);
  };

  return (
    <div className="home-page">
      <div className="page-eyebrow"><span className="eyebrow-line"></span> Operations console</div>
      <div className="home-hero">
        <div>
          <h1>Shipment intelligence, <em>in one view.</em></h1>
          <p>Trace every movement, inspect the current state, and travel back through the event history of your supply chain.</p>
        </div>
        <div className="hero-stat"><strong>01</strong><span>Active workspace</span></div>
      </div>
      <section className="search-panel">
        <div><span className="panel-kicker">Find a shipment</span><h2>Open an audit trail</h2></div>
        <SearchBar onSearch={handleSearch} />
        <p className="hint-text">Try SHIP001 or SHIP002 to explore the sample workspace</p>
      </section>
      <div className="home-metrics">
        <div><strong>100%</strong><span>Event traceability</span></div>
        <div><strong>24/7</strong><span>Historical access</span></div>
        <div><strong>Live</strong><span>Projection status</span></div>
      </div>
    </div>
  );
}

export default HomePage;