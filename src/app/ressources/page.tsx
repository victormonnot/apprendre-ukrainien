import type { Metadata } from "next";
import { learningResources } from "@/content/resources";
import { ResourceLibrary } from "@/components/resource-library";

export const metadata: Metadata = { title: "Médiathèque" };
export default function ResourcesPage() {
  return (
    <main id="main-content" className="page catalog-page" tabIndex={-1}>
      <header className="page-heading">
        <p className="eyebrow">Écouter et explorer</p>
        <h1>Ma médiathèque</h1>
        <p className="page-description">
          Des podcasts, une vidéo et un guide pour retrouver les sons et les
          expressions du parcours. Les consignes sont en français, les
          ressources indiquent leur langue.
        </p>
      </header>
      <ResourceLibrary resources={learningResources} />
    </main>
  );
}
