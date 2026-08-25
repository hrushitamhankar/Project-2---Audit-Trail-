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
      <h1>Audit Trail</h1>
      <p>Search for a shipment to view its event history and current state.</p>
      <SearchBar onSearch={handleSearch} />
      <p className="hint-text">Try: SHIP001 or SHIP002 (mock data)</p>
    </div>
  );
}

export default HomePage;