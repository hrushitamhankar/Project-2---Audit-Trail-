// src/components/Timeline.jsx

function formatTimestamp(ts) {
  return new Date(ts).toLocaleString();
}

function formatPayload(payload) {
  if (!payload || Object.keys(payload).length === 0) return null;
  return Object.entries(payload)
    .map(([key, value]) => `${key}: ${value}`)
    .join(' · ');
}

// Maps event types to a badge style + icon.
// Add new event types here as the backend introduces them.
const EVENT_TYPE_META = {
  CONTAINER_CREATED: { icon: '', className: 'badge-created' },
  LOADED_ON_SHIP: { icon: '', className: 'badge-transit' },
  TEMPERATURE_SPIKE: { icon: '', className: 'badge-alert' },
  ARRIVED_AT_PORT: { icon: '', className: 'badge-arrived' },
};

function getEventMeta(eventType) {
  return EVENT_TYPE_META[eventType] || { icon: '•', className: 'badge-default' };
}

function Timeline({ events }) {
  if (!events || events.length === 0) {
    return <p className="timeline-empty">No events recorded for this shipment yet.</p>;
  }

  return (
    <div className="timeline">
      {events.map((event, index) => {
        const meta = getEventMeta(event.eventType);
        return (
          <div key={index} className="timeline-item">
            <div className={`timeline-marker ${meta.className}`}></div>
            <div className="timeline-content">
              <div className="timeline-header">
                <span className={`event-badge ${meta.className}`}>
                  <span className="event-icon">{meta.icon}</span>
                  {event.eventType.replace(/_/g, ' ')}
                </span>
                <span className="timeline-timestamp">{formatTimestamp(event.timestamp)}</span>
              </div>
              {formatPayload(event.payload) && (
                <p className="timeline-payload">{formatPayload(event.payload)}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default Timeline;