import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { MONEY_TABS, moneyTabFor } from "./nav-items";

/** Quotes · Invoices · Expenses, above each of those pages: "Money" in the sidebar is all three. */
export function MoneyTabs() {
  const { pathname } = useLocation();
  const current = moneyTabFor(pathname);
  if (!current) return null;
  return (
    <nav aria-label="Money" className="mb-4 flex items-center gap-1 rounded-lg bg-secondary p-1 w-fit max-w-full overflow-x-auto">
      {MONEY_TABS.map((tab) => {
        const active = tab.path === current;
        return (
          <Link
            key={tab.path}
            to={tab.path}
            aria-current={active ? "page" : undefined}
            className={cn(
              "px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors",
              active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.title}
          </Link>
        );
      })}
    </nav>
  );
}
