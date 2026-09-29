// src/App.jsx
import { BrowserRouter, Routes, Route, useParams } from 'react-router-dom';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';
import DashboardPage from './pages/DashboardPage';
import './App.css';

function KeyedDashboardPage() {
  const { shipmentId } = useParams();
  return <DashboardPage key={shipmentId} />;
}

function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/shipment/:shipmentId" element={<KeyedDashboardPage />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;