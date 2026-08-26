// src/components/ShipmentCard.jsx

function formatTimestamp(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString();
}

function ShipmentCard({ shipment }) {
  return (
    <div className="shipment-card">
      <div className="shipment-card-header">
        <h3>{shipment.aggregateId}</h3>
        <span className="status-badge">{shipment.status}</span>
      </div>
      <div className="shipment-card-body">
        <div className="shipment-field">
          <span className="field-label">Location</span>
          <span className="field-value">{shipment.location}</span>
        </div>
        <div className="shipment-field">
          <span className="field-label">Temperature</span>
          <span className="field-value">{shipment.temperature}°C</span>
        </div>
        <div className="shipment-field">
          <span className="field-label">Last Updated</span>
          <span className="field-value">{formatTimestamp(shipment.lastUpdated)}</span>
        </div>
      </div>
    </div>
  );
}

export default ShipmentCard;