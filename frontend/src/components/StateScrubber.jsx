// src/components/StateScrubber.jsx
import { useState } from 'react';

function formatDateTime(date) {
  if (!date) return '—';
  return date.toLocaleString();
}

function StateScrubber({ shipmentEvents, onTimestampChange, isLoading = false }) {
  if (!shipmentEvents || shipmentEvents.length === 0) {
    return null;
  }

  const timestamps = shipmentEvents.map((e) => new Date(e.timestamp).getTime());
  const minTime = Math.min(...timestamps);
  const maxTime = Math.max(...timestamps);

  const [selectedTime, setSelectedTime] = useState(maxTime);
  const selectedDate = new Date(selectedTime);

  const handleSliderChange = (e) => {
    const newTime = parseInt(e.target.value, 10);
    setSelectedTime(newTime);
    const isLive = newTime === maxTime;
    onTimestampChange(new Date(newTime).toISOString(), isLive);
  };

  const isViewingLive = selectedTime === maxTime;

  return (
    <div className="state-scrubber">
      <h4>Historical State Viewer</h4>

      <div className="scrubber-status">
        {isViewingLive ? (
          <span className="status-live"> Live (Current State)</span>
        ) : (
          <span className="status-historical">📅 Viewing: {formatDateTime(selectedDate)}</span>
        )}
      </div>

      <input
        type="range"
        min={minTime}
        max={maxTime}
        value={selectedTime}
        onChange={handleSliderChange}
        disabled={isLoading}
        className="scrubber-slider"
      />

      <div className="scrubber-labels">
        <span className="label-start">{formatDateTime(new Date(minTime))}</span>
        <span className="label-end">{formatDateTime(new Date(maxTime))}</span>
      </div>
    </div>
  );
}

export default StateScrubber;