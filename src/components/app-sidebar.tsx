"use client";

import Link from "next/link";
import { useAuth } from "./auth-context";
import { usePathname } from "next/navigation";

const items = [
  { href: "/parcours", label: "Parcours", symbol: "01" },
  { href: "/parcours/01/vocabulaire", label: "Vocabulaire", symbol: "Аа" },
  { href: "/parcours/01/exercices", label: "Exercices", symbol: "✎" },
  { href: "/atelier", label: "Atelier", symbol: "↔" },
  { href: "/studio", label: "Studio d’écoute", symbol: "♫" },
  { href: "/cafe", label: "Le café", symbol: "☕" },
  { href: "/ressources", label: "Médiathèque", symbol: "▷" },
  { href: "/revisions", label: "Révisions", symbol: "↻" },
  { href: "/donnees", label: "Mes données", symbol: "↓" },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { enabled, account } = useAuth();
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
      <p className="nav-label">
        {enabled && !account ? "Découvrir" : "Mon espace"}
      </p>
      <nav className="main-nav" aria-label="Navigation principale">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={
              pathname === item.href ||
              (item.href === "/ressources" &&
                pathname.startsWith("/ressources/"))
                ? "page"
                : undefined
            }
          >
            <span className="nav-symbol" aria-hidden="true">
              {item.symbol}
            </span>
            {item.label}
          </Link>
        ))}
      </nav>
      {enabled && (
        <div className="sidebar-account">
          <Link
            href={account ? "/compte" : "/connexion"}
            aria-current={
              pathname === "/compte" || pathname === "/connexion"
                ? "page"
                : undefined
            }
          >
            <span aria-hidden="true">◌</span>{" "}
            {account ? account.displayName : "Se connecter"}
          </Link>
          {!account && <Link href="/inscription">Créer un compte</Link>}
        </div>
      )}
      <div className="sidebar-note">
        <span lang="uk">Крок за кроком</span>
        <p>Pas à pas.</p>
      </div>
    </aside>
  );
}
