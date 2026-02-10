import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
import PlaceholderPage from "./pages/PlaceholderPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/consultants" element={<ProtectedRoute><ConsultantsPage /></ProtectedRoute>} />
            <Route path="/projects" element={<ProtectedRoute><ProjectsPage /></ProtectedRoute>} />
            <Route path="/employees" element={<ProtectedRoute><EmployeesPage /></ProtectedRoute>} />
            <Route path="/framework-agreements" element={<ProtectedRoute><FrameworkAgreementsPage /></ProtectedRoute>} />
            <Route path="/service-orders" element={<ProtectedRoute><ServiceOrdersPage /></ProtectedRoute>} />
            <Route path="/purchase-orders" element={<ProtectedRoute><PurchaseOrdersPage /></ProtectedRoute>} />
            <Route path="/invoices" element={<ProtectedRoute><InvoicesPage /></ProtectedRoute>} />
            <Route path="/positions" element={<ProtectedRoute><PositionsPage /></ProtectedRoute>} />
            <Route path="/deployments" element={<ProtectedRoute><DeploymentSchedulePage /></ProtectedRoute>} />
            <Route path="/period-control" element={<ProtectedRoute><PeriodControlPage /></ProtectedRoute>} />
            <Route path="/admin" element={<ProtectedRoute><AdminPage /></ProtectedRoute>} />
            <Route path="/reports" element={<ProtectedRoute><PlaceholderPage title="Reports" subtitle="Baseline vs Actual vs Forecast and more" /></ProtectedRoute>} />
            <Route path="/ai-assistant" element={<ProtectedRoute><PlaceholderPage title="AI Assistant" subtitle="Ask questions about your data" /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
