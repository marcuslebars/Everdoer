import { Building2, Users, AppWindow, Globe, Star, Landmark, Receipt, Bell, CreditCard, Bot, Package, Phone, BookOpenCheck, CalendarCheck, ListChecks, Puzzle } from "lucide-react";

/**
 * Settings, simple by default: the everyday sections first, the rest under "Advanced" (opens by
 * itself when you land on one). Used by SettingsPage; tested in src/test/simple-settings.test.tsx.
 */
export const sections = [
  { id: "org", label: "Business", icon: Building2, description: "Your business name and companies", group: "basics" },
  { id: "members", label: "Team", icon: Users, description: "Invite your team and set who can change what", group: "basics" },
  { id: "website", label: "Your website", icon: AppWindow, description: "Your hosted page: preview, publish and edit the wording", group: "basics" },
  { id: "booking", label: "Online booking", icon: Globe, description: "Your booking page: hours, services and deposits", group: "basics" },
  { id: "reviews", label: "Reviews", icon: Star, description: "Ask customers for a review after each job", group: "basics" },
  { id: "payments", label: "Payments", icon: Landmark, description: "Connect each company's Stripe account to take deposits", group: "basics" },
  { id: "invoices", label: "Invoices", icon: Receipt, description: "HST number, payment methods, terms and reminders for each company's invoices", group: "basics" },
  { id: "notifications", label: "Notifications", icon: Bell, description: "Owner daily digest and notification preferences", group: "basics" },
  { id: "billing", label: "Billing & Plans", icon: CreditCard, description: "Manage your subscription and plan", group: "basics" },
  { id: "front-desk", label: "AI front desk", icon: Bot, description: "Your assistant that answers customer texts and calls", group: "advanced" },
  { id: "packs", label: "Industry pack", icon: Package, description: "Apply a starter pack for your trade and price its services", group: "advanced" },
  { id: "voice", label: "Voice (Marina)", icon: Phone, description: "Set each company's outbound agent, caller ID, and system prompt", group: "advanced" },
  { id: "accounting", label: "Accounting", icon: BookOpenCheck, description: "Sync invoices, payments and expenses to QuickBooks or Xero", group: "advanced" },
  { id: "visits", label: "Confirm & reschedule", icon: CalendarCheck, description: "Let customers confirm, move or cancel visits from the reminder", group: "advanced" },
  { id: "checklists", label: "Job checklists", icon: ListChecks, description: "Reusable checklists your crew ticks off on each kind of job", group: "advanced" },
  { id: "integrations", label: "Integrations", icon: Puzzle, description: "Connect third-party tools and services", group: "advanced" },
] as const;

export type SectionId = (typeof sections)[number]["id"];

/** Which section a /settings URL opens (old /settings/payments-style paths included). PURE. */
export function sectionFromUrl(pathname: string, search: string): SectionId {
  if (pathname.endsWith("/payments")) return "payments";
  if (pathname.endsWith("/invoices")) return "invoices";
  if (pathname.endsWith("/billing")) return "billing";
  const requested = new URLSearchParams(search).get("section");
  return sections.find((s) => s.id === requested)?.id ?? "org";
}
