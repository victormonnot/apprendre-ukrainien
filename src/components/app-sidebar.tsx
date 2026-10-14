"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useAuth } from "./auth-context";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "Accueil", symbol: "⌂" },
  { href: "/revisions", label: "Révisions", symbol: "↻" },
  { href: "/atelier", label: "Atelier", symbol: "↔" },
  { href: "/immersion", label: "Immersion", symbol: "♫" },
  { href: "/parcours", label: "Cours & fiches", symbol: "Аа" },
];

export function AppSidebar() {
  const pathname = usePathname();
  const [openAt, setOpenAt] = useState<string | null>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const open = openAt === pathname;
  const { enabled, account } = useAuth();
  function isCurrent(href: string) {
    if (href === "/") return pathname === "/";
    if (href === "/immersion")
      return ["/immersion", "/cafe", "/studio", "/ressources"].some(
        (path) => pathname === path || pathname.startsWith(`${path}/`),
      );
    return pathname === href || pathname.startsWith(`${href}/`);
  }
  return (
    <aside
      className="app-sidebar"
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          setOpenAt(null);
          menuButton.current?.focus();
        }
      }}
    >
      <div className="sidebar-header">
        <Link
          className="brand"
          href="/"
          aria-label="Apprendre l’ukrainien, accueil"
          onNavigate={() => setOpenAt(null)}
        >
          <span className="brand-mark" aria-hidden="true">
            У
          </span>
          <span>
            Apprendre
            <br /> l’ukrainien
          </span>
        </Link>
        <button
          ref={menuButton}
          className="mobile-menu-toggle"
          type="button"
          aria-expanded={open}
          aria-controls="app-navigation"
          onClick={() => setOpenAt(open ? null : pathname)}
        >
          <span aria-hidden="true">{open ? "×" : "☰"}</span> Menu
        </button>
      </div>
      <div className="sidebar-navigation" id="app-navigation" data-open={open}>
        <nav className="main-nav" aria-label="Navigation principale">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onNavigate={() => setOpenAt(null)}
              aria-current={isCurrent(item.href) ? "page" : undefined}
            >
              <span className="nav-symbol" aria-hidden="true">
                {item.symbol}
              </span>
              {item.label}
            </Link>
          ))}
        </nav>
        <nav className="sidebar-account" aria-label="Mon espace">
          <Link
            href="/donnees"
            onNavigate={() => setOpenAt(null)}
            aria-current={pathname === "/donnees" ? "page" : undefined}
          >
            Mes données
          </Link>
          {enabled && (
            <Link
              href={account ? "/compte" : "/connexion"}
              onNavigate={() => setOpenAt(null)}
              aria-current={
                pathname === "/compte" || pathname === "/connexion"
                  ? "page"
                  : undefined
              }
            >
              {account ? "Mon compte" : "Se connecter"}
            </Link>
          )}
        </nav>
      </div>
    </aside>
  );
}
