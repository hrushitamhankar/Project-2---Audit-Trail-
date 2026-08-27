// src/components/LoadingSpinner.jsx

function LoadingSpinner({ label = 'Loading...' }) {
  return (
    <div className="loading-spinner">
      <div className="spinner"></div>
      <span>{label}</span>
    </div>
  );
}

export default LoadingSpinner;