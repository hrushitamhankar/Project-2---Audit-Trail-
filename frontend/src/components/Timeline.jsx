function formatTimestamp(ts) {
  return new Date(ts).toLocaleString();
}

function toSentenceCase(eventType) {
  const words = eventType.toLowerCase().split('_');
  return words[0].charAt(0).toUpperCase() + words[0].slice(1) + ' ' + words.slice(1).join(' ');
}

const EVENT_TYPE_META = {
  CONTAINER_CREATED: 'swatch-created',
  LOADED_ON_SHIP: 'swatch-transit',
  TEMPERATURE_SPIKE: 'swatch-alert',
  ARRIVED_AT_PORT: 'swatch-arrived',
};

function getSwatchClass(eventType) {
  return EVENT_TYPE_META[eventType] || 'swatch-default';
}

function Timeline({ events, isLoading = false }) {
  if (isLoading) {
    return <p className="timeline-loading">Loading events…</p>;
  }

  if (!events || events.length === 0) {
    return (
      <div className="timeline-empty">
        <p>No events recorded for this shipment yet.</p>
      </div>
    );
  }

  return (
    <div className="timeline-container">
      <p className="timeline-count">{events.length} recorded event{events.length !== 1 ? 's' : ''}</p>
      <div className="timeline">
        {events.map((event, index) => {
          const swatchClass = getSwatchClass(event.eventType);
          const payloadEntries = event.payload && Object.keys(event.payload).length > 0
            ? Object.entries(event.payload)
            : [];
          return (
            <div key={index} className="timeline-item">
              <div className={`timeline-marker ${swatchClass}`}></div>
              <div className="timeline-content">
                <div className="timeline-header">
                  <span className="event-badge">
                    <span className={`event-swatch ${swatchClass}`}></span>
                    {toSentenceCase(event.eventType)}
                  </span>
                  <span className="timeline-timestamp">{formatTimestamp(event.timestamp)}</span>
                </div>
                {payloadEntries.length > 0 && (
                  <div className="timeline-payload">
                    {payloadEntries.map(([key, value]) => (
                      <div key={key} className="timeline-payload-row">
                        <span>{key}</span>{String(value)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default Timeline;