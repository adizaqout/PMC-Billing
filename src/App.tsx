import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import LoginPage from "./pages/LoginPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import Dashboard from "./pages/Dashboard";
import ConsultantsPage from "./pages/ConsultantsPage";
import ProjectsPage from "./pages/ProjectsPage";
import EmployeesPage from "./pages/EmployeesPage";
import FrameworkAgreementsPage from "./pages/FrameworkAgreementsPage";
import ServiceOrdersPage from "./pages/ServiceOrdersPage";
import PurchaseOrdersPage from "./pages/PurchaseOrdersPage";
import InvoicesPage from "./pages/InvoicesPage";
import PositionsPage from "./pages/PositionsPage";
import DeploymentSchedulePage from "./pages/DeploymentSchedulePage";
import PeriodControlPage from "./pages/PeriodControlPage";
import AdminPage from "./pages/AdminPage";
import ReportsPage from "./pages/ReportsPage";
import AIAssistantPage from "./pages/AIAssistantPage";
import SupervisionConsultantsPage from "./pages/supervision/SupervisionConsultantsPage";
import SupervisionPositionsPage from "./pages/supervision/SupervisionPositionsPage";
import SupervisionEmployeesPage from "./pages/supervision/SupervisionEmployeesPage";
import PmcConsultantsPage from "./pages/pmc/PmcConsultantsPage";
import PmcPositionsPage from "./pages/pmc/PmcPositionsPage";
import PmcEmployeesPage from "./pages/pmc/PmcEmployeesPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnMount: true,
      refetchOnWindowFocus: false,
    },
  },
});

const CacheMigration = () => {
  const queryClient = useQueryClient();
  useEffect(() => {
    const CACHE_VERSION = 'v3';
    if (localStorage.getItem('app-cache-version') !== CACHE_VERSION) {
      console.log('Cache migration v3 - clearing all stale data');
      queryClient.clear();
      localStorage.removeItem('REACT_QUERY_OFFLINE_CACHE');
      localStorage.setItem('app-cache-version', CACHE_VERSION);
    }
  }, [queryClient]);
  return null;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <CacheMigration />
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/consultants" element={<ProtectedRoute module="consultants"><ConsultantsPage /></ProtectedRoute>} />
            <Route path="/projects" element={<ProtectedRoute module="projects"><ProjectsPage /></ProtectedRoute>} />
            <Route path="/employees" element={<ProtectedRoute module="employees"><EmployeesPage /></ProtectedRoute>} />
            <Route path="/supervision/consultants" element={<ProtectedRoute module="consultants"><SupervisionConsultantsPage /></ProtectedRoute>} />
            <Route path="/supervision/positions" element={<ProtectedRoute module="positions"><SupervisionPositionsPage /></ProtectedRoute>} />
            <Route path="/supervision/employees" element={<ProtectedRoute module="employees"><SupervisionEmployeesPage /></ProtectedRoute>} />
            <Route path="/pmc/consultants" element={<ProtectedRoute module="consultants"><PmcConsultantsPage /></ProtectedRoute>} />
            <Route path="/pmc/positions" element={<ProtectedRoute module="positions"><PmcPositionsPage /></ProtectedRoute>} />
            <Route path="/pmc/employees" element={<ProtectedRoute module="employees"><PmcEmployeesPage /></ProtectedRoute>} />
            <Route path="/framework-agreements" element={<ProtectedRoute module="framework_agreements"><FrameworkAgreementsPage /></ProtectedRoute>} />
            <Route path="/service-orders" element={<ProtectedRoute module="service_orders"><ServiceOrdersPage /></ProtectedRoute>} />
            <Route path="/purchase-orders" element={<ProtectedRoute module="purchase_orders"><PurchaseOrdersPage /></ProtectedRoute>} />
            <Route path="/invoices" element={<ProtectedRoute module="invoices"><InvoicesPage /></ProtectedRoute>} />
            <Route path="/positions" element={<ProtectedRoute module="positions"><PositionsPage /></ProtectedRoute>} />
            <Route path="/deployments" element={<ProtectedRoute module="deployments"><DeploymentSchedulePage /></ProtectedRoute>} />
            <Route path="/period-control" element={<ProtectedRoute module="period_control"><PeriodControlPage /></ProtectedRoute>} />
            <Route path="/admin" element={<ProtectedRoute adminOnly><AdminPage /></ProtectedRoute>} />
            <Route path="/reports" element={<ProtectedRoute module="reports"><ReportsPage /></ProtectedRoute>} />
            <Route path="/ai-assistant" element={<ProtectedRoute module="ai_assistant"><AIAssistantPage /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
