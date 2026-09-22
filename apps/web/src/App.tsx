import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { DictionariesProvider } from './context/DictionariesContext';
import { DealCalculatorPage } from './pages/DealCalculatorPage';
import { HistoryPage } from './pages/HistoryPage';
import { TariffsPage } from './pages/TariffsPage';
import { useAuth } from './context/AuthContext';

export function App() {
  const { status, user, retryAuthentication } = useAuth();

  if (status === 'loading') {
    return <main className="page"><section className="shell"><p>Проверка доступа…</p></section></main>;
  }

  if (status === 'outside-bitrix') {
    return <main className="page"><section className="shell"><p>Калькулятор доступен только из Bitrix24.</p></section></main>;
  }

  if (status === 'forbidden') {
    return <main className="page"><section className="shell"><p>У вас нет доступа к тарифному калькулятору.</p></section></main>;
  }

  if (status === 'error') {
    return <main className="page"><section className="shell"><p>Не удалось подтвердить доступ. Обновите страницу или откройте приложение из Bitrix24.</p><button onClick={() => void retryAuthentication()}>Повторить проверку</button></section></main>;
  }

  return (
    <DictionariesProvider>
      <nav className="app-nav" aria-label="TariffCalc">
        <NavLink to="/calculator">Калькулятор</NavLink>
        <NavLink to="/history">История</NavLink>
        <NavLink to="/tariffs">Тарифы</NavLink>
        <span className="muted">{user?.role}</span>
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
