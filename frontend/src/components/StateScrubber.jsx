import { useEffect, useState } from 'react';

function formatTimestamp(timestamp) {
  return new Date(timestamp).toLocaleString();
}

function getStateAt(events, index, currentShipment) {
  const appliedEvents = events.slice(0, index + 1);
  const latestEvent = appliedEvents[appliedEvents.length - 1];
  const temperatureEvent = [...appliedEvents]
    .reverse()
    .find((event) => typeof event.payload?.temperature === 'number');
  const locationEvent = [...appliedEvents]
    .reverse()
    .find((event) => event.payload?.location || event.payload?.port);

  const statusByEvent = {
    CONTAINER_CREATED: 'CREATED',
    LOADED_ON_SHIP: 'IN_TRANSIT',
    TEMPERATURE_SPIKE: 'ALERT',
    ARRIVED_AT_PORT: 'DELIVERED',
  };

  return {
    ...currentShipment,
    status: statusByEvent[latestEvent?.eventType] || currentShipment.status,
    location: locationEvent?.payload?.location || locationEvent?.payload?.port || '—',
    temperature: temperatureEvent?.payload?.temperature ?? '—',
    lastUpdated: latestEvent?.timestamp,
  };
}

function StateScrubber({ events, shipment, onStateChange }) {
  const [selectedIndex, setSelectedIndex] = useState(events.length - 1);
  const selectedEvent = events[selectedIndex];

  useEffect(() => {
    onStateChange(getStateAt(events, selectedIndex, shipment));
  }, [events, selectedIndex, shipment, onStateChange]);

  if (!events.length) return null;

  function handleChange(event) {
    const nextIndex = Number(event.target.value);
    setSelectedIndex(nextIndex);
    onStateChange(getStateAt(events, nextIndex, shipment));
  }

  return (
    <section className="state-scrubber" aria-labelledby="state-scrubber-heading">
      <div className="state-scrubber-heading">
        <div>
          <p className="eyebrow">Historical view</p>
          <h3 id="state-scrubber-heading">State Scrubber</h3>
        </div>
        <span className="state-scrubber-position">
          {selectedIndex + 1} / {events.length}
        </span>
      </div>
      <input
        aria-label="Select a shipment state in the event history"
        className="state-scrubber-input"
        type="range"
        min="0"
        max={events.length - 1}
        value={selectedIndex}
        onChange={handleChange}
      />
      <div className="state-scrubber-labels">
        <span>{formatTimestamp(events[0].timestamp)}</span>
        <strong>{selectedEvent.eventType.replace(/_/g, ' ')}</strong>
        <span>{formatTimestamp(events[events.length - 1].timestamp)}</span>
      </div>
    </section>
  );
}

export default StateScrubber;