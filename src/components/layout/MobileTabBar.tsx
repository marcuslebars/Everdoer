import { MoreHorizontal } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { PRIMARY_NAV, isNavActive, isUnderMore } from "./nav-items";

/**
 * Phones and tablets: the five everyday places as a bottom tab bar (thumb reach), plus "More",
 * which opens the full menu. Hidden from lg up, where the sidebar shows instead.
 */
export function MobileTabBar({ onMore }: { onMore: () => void }) {
  const { pathname } = useLocation();
  const moreActive = isUnderMore(pathname) || pathname.startsWith("/concierge");
  return (
    <nav
      aria-label="Quick"
      className="lg:hidden fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="grid grid-cols-6">
        {PRIMARY_NAV.map((item) => {
          const active = isNavActive(item, pathname);
          return (
            <li key={item.path}>
              <Link
                to={item.path}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 h-14 text-[10px] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <item.icon className="w-5 h-5" />
                <span>{item.title}</span>
              </Link>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            onClick={onMore}
            aria-label="More"
            className={cn(
              "w-full flex flex-col items-center justify-center gap-0.5 h-14 text-[10px] font-medium transition-colors",
              moreActive ? "text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <MoreHorizontal className="w-5 h-5" />
            <span>More</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
