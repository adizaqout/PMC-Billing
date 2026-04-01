import { Input } from "@/components/ui/input";

const fmtDisplay = (v: number | null) =>
  v != null ? new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(v) : "";

interface CurrencyInputProps {
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder?: string;
  className?: string;
}

export default function CurrencyInput({ value, onChange, placeholder, className }: CurrencyInputProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/,/g, "");
    if (raw === "" || raw === "-") { onChange(null); return; }
    const n = parseFloat(raw);
    if (!isNaN(n)) onChange(n);
  };

  return (
    <Input
      value={fmtDisplay(value)}
      onChange={handleChange}
      placeholder={placeholder}
      className={className}
      inputMode="decimal"
    />
  );
}
