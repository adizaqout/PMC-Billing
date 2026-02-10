import AppLayout from "@/components/AppLayout";
import { Construction } from "lucide-react";

export default function PlaceholderPage({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <AppLayout>
      <div className="animate-fade-in flex flex-col items-center justify-center min-h-[60vh] text-center">
        <Construction size={48} className="text-muted-foreground mb-4" />
        <h1 className="page-title mb-1">{title}</h1>
        <p className="page-subtitle">{subtitle}</p>
      </div>
    </AppLayout>
  );
}
