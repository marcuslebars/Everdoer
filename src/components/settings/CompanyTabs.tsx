import { cn } from "@/lib/utils";

/** The business switcher at the top of a Settings section (only with more than one). */
export function CompanyTabs({ companies, selected, onSelect }: { companies: Array<{ id: string; name: string }>; selected: string | null; onSelect: (id: string) => void }) {
  if (companies.length < 2) return null;
  return (
    <div role="tablist" aria-label="Business" className="flex flex-wrap gap-1 bg-secondary/50 rounded-lg p-1 border border-border w-fit max-w-full">
      {companies.map((c) => (
        <button
          key={c.id}
          type="button"
          role="tab"
          aria-selected={c.id === selected}
          onClick={() => onSelect(c.id)}
          className={cn(
            "px-3 py-1.5 rounded-md text-xs font-medium transition-all truncate max-w-[200px]",
            c.id === selected ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {c.name}
        </button>
      ))}
    </div>
  );
}
