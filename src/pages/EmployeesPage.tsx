import { useState } from "react";
import AppLayout from "@/components/AppLayout";
import StatusBadge from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Plus, Download, Upload, Search, MoreHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";

const mockEmployees = [
  { id: "E001", name: "Ahmed Al Mansouri", consultant: "WSP", position: "Senior Project Manager", experience: 15, status: "Active" },
  { id: "E002", name: "Sarah Johnson", consultant: "WSP", position: "Cost Engineer", experience: 8, status: "Active" },
  { id: "E003", name: "Mohammed Khan", consultant: "AECOM", position: "Planning Engineer", experience: 12, status: "Active" },
  { id: "E004", name: "Lisa Chen", consultant: "AECOM", position: "QA/QC Manager", experience: 10, status: "Active" },
  { id: "E005", name: "James Wilson", consultant: "Mace", position: "Project Director", experience: 20, status: "Active" },
  { id: "E006", name: "Fatima Al Hashemi", consultant: "Mace", position: "Document Controller", experience: 5, status: "Inactive" },
  { id: "E007", name: "David Martinez", consultant: "Faithful+Gould", position: "Senior Cost Manager", experience: 14, status: "Active" },
  { id: "E008", name: "Aisha Khalid", consultant: "Faithful+Gould", position: "Contracts Manager", experience: 9, status: "Active" },
];

export default function EmployeesPage() {
  const [search, setSearch] = useState("");
  const filtered = mockEmployees.filter((e) =>
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    e.consultant.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AppLayout>
      <div className="animate-fade-in">
        <div className="page-header">
          <div>
            <h1 className="page-title">Employees</h1>
            <p className="page-subtitle">Manage PMC consultant employees</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm"><Download size={14} className="mr-1.5" />Export</Button>
            <Button variant="outline" size="sm"><Upload size={14} className="mr-1.5" />Import</Button>
            <Button size="sm"><Plus size={14} className="mr-1.5" />Add Employee</Button>
          </div>
        </div>

        <div className="bg-card rounded-md border">
          <div className="px-4 py-3 border-b flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search employees..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-8 text-sm" />
            </div>
            <span className="text-xs text-muted-foreground">{filtered.length} records</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="data-table-header text-left px-4 py-2.5">ID</th>
                  <th className="data-table-header text-left px-4 py-2.5">Name</th>
                  <th className="data-table-header text-left px-4 py-2.5">Consultant</th>
                  <th className="data-table-header text-left px-4 py-2.5">Position</th>
                  <th className="data-table-header text-center px-4 py-2.5">Experience (Yrs)</th>
                  <th className="data-table-header text-center px-4 py-2.5">Status</th>
                  <th className="data-table-header w-10"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => (
                  <tr key={e.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors cursor-pointer">
                    <td className="px-4 py-2.5 font-mono text-xs">{e.id}</td>
                    <td className="px-4 py-2.5 font-medium">{e.name}</td>
                    <td className="px-4 py-2.5">{e.consultant}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{e.position}</td>
                    <td className="px-4 py-2.5 text-center font-mono">{e.experience}</td>
                    <td className="px-4 py-2.5 text-center"><StatusBadge status={e.status} /></td>
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
