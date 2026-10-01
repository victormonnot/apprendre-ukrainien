import type { Metadata } from "next";
import { ReviewWorkspace } from "@/components/review-workspace";
import { getModule } from "@/content/catalog";

export const metadata: Metadata = { title: "Révisions" };

export default async function ReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ module?: string }>;
}) {
  const query = await searchParams;
  const moduleId = getModule(query.module ?? "")?.id;
  return (
    <main id="main-content" className="page catalog-page" tabIndex={-1}>
      <header className="page-heading">
        <p className="eyebrow">Retrouver, puis comparer</p>
        <h1>Mes révisions</h1>
        <p className="page-description">
          Un peu de rappel, au bon moment. Choisis les éléments que tu as déjà
          abordés dans le cours.
        </p>
      </header>
      <ReviewWorkspace key={moduleId ?? "all"} initialModuleId={moduleId} />
    </main>
  );
}
