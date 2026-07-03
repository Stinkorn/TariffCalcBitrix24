import { Navigate, Route, Routes } from 'react-router-dom';
import { DealCalculatorPage } from './pages/DealCalculatorPage';

export function App() {
  return (
    <Routes>
      <Route path="/deal-calculator" element={<DealCalculatorPage />} />
      <Route path="*" element={<Navigate to="/deal-calculator" replace />} />
    </Routes>
  );
}
