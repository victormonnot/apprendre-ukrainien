"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/parcours", label: "Parcours", symbol: "01" },
  { href: "/parcours/01/vocabulaire", label: "Vocabulaire", symbol: "Аа" },
  { href: "/parcours/01/exercices", label: "Exercices", symbol: "✎" },
  { href: "/atelier", label: "Atelier", symbol: "↔" },
  { href: "/studio", label: "Studio d’écoute", symbol: "♫" },
  { href: "/cafe", label: "Le café", symbol: "☕" },
  { href: "/revisions", label: "Révisions", symbol: "↻" },
];

export function AppSidebar() {
  const pathname = usePathname();
  return (
    <aside className="app-sidebar">
      <Link
        className="brand"
        href="/parcours"
        aria-label="Apprendre l’ukrainien, accueil"
      >
        <span className="brand-mark" aria-hidden="true">
          У
        </span>
        <span>
          Apprendre
          <br /> l’ukrainien
        </span>
      </Link>
      <p className="nav-label">Mon espace</p>
      <nav className="main-nav" aria-label="Navigation principale">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={pathname === item.href ? "page" : undefined}
          >
            <span className="nav-symbol" aria-hidden="true">
              {item.symbol}
            </span>
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="sidebar-note">
        <span lang="uk">Крок за кроком</span>
        <p>Pas à pas.</p>
      </div>
    </aside>
  );
}
