import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppSidebar } from "@/components/app-sidebar";
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
        <AppSidebar />
        <div className="workspace">{children}</div>
      </body>
    </html>
  );
}
