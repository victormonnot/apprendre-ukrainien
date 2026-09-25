import type { Metadata } from "next";
import { cafeScenes } from "@/content/scenes";
import { CafeWorkspace } from "@/components/cafe-workspace";

export const metadata: Metadata = { title: "Le café" };

export default function CafePage() {
  return (
    <main id="main-content" className="page cafe-page" tabIndex={-1}>
      <header className="page-heading">
        <p className="eyebrow">Des mots aux rencontres</p>
        <h1>Le café</h1>
        <p className="page-description">
          Prends une place auprès d’Anna et de Maxime. Écoute leur échange,
          explore une réplique, puis entre dans la conversation à l’écrit.
        </p>
      </header>
      <CafeWorkspace scenes={cafeScenes} />
    </main>
  );
}
