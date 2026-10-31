import { Outlet } from "react-router-dom";
import { useState } from "react";
import { AppSidebar } from "./AppSidebar";
import { TopBar } from "./TopBar";
import { MoneyTabs } from "./MoneyTabs";
import { MobileTabBar } from "./MobileTabBar";
import { AutomationNotifier } from "./AutomationNotifier";
import { useOrg } from "@/lib/org-context";
import { useOrgRealtime } from "@/lib/realtime";

export function AppLayout() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { organizationId } = useOrg();

  // Live UI updates (Task 11): invalidate dashboard/CRM/jobs caches on inbound inserts.
  useOrgRealtime(organizationId);

  return (
    <div className="flex min-h-screen w-full bg-background">
      <AutomationNotifier />
      <AppSidebar mobileOpen={mobileNavOpen} onMobileClose={() => setMobileNavOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar onMenuClick={() => setMobileNavOpen(true)} />
        {/* Room at the bottom on phones/tablets for the tab bar (and the phone's home indicator). */}
        <main className="flex-1 p-4 sm:p-6 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-6 overflow-auto">
          <MoneyTabs />
          <Outlet />
        </main>
      </div>
      <MobileTabBar onMore={() => setMobileNavOpen(true)} />
    </div>
  );
}
