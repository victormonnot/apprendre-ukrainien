import type { Metadata } from "next";
import { BackupWorkspace } from "@/components/backup-workspace";

export const metadata: Metadata = { title: "Mes données" };
export default function DataPage() {
  return (
    <main id="main-content" className="page data-page" tabIndex={-1}>
      <header className="page-heading">
        <p className="eyebrow">Conserver et retrouver mon travail</p>
        <h1>Mes données</h1>
        <p className="page-description">
          Une sauvegarde réunit ton suivi, tes notes, tes réponses et tes sons
          conservés. Tu peux la télécharger ou retrouver un état précédent.
        </p>
      </header>
      <BackupWorkspace />
    </main>
  );
}
