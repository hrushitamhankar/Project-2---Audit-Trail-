// src/pages/DashboardPage.jsx
import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { getShipmentById, getShipmentEvents, getShipmentStateAt } from '../services/shipmentService';
import ShipmentCard from '../components/ShipmentCard';
import Timeline from '../components/Timeline';
import StateScrubber from '../components/StateScrubber';
import HistoricalStateCard from '../components/HistoricalStateCard';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';

function DashboardPage() {
  const { shipmentId } = useParams();
  const navigate = useNavigate();
  const [shipment, setShipment] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [historicalState, setHistoricalState] = useState(null);
  const [scrubberLoading, setScrubberLoading] = useState(false);
  const [scrubberError, setScrubberError] = useState(null);
  const [isViewingHistorical, setIsViewingHistorical] = useState(false);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);
    setShipment(null);
    setEvents([]);
    setHistoricalState(null);
    setIsViewingHistorical(false);

    Promise.all([getShipmentById(shipmentId), getShipmentEvents(shipmentId)])
      .then(([shipmentData, eventsData]) => {
        if (isMounted) {
          setShipment(shipmentData);
          setEvents(eventsData || []);
        }
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

  const handleScrubberChange = (timestamp, isLive) => {
    setIsViewingHistorical(!isLive);

    if (isLive) {
      // Back to live state, no need to fetch historical
      setHistoricalState(null);
      setScrubberError(null);
      setScrubberLoading(false);
      return;
    }

    setScrubberLoading(true);
    setScrubberError(null);

    getShipmentStateAt(shipmentId, timestamp)
      .then((data) => {
        setHistoricalState(data);
      })
      .catch((err) => {
        setScrubberError(err.message);
      })
      .finally(() => {
        setScrubberLoading(false);
      });
  };

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

      {!loading && !error && shipment && (
        <>
          <ShipmentCard shipment={shipment} />
          <h3 className="section-heading">Event Timeline</h3>
          <Timeline events={events} isLoading={loading} />

          <h3 className="section-heading">Time Travel</h3>
          <StateScrubber
            shipmentEvents={events}
            onTimestampChange={handleScrubberChange}
            isLoading={scrubberLoading}
          />

          {isViewingHistorical && (
            <HistoricalStateCard
              state={historicalState}
              isLoading={scrubberLoading}
              error={scrubberError}
            />
          )}
        </>
      )}
    </div>
  );
}

export default DashboardPage;