import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Apprendre l’ukrainien",
    template: "%s · Apprendre l’ukrainien",
  },
  description: "Un espace pour apprendre l’ukrainien en français.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <a className="skip-link" href="#main-content">
          Aller au contenu
        </a>
        <header className="site-header">
          <Link
            className="brand"
            href="/"
            aria-label="Apprendre l’ukrainien, accueil"
          >
            <span className="brand-mark" aria-hidden="true">
              У
            </span>
            Apprendre l’ukrainien
          </Link>
        </header>
        {children}
      </body>
    </html>
  );
}
