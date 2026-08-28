// src/components/Timeline.jsx

function formatTimestamp(ts) {
  return new Date(ts).toLocaleString();
}

function formatPayload(payload) {
  if (!payload || Object.keys(payload).length === 0) return null;
  return Object.entries(payload)
    .map(([key, value]) => `${key}: ${value}`)
    .join(', ');
}

function Timeline({ events }) {
  if (!events || events.length === 0) {
    return <p className="timeline-empty">No events recorded for this shipment yet.</p>;
  }

  return (
    <div className="timeline">
      {events.map((event, index) => (
        <div key={index} className="timeline-item">
          <div className="timeline-marker"></div>
          <div className="timeline-content">
            <div className="timeline-header">
              <span className="timeline-event-type">{event.eventType}</span>
              <span className="timeline-timestamp">{formatTimestamp(event.timestamp)}</span>
            </div>
            {formatPayload(event.payload) && (
              <p className="timeline-payload">{formatPayload(event.payload)}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default Timeline;