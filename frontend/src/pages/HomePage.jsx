// src/pages/HomePage.jsx
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';

function HomePage() {
  const [shipmentId, setShipmentId] = useState('');
  const navigate = useNavigate();

  const handleSearch = (e) => {
    e.preventDefault();
    if (shipmentId.trim()) {
      navigate(`/shipment/${shipmentId.trim()}`);
    }
  };

  return (
    <div className="home-page">
      <h1>Audit Trail</h1>
      <p>Search for a shipment to view its event history and current state.</p>
      <form onSubmit={handleSearch} className="search-form">
        <input
          type="text"
          placeholder="Enter shipment ID..."
          value={shipmentId}
          onChange={(e) => setShipmentId(e.target.value)}
        />
        <button type="submit">Search</button>
      </form>
    </div>
  );
}

export default HomePage;