import type { Metadata } from "next";
import { Suspense } from "react";
import { LanguageWorkspace } from "@/components/language-workspace";

export const metadata: Metadata = { title: "Atelier de langue" };

export default function LanguagePage() {
  return (
    <main id="main-content" className="page catalog-page" tabIndex={-1}>
      <header className="page-heading">
        <p className="eyebrow">Comprendre et réutiliser</p>
        <h1>Mon atelier de langue</h1>
        <p className="page-description">
          Retrouve un mot du cours, explore une phrase ou retravaille ton propre
          texte. Garde les fiches qui te sont utiles.
        </p>
      </header>
      <Suspense fallback={<p role="status">Ouverture de l’atelier…</p>}>
        <LanguageWorkspace />
      </Suspense>
    </main>
  );
}
