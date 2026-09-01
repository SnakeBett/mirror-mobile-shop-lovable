import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RANGE_LABELS, type RangePreset } from "@/lib/analytics-queries";

const PRESETS: RangePreset[] = ["today", "yesterday", "7d", "30d", "this_month", "last_month", "custom"];

export type PeriodState = { preset: RangePreset; from: string; to: string };

export function PeriodPicker({
  value,
  onChange,
}: {
  value: PeriodState;
  onChange: (next: PeriodState) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {PRESETS.map((preset) => (
        <Button
          key={preset}
          size="sm"
          variant={value.preset === preset ? "default" : "outline"}
          onClick={() => onChange({ ...value, preset })}
        >
          {RANGE_LABELS[preset]}
        </Button>
      ))}
      {value.preset === "custom" && (
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={value.from}
            onChange={(e) => onChange({ ...value, from: e.target.value })}
            className="h-9 w-40"
          />
          <span className="text-xs text-muted-foreground">até</span>
          <Input
            type="date"
            value={value.to}
            onChange={(e) => onChange({ ...value, to: e.target.value })}
            className="h-9 w-40"
          />
        </div>
      )}
    </div>
  );
}
