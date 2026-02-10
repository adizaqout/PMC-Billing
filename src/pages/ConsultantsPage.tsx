import { useState } from "react";
import AppLayout from "@/components/AppLayout";
import StatusBadge from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Plus, Download, Upload, Search, MoreHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";

const mockConsultants = [
  { id: "C001", name: "WSP", crNo: "CR-2018-4521", taxNo: "TAX-100234", status: "Active", agreements: 2, employees: 45 },
  { id: "C002", name: "AECOM", crNo: "CR-2017-8812", taxNo: "TAX-100567", status: "Active", agreements: 3, employees: 62 },
  { id: "C003", name: "Mace", crNo: "CR-2019-1123", taxNo: "TAX-100891", status: "Active", agreements: 1, employees: 28 },
  { id: "C004", name: "Faithful+Gould", crNo: "CR-2016-3345", taxNo: "TAX-100112", status: "Active", agreements: 2, employees: 35 },
  { id: "C005", name: "Hill International", crNo: "CR-2020-5567", taxNo: "TAX-100445", status: "Inactive", agreements: 1, employees: 12 },
];

export default function ConsultantsPage() {
  const [search, setSearch] = useState("");
  const filtered = mockConsultants.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AppLayout>
      <div className="animate-fade-in">
        <div className="page-header">
          <div>
            <h1 className="page-title">Consultants</h1>
            <p className="page-subtitle">Manage PMC consultant companies</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm"><Download size={14} className="mr-1.5" />Export</Button>
            <Button variant="outline" size="sm"><Upload size={14} className="mr-1.5" />Import</Button>
            <Button size="sm"><Plus size={14} className="mr-1.5" />Add Consultant</Button>
          </div>
        </div>

        <div className="bg-card rounded-md border">
          <div className="px-4 py-3 border-b flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search consultants..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-8 text-sm"
              />
            </div>
            <span className="text-xs text-muted-foreground">{filtered.length} records</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="data-table-header text-left px-4 py-2.5">ID</th>
                  <th className="data-table-header text-left px-4 py-2.5">Name</th>
                  <th className="data-table-header text-left px-4 py-2.5">CR No.</th>
                  <th className="data-table-header text-left px-4 py-2.5">Tax No.</th>
                  <th className="data-table-header text-center px-4 py-2.5">Status</th>
                  <th className="data-table-header text-center px-4 py-2.5">Agreements</th>
                  <th className="data-table-header text-center px-4 py-2.5">Employees</th>
                  <th className="data-table-header text-center px-4 py-2.5 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors cursor-pointer">
                    <td className="px-4 py-2.5 font-mono text-xs">{c.id}</td>
                    <td className="px-4 py-2.5 font-medium">{c.name}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{c.crNo}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{c.taxNo}</td>
                    <td className="px-4 py-2.5 text-center"><StatusBadge status={c.status} /></td>
                    <td className="px-4 py-2.5 text-center font-mono">{c.agreements}</td>
                    <td className="px-4 py-2.5 text-center font-mono">{c.employees}</td>
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
