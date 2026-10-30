/**
 * Home: the owner's day on one screen — what needs them, today's jobs, money owed and what the
 * AI did. Everything deeper (activity feed, automation stats, attribution) is under More → Activity.
 */
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, CalendarDays, CheckCircle2, ChevronRight, CheckSquare, Receipt, UserPlus, Wallet } from "lucide-react";
import { useOrg } from "@/lib/org-context";
import { useAuth } from "@/lib/auth-context";
import { useCalendarView, useDashboardSummary } from "@/lib/api-hooks";
import { useInvoices } from "@/lib/invoice-hooks";
import { formatCentsCompact } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ErrorBanner } from "@/components/ui/StateViews";
import { SetupProgressCard } from "@/components/onboarding/SetupProgress";
import { ApprovalsCard } from "@/components/approvals/ApprovalsCard";
import { WeeklyFrontDeskCard } from "@/components/reports/WeeklyFrontDeskCard";
import { DashboardErrorState, NoOrgContextState, OnboardingChecklistCard } from "./Dashboard";
import { greetingFor, needsYouItems, todaysJobs } from "@/lib/today";

const MAX_JOBS_SHOWN = 6;

function todayRange(now: Date): { start: string; end: string } {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function Section({ title, icon, action, children }: { title: string; icon: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-primary">{icon}</span>
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function SeeAll({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className="flex items-center gap-0.5 text-xs font-medium text-primary hover:underline">
      {label} <ChevronRight className="w-3.5 h-3.5" />
    </Link>
  );
}

export default function TodayPage() {
  const { organizationId, companyId, isValid } = useOrg();
  const { profile } = useAuth();
  const now = useMemo(() => new Date(), []);
  const range = useMemo(() => todayRange(now), [now]);
  const scope = companyId != null ? { companyId } : {};

  const summary = useDashboardSummary(organizationId, scope);
  const calendar = useCalendarView(organizationId, { ...range, ...scope, pageSize: 50 });
  const invoices = useInvoices(organizationId, { filter: "open", ...scope });

  if (!isValid) return <NoOrgContextState />;
  if (summary.isError && summary.error instanceof Error && summary.error.message.includes("401")) {
    return <DashboardErrorState message="Authentication required. Please sign in again." />;
  }
  if (summary.isError && summary.error instanceof Error && summary.error.message.includes("403")) {
    return <DashboardErrorState message="You don't have access to this organization." />;
  }

  const s = summary.data;
  const owed = invoices.data?.summary;
  const jobs = todaysJobs(calendar.data?.bookings.items ?? []);
  const needs = needsYouItems({
    newLeadCount: s?.newLeadCount,
    overdueTaskCount: s?.overdueTaskCount,
    overdueInvoiceCount: owed?.overdueCount,
    overdueCents: owed?.overdueCents,
  });
  const firstName = profile?.fullName?.trim().split(/\s+/)[0];

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <header className="opacity-0 animate-fade-in">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {greetingFor(now)}{firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
        </p>
      </header>

      <SetupProgressCard orgId={organizationId} />
      <OnboardingChecklistCard orgId={organizationId} />

      {summary.isError && <ErrorBanner message="Couldn't load today's numbers." onRetry={() => summary.refetch()} />}

      {/* Approvals the AI is waiting on come first: they're the one thing it can't do alone. */}
      <ApprovalsCard orgId={organizationId} companyId={companyId ?? null} />

      <Section title="Needs you" icon={<AlertCircle className="w-4 h-4" />}>
        {summary.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : needs.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="all-caught-up">
            <CheckCircle2 className="w-4 h-4 text-success" /> You're all caught up.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {needs.map((item) => (
              <li key={item.key}>
                <Link to={item.to} className="flex items-center justify-between gap-3 py-2.5 text-sm hover:text-primary group">
                  <span className="flex items-center gap-2.5">
                    {item.key === "leads" ? (
                      <UserPlus className="w-4 h-4 text-primary" />
                    ) : item.key === "invoices" ? (
                      <Receipt className="w-4 h-4 text-warning" />
                    ) : (
                      <CheckSquare className="w-4 h-4 text-warning" />
                    )}
                    <span className="font-medium text-foreground">{item.label}</span>
                  </span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Today's jobs" icon={<CalendarDays className="w-4 h-4" />} action={<SeeAll to="/calendar" label="Schedule" />}>
        {calendar.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : calendar.isError ? (
          <ErrorBanner message="Couldn't load today's jobs." onRetry={() => calendar.refetch()} />
        ) : jobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No jobs booked today.</p>
        ) : (
          <ul className="divide-y divide-border">
            {jobs.slice(0, MAX_JOBS_SHOWN).map((job) => (
              <li key={job.id}>
                <Link to={`/calendar?booking=${job.id}`} className="flex items-center gap-3 py-2.5 text-sm hover:text-primary">
                  <span className="w-16 shrink-0 tabular-nums text-muted-foreground">{timeLabel(job.scheduledFor)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-foreground">{job.title}</span>
                    {job.contact?.name && <span className="block truncate text-xs text-muted-foreground">{job.contact.name}</span>}
                  </span>
                  {job.status === "completed" && <CheckCircle2 className="w-4 h-4 text-success shrink-0" aria-label="Done" />}
                </Link>
              </li>
            ))}
            {jobs.length > MAX_JOBS_SHOWN && (
              <li className="pt-2.5 text-xs text-muted-foreground">
                and {jobs.length - MAX_JOBS_SHOWN} more — <Link to="/calendar" className="text-primary hover:underline">see the schedule</Link>
              </li>
            )}
          </ul>
        )}
      </Section>

      <Section title="Money" icon={<Wallet className="w-4 h-4" />} action={<SeeAll to="/invoices" label="Invoices" />}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4" data-testid="money">
          <div>
            <p className="text-xl font-bold tabular-nums text-foreground">{owed ? formatCentsCompact(owed.outstandingCents) : "—"}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Owed to you</p>
          </div>
          <div>
            <p className={cn("text-xl font-bold tabular-nums", owed && owed.overdueCents > 0 ? "text-warning" : "text-foreground")}>
              {owed ? formatCentsCompact(owed.overdueCents) : "—"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">Overdue</p>
          </div>
          <div>
            <p className="text-xl font-bold tabular-nums text-foreground">{s ? formatCentsCompact(s.revenueSnapshot.weekCents) : "—"}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Booked this week</p>
          </div>
        </div>
      </Section>

      {/* What the AI handled this week, with the weekly report one tap away. */}
      <WeeklyFrontDeskCard orgId={organizationId} companyId={companyId} />
      <div className="flex justify-center pb-2">
        <SeeAll to="/activity" label="See everything your AI did" />
      </div>
    </div>
  );
}
