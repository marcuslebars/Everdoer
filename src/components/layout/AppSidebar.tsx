import { ChevronDown, ChevronLeft, ChevronRight, MoreHorizontal, X } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useState } from "react";
import { Logo, LogoMark } from "@/components/brand/Logo";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { MORE_NAV, OPERATOR_NAV_ITEM, PRIMARY_NAV, isNavActive, isUnderMore, type NavItem } from "./nav-items";

const MORE_OPEN_KEY = "everdoer.nav.moreOpen";

function readMoreOpen(): boolean {
  try {
    return window.localStorage.getItem(MORE_OPEN_KEY) === "1";
  } catch {
    return false;
  }
}

function writeMoreOpen(open: boolean) {
  try {
    window.localStorage.setItem(MORE_OPEN_KEY, open ? "1" : "0");
  } catch {
    // Storage blocked (private window): the group just won't remember.
  }
}

function NavRow({ item, active, collapsed, onNavigate }: { item: NavItem; active: boolean; collapsed?: boolean; onNavigate?: () => void }) {
  return (
    <Link
      to={item.path}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      title={collapsed ? item.title : undefined}
      className={cn(
        "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-all duration-150",
        "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        "active:scale-[0.97]",
        active ? "bg-sidebar-accent text-foreground shadow-sm" : "text-sidebar-foreground",
      )}
    >
      <item.icon className="w-[18px] h-[18px] shrink-0" />
      {!collapsed && <span>{item.title}</span>}
    </Link>
  );
}

function NavList({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const { session } = useAuth();
  const { pathname } = useLocation();
  const more = session?.isOperator ? [...MORE_NAV, OPERATOR_NAV_ITEM] : MORE_NAV;
  const [storedOpen, setStoredOpen] = useState(readMoreOpen);
  // A page that lives under More always shows its group, so you can see where you are.
  const here = isUnderMore(pathname, more);
  const open = storedOpen || here;

  const toggle = () => {
    const next = !open;
    setStoredOpen(next);
    writeMoreOpen(next);
  };

  return (
    <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto" aria-label="Main">
      {PRIMARY_NAV.map((item) => (
        <NavRow key={item.path} item={item} active={isNavActive(item, pathname)} collapsed={collapsed} onNavigate={onNavigate} />
      ))}

      <div className="pt-3">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls="nav-more"
          title={collapsed ? "More" : undefined}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
            "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          )}
        >
          <MoreHorizontal className="w-[18px] h-[18px] shrink-0" />
          {!collapsed && (
            <>
              <span className="flex-1 text-left">More</span>
              <ChevronDown className={cn("w-4 h-4 transition-transform", open ? "rotate-180" : "")} />
            </>
          )}
        </button>
        {open && (
          <div id="nav-more" className="mt-0.5 space-y-0.5">
            {more.map((item) => (
              <NavRow key={item.path} item={item} active={isNavActive(item, pathname)} collapsed={collapsed} onNavigate={onNavigate} />
            ))}
          </div>
        )}
      </div>
    </nav>
  );
}

export function AppSidebar({
  mobileOpen,
  onMobileClose,
}: {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <>
      {/* Desktop sidebar (in-flow, collapsible) */}
      <aside
        className={cn(
          "hidden lg:flex h-screen sticky top-0 flex-col bg-sidebar border-r border-sidebar-border transition-all duration-300 ease-out",
          collapsed ? "w-16" : "w-60",
        )}
      >
        <div className="h-14 flex items-center px-4 border-b border-sidebar-border">
          <div className="flex items-center overflow-hidden">
            {collapsed ? <LogoMark className="w-7 h-7 text-sm" /> : <Logo className="h-[22px]" />}
          </div>
        </div>

        <NavList collapsed={collapsed} />

        <div className="p-2 border-t border-sidebar-border">
          <button
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="w-full flex items-center justify-center py-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors"
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>
      </aside>

      {/* Mobile drawer (off-canvas overlay) */}
      <div
        className={cn(
          "lg:hidden fixed inset-0 z-50 transition-opacity duration-200",
          mobileOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
        )}
        aria-hidden={!mobileOpen}
      >
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onMobileClose} />
        <aside
          className={cn(
            "absolute left-0 top-0 h-full w-64 flex flex-col bg-sidebar border-r border-sidebar-border shadow-2xl transition-transform duration-300 ease-out",
            mobileOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="h-14 flex items-center justify-between px-4 border-b border-sidebar-border">
            <Logo className="h-[22px]" />
            <button
              onClick={onMobileClose}
              className="p-1.5 rounded-lg hover:bg-sidebar-accent text-muted-foreground transition-colors"
              aria-label="Close menu"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <NavList onNavigate={onMobileClose} />
        </aside>
      </div>
    </>
  );
}
