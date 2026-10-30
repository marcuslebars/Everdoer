/**
 * The app's navigation, simple by default: five everyday places for a small-business owner, and
 * everything else one tap away under "More". Every screen is still reachable (and in the ⌘K
 * palette); only the sidebar's first glance is shorter.
 */
import {
  Home,
  Inbox,
  Calendar,
  Users,
  Wallet,
  ClipboardCheck,
  CheckSquare,
  Repeat,
  Timer,
  Star,
  BarChart3,
  Zap,
  Building2,
  Activity,
  Settings,
  Headset,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  title: string;
  icon: LucideIcon;
  path: string;
  /** Other paths that light this item up (Money covers quotes, invoices and expenses). */
  alsoActiveOn?: string[];
}

/** Money's pages, in the order of the tabs shown on each of them. */
export const MONEY_TABS: Array<{ title: string; path: string }> = [
  { title: "Quotes", path: "/quotes" },
  { title: "Invoices", path: "/invoices" },
  { title: "Expenses", path: "/expenses" },
];

export const PRIMARY_NAV: NavItem[] = [
  { title: "Home", icon: Home, path: "/" },
  { title: "Inbox", icon: Inbox, path: "/inbox" },
  { title: "Schedule", icon: Calendar, path: "/calendar" },
  { title: "Customers", icon: Users, path: "/crm" },
  { title: "Money", icon: Wallet, path: "/invoices", alsoActiveOn: ["/quotes", "/expenses"] },
];

export const MORE_NAV: NavItem[] = [
  { title: "Your AI", icon: Sparkles, path: "/ai" },
  { title: "My Jobs", icon: ClipboardCheck, path: "/jobs" },
  { title: "Tasks", icon: CheckSquare, path: "/tasks" },
  { title: "Recurring", icon: Repeat, path: "/recurring" },
  { title: "Timesheets", icon: Timer, path: "/timesheets" },
  { title: "Reviews", icon: Star, path: "/reviews" },
  { title: "Reports", icon: BarChart3, path: "/reports" },
  { title: "Automations", icon: Zap, path: "/automations" },
  { title: "Accounts", icon: Building2, path: "/accounts" },
  { title: "Activity", icon: Activity, path: "/activity" },
  { title: "Settings", icon: Settings, path: "/settings" },
];

/** Only shown to concierge operators (session.isOperator); the routes 404 for everyone else. */
export const OPERATOR_NAV_ITEM: NavItem = { title: "Concierge", icon: Headset, path: "/concierge" };

function underPath(pathname: string, path: string): boolean {
  if (path === "/") return pathname === "/";
  return pathname === path || pathname.startsWith(`${path}/`);
}

/** Whether a nav item is the current place. PURE. */
export function isNavActive(item: NavItem, pathname: string): boolean {
  return [item.path, ...(item.alsoActiveOn ?? [])].some((p) => underPath(pathname, p));
}

/** Whether the current page lives under "More", so the group opens itself. PURE. */
export function isUnderMore(pathname: string, items: NavItem[] = MORE_NAV): boolean {
  return items.some((item) => isNavActive(item, pathname));
}

/** The Money tab for this page, or null when it isn't a Money page. PURE. */
export function moneyTabFor(pathname: string): string | null {
  return MONEY_TABS.find((t) => underPath(pathname, t.path))?.path ?? null;
}
