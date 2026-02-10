import AppLayout from "@/components/AppLayout";
import StatusBadge from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Lock, Unlock, CalendarCheck } from "lucide-react";

const periods = [
  { month: "2025-01", status: "Open", openedBy: "Admin", openedOn: "2025-01-01" },
  { month: "2024-12", status: "Closed", openedBy: "Admin", openedOn: "2024-12-01" },
  { month: "2024-11", status: "Closed", openedBy: "Admin", openedOn: "2024-11-01" },
  { month: "2024-10", status: "Closed", openedBy: "Admin", openedOn: "2024-10-01" },
  { month: "2024-09", status: "Closed", openedBy: "Admin", openedOn: "2024-09-01" },
  { month: "2024-08", status: "Closed", openedBy: "Admin", openedOn: "2024-08-01" },
];

export default function PeriodControlPage() {
  return (
    <AppLayout>
      <div className="animate-fade-in">
        <div className="page-header">
          <div>
            <h1 className="page-title">Period Control</h1>
            <p className="page-subtitle">Manage monthly billing periods — only one period can be open at a time</p>
          </div>
          <Button size="sm"><CalendarCheck size={14} className="mr-1.5" />Open Next Period</Button>
        </div>

        <div className="bg-card rounded-md border">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="data-table-header text-left px-4 py-2.5">Period (Month)</th>
                  <th className="data-table-header text-center px-4 py-2.5">Status</th>
                  <th className="data-table-header text-left px-4 py-2.5">Opened By</th>
                  <th className="data-table-header text-left px-4 py-2.5">Opened On</th>
                  <th className="data-table-header text-center px-4 py-2.5">Actions</th>
                </tr>
              </thead>
              <tbody>
                {periods.map((p) => (
                  <tr key={p.month} className="border-b last:border-0 hover:bg-muted/50">
                    <td className="px-4 py-3 font-mono font-medium">{p.month}</td>
                    <td className="px-4 py-3 text-center"><StatusBadge status={p.status} /></td>
                    <td className="px-4 py-3 text-muted-foreground">{p.openedBy}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{p.openedOn}</td>
                    <td className="px-4 py-3 text-center">
                      {p.status === "Open" ? (
                        <Button variant="outline" size="sm">
                          <Lock size={12} className="mr-1.5" /> Close Period
                        </Button>
                      ) : (
                        <Button variant="ghost" size="sm" className="text-muted-foreground">
                          <Unlock size={12} className="mr-1.5" /> Unlock (Admin)
                        </Button>
                      )}
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
