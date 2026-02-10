import { useState, useRef, useEffect } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface ColumnFilterProps {
  value: string;
  onChange: (value: string) => void;
  label: string;
}

export default function ColumnFilter({ value, onChange, label }: ColumnFilterProps) {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={`ml-1 p-0.5 rounded hover:bg-accent inline-flex items-center ${value ? "text-primary" : "text-muted-foreground opacity-50 hover:opacity-100"}`}
          title={`Filter ${label}`}
        >
          <Search size={10} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-2" align="start" sideOffset={4}>
        <div className="relative">
          <Input
            ref={inputRef}
            placeholder={`Filter ${label}...`}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="h-7 text-xs pr-6"
          />
          {value && (
            <button
              onClick={() => { onChange(""); setOpen(false); }}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
