import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { BottomNav } from "./components/BottomNav";
import { Loading } from "./components/ui";
import { useUser } from "./hooks/auth";
import { useProducts } from "./hooks/data";
import { CountPage } from "./pages/Count";
import { DashboardPage } from "./pages/Dashboard";
import { HistoryPage } from "./pages/History";
import { LoginPage } from "./pages/Login";
import { OnboardingPage } from "./pages/Onboarding";
import { ProductsPage } from "./pages/Products";
import { PurchaseDetailPage } from "./pages/PurchaseDetail";
import { PurchaseNewPage } from "./pages/PurchaseNew";
import { SettingsPage } from "./pages/Settings";
import { ShoppingListPage } from "./pages/ShoppingList";
import { WeekSummaryPage } from "./pages/WeekSummary";

// Pantallas con su propia barra de acción: sin navegación inferior.
const FOCUS_ROUTES = [/^\/conteo/, /^\/compras\/nueva/, /^\/bienvenida/];

export function App() {
  const user = useUser();
  const location = useLocation();
  const products = useProducts();

  if (user === undefined) return <Loading label="Abriendo Dulce Control…" />;
  if (user === null) return <LoginPage />;

  const shoppingCount = (products.data ?? []).filter((p) => p.is_active && p.shopping_qty != null && !p.shopping_checked).length;
  const showNav = !FOCUS_ROUTES.some((r) => r.test(location.pathname));

  return (
    <>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/bienvenida" element={<OnboardingPage />} />
        <Route path="/conteo" element={<CountPage />} />
        <Route path="/semana/:id" element={<WeekSummaryPage />} />
        <Route path="/compras" element={<ShoppingListPage />} />
        <Route path="/compras/nueva" element={<PurchaseNewPage />} />
        <Route path="/compras/:id" element={<PurchaseDetailPage />} />
        <Route path="/historial" element={<HistoryPage />} />
        <Route path="/productos" element={<ProductsPage />} />
        <Route path="/ajustes" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {showNav && <BottomNav badge={shoppingCount} />}
    </>
  );
}
