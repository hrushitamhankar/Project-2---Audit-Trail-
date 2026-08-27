// src/pages/DashboardPage.jsx
import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { getShipmentById } from '../services/shipmentService';
import ShipmentCard from '../components/ShipmentCard';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';

function DashboardPage() {
  const { shipmentId } = useParams();
  const navigate = useNavigate();
  const [shipment, setShipment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);
    setShipment(null);

    getShipmentById(shipmentId)
      .then((data) => {
        if (isMounted) setShipment(data);
      })
      .catch((err) => {
        if (isMounted) setError(err.message);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [shipmentId]);

  return (
    <div className="dashboard-page">
      <h2>Shipment Dashboard</h2>

      {loading && <LoadingSpinner label={`Fetching shipment ${shipmentId}...`} />}

      {!loading && error && (
        <EmptyState
          message={`Couldn't find shipment "${shipmentId}". Check the ID and try again.`}
          actionLabel="Back to Search"
          onAction={() => navigate('/')}
        />
      )}

      {!loading && !error && shipment && <ShipmentCard shipment={shipment} />}

      {/* Timeline, slider, chart will be added in Week 2/3/4 */}
    </div>
  );
}

export default DashboardPage;