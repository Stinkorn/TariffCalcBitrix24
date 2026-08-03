import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { DictionariesProvider } from './context/DictionariesContext';
import { DealCalculatorPage } from './pages/DealCalculatorPage';
import { HistoryPage } from './pages/HistoryPage';
import { TariffsPage } from './pages/TariffsPage';

export function App() {
  return (
    <DictionariesProvider>
      <nav className="app-nav" aria-label="TariffCalc">
        <NavLink to="/calculator">Калькулятор</NavLink>
        <NavLink to="/history">История</NavLink>
        <NavLink to="/tariffs">Тарифы</NavLink>
      </nav>
      <Routes>
        <Route path="/calculator" element={<DealCalculatorPage />} />
        <Route path="/deal-calculator" element={<DealCalculatorPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/tariffs" element={<TariffsPage />} />
        <Route path="*" element={<Navigate to="/calculator" replace />} />
      </Routes>
    </DictionariesProvider>
  );
}
