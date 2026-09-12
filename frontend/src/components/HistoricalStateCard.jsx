// src/components/HistoricalStateCard.jsx

function formatTimestamp(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString();
}

function HistoricalStateCard({ state, isLoading, error }) {
  if (isLoading) {
    return (
      <div className="historical-card historical-loading">
        <p>Reconstructing state at this point in time...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="historical-card historical-error">
        <p>Couldn't load historical state: {error}</p>
      </div>
    );
  }

  if (!state) return null;

  if (state.eventsApplied === 0) {
    return (
      <div className="historical-card historical-note">
        <h4>State as of {formatTimestamp(state.asOf)}</h4>
        <p>{state.note || 'No events had occurred yet at this point in time.'}</p>
      </div>
    );
  }

  return (
    <div className="historical-card">
      <h4>State as of {formatTimestamp(state.asOf)}</h4>
      <div className="historical-field">
        <span className="field-label">Events applied</span>
        <span className="field-value">{state.eventsApplied}</span>
      </div>
      {state.lastEvent && (
        <div className="historical-field">
          <span className="field-label">Last event at this point</span>
          <span className="field-value">
            {state.lastEvent.eventType.replace(/_/g, ' ')} ({formatTimestamp(state.lastEvent.timestamp)})
          </span>
        </div>
      )}
    </div>
  );
}

export default HistoricalStateCard;