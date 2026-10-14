"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const destinations = [
  { href: "/immersion", label: "Vue d’ensemble" },
  { href: "/cafe", label: "Le café" },
  { href: "/studio", label: "Studio d’écoute" },
  { href: "/ressources", label: "Médiathèque" },
];

export function ImmersionNav() {
  const pathname = usePathname();
  return (
    <nav className="section-nav" aria-label="Explorer l’immersion">
      {destinations.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          aria-current={
            pathname === href || pathname.startsWith(`${href}/`)
              ? "page"
              : undefined
          }
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
