// src/components/StateScrubber.jsx
import { useState, useRef, useEffect } from 'react';

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
  const debounceTimer = useRef(null);
  const selectedDate = new Date(selectedTime);

  // Clean up any pending debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  const handleSliderChange = (e) => {
    const newTime = parseInt(e.target.value, 10);
    setSelectedTime(newTime); // update UI immediately - feels responsive

    // Debounce the actual API-triggering callback
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      const isLive = newTime === maxTime;
      onTimestampChange(new Date(newTime).toISOString(), isLive);
    }, 400); // wait 400ms after user stops moving the slider
  };

  const isViewingLive = selectedTime === maxTime;

  return (
    <div className={`state-scrubber ${isViewingLive ? 'mode-live' : 'mode-historical'}`}>
      <div className="scrubber-title-row">
        <h4>Historical State Viewer</h4>
        {isLoading && <span className="scrubber-inline-loader">syncing...</span>}
      </div>

      <div className="scrubber-status">
        {isViewingLive ? (
          <span className="status-live">
            <span className="status-dot dot-live"></span>
            Live (Current State)
          </span>
        ) : (
          <span className="status-historical">
            <span className="status-dot dot-historical"></span>
            Viewing: {formatDateTime(selectedDate)}
          </span>
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

      {!isViewingLive && (
        <button
          className="scrubber-return-live"
          onClick={() => {
            if (debounceTimer.current) clearTimeout(debounceTimer.current);
            setSelectedTime(maxTime);
            onTimestampChange(new Date(maxTime).toISOString(), true);
          }}
          disabled={isLoading}
        >
          ← Return to Live
        </button>
      )}
    </div>
  );
}

export default StateScrubber;