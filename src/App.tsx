import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import ConsultantsPage from "./pages/ConsultantsPage";
import ProjectsPage from "./pages/ProjectsPage";
import EmployeesPage from "./pages/EmployeesPage";
import DeploymentSchedulePage from "./pages/DeploymentSchedulePage";
import PeriodControlPage from "./pages/PeriodControlPage";
import PlaceholderPage from "./pages/PlaceholderPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/consultants" element={<ConsultantsPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/employees" element={<EmployeesPage />} />
          <Route path="/deployments" element={<DeploymentSchedulePage />} />
          <Route path="/period-control" element={<PeriodControlPage />} />
          <Route path="/framework-agreements" element={<PlaceholderPage title="Framework Agreements" subtitle="Manage framework agreements with consultants" />} />
          <Route path="/service-orders" element={<PlaceholderPage title="Service Orders" subtitle="Track service orders per consultant" />} />
          <Route path="/purchase-orders" element={<PlaceholderPage title="Purchase Orders" subtitle="Manage POs and PO line items" />} />
          <Route path="/invoices" element={<PlaceholderPage title="Invoices" subtitle="Track and validate invoices" />} />
          <Route path="/positions" element={<PlaceholderPage title="Positions" subtitle="Rate card with yearly rates linked to SOs" />} />
          <Route path="/reports" element={<PlaceholderPage title="Reports" subtitle="Baseline vs Actual vs Forecast and more" />} />
          <Route path="/ai-assistant" element={<PlaceholderPage title="AI Assistant" subtitle="Ask questions about your data" />} />
          <Route path="/admin" element={<PlaceholderPage title="Admin Panel" subtitle="Users, groups, permissions, audit logs" />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
