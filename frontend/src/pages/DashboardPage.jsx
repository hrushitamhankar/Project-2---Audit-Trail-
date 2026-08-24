// src/pages/DashboardPage.jsx
import { useParams } from 'react-router-dom';

function DashboardPage() {
  const { shipmentId } = useParams();

  return (
    <div className="dashboard-page">
      <h2>Shipment Dashboard</h2>
      <p>Viewing shipment: <strong>{shipmentId}</strong></p>
      {/* Search bar, timeline, slider, chart will go here in later days */}
    </div>
  );
}

export default DashboardPage;