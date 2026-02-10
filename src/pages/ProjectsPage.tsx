import { useState } from "react";
import AppLayout from "@/components/AppLayout";
import StatusBadge from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Plus, Download, Upload, Search, MoreHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";

const mockProjects = [
  { id: "PRJ-001", name: "Saadiyat HQ Tower", entity: "Aldar Properties", budget: "120.0M", pmcBudget: "8.5M", status: "Active", type: "Commercial" },
  { id: "PRJ-002", name: "Yas Mall Expansion", entity: "Aldar Properties", budget: "85.0M", pmcBudget: "5.2M", status: "Active", type: "Retail" },
  { id: "PRJ-003", name: "Al Raha Phase 3", entity: "Aldar Investment", budget: "200.0M", pmcBudget: "12.1M", status: "Active", type: "Residential" },
  { id: "PRJ-004", name: "Marina Tower", entity: "Aldar Properties", budget: "95.0M", pmcBudget: "6.8M", status: "Active", type: "Mixed Use" },
  { id: "PRJ-005", name: "Central Park District", entity: "Aldar Communities", budget: "150.0M", pmcBudget: "9.4M", status: "On Hold", type: "Infrastructure" },
  { id: "PRJ-006", name: "Mamsha Waterfront", entity: "Aldar Properties", budget: "75.0M", pmcBudget: "4.3M", status: "Completed", type: "Residential" },
];

export default function ProjectsPage() {
  const [search, setSearch] = useState("");
  const filtered = mockProjects.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AppLayout>
      <div className="animate-fade-in">
        <div className="page-header">
          <div>
            <h1 className="page-title">Projects</h1>
            <p className="page-subtitle">Manage project master data</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm"><Download size={14} className="mr-1.5" />Export</Button>
            <Button variant="outline" size="sm"><Upload size={14} className="mr-1.5" />Import</Button>
            <Button size="sm"><Plus size={14} className="mr-1.5" />Add Project</Button>
          </div>
        </div>

        <div className="bg-card rounded-md border">
          <div className="px-4 py-3 border-b flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search projects..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-8 text-sm" />
            </div>
            <span className="text-xs text-muted-foreground">{filtered.length} records</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="data-table-header text-left px-4 py-2.5">ID</th>
                  <th className="data-table-header text-left px-4 py-2.5">Project Name</th>
                  <th className="data-table-header text-left px-4 py-2.5">Entity</th>
                  <th className="data-table-header text-right px-4 py-2.5">Budget (AED)</th>
                  <th className="data-table-header text-right px-4 py-2.5">PMC Budget</th>
                  <th className="data-table-header text-center px-4 py-2.5">Type</th>
                  <th className="data-table-header text-center px-4 py-2.5">Status</th>
                  <th className="data-table-header w-10"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors cursor-pointer">
                    <td className="px-4 py-2.5 font-mono text-xs">{p.id}</td>
                    <td className="px-4 py-2.5 font-medium">{p.name}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{p.entity}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{p.budget}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{p.pmcBudget}</td>
                    <td className="px-4 py-2.5 text-center text-xs">{p.type}</td>
                    <td className="px-4 py-2.5 text-center"><StatusBadge status={p.status} /></td>
                    <td className="px-4 py-2.5 text-center">
                      <button className="p-1 rounded hover:bg-muted"><MoreHorizontal size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
