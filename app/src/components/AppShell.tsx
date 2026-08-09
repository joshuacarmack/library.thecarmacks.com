import { NavLink, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useOnlineStatus } from "../hooks/useOnlineStatus";

const NAV_ITEMS = [
  { to: "/", label: "Library", icon: "📚" },
  { to: "/wishlist", label: "Wishlist", icon: "⭐" },
  { to: "/add/scan", label: "Scan", icon: "📷" },
  { to: "/add/manual", label: "Add", icon: "➕" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const isBulkAdd = location.pathname === "/bulk-add";
  const online = useOnlineStatus();

  return (
    <div className="app-shell">
      {!online && (
        <div className="offline-banner" role="status">
          You're offline — changes won't save until your connection is back.
        </div>
      )}
      <main className={isBulkAdd ? "app-main app-main--wide" : "app-main"}>{children}</main>
      {!isBulkAdd && (
        <nav className="bottom-nav" aria-label="Primary">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) => "bottom-nav__item" + (isActive ? " bottom-nav__item--active" : "")}
            >
              <span className="bottom-nav__icon" aria-hidden="true">
                {item.icon}
              </span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  );
}
