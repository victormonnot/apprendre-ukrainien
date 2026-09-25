import type { Metadata } from "next";
import { ReviewWorkspace } from "@/components/review-workspace";

export const metadata: Metadata = { title: "Révisions" };

export default function ReviewsPage() {
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
      <ReviewWorkspace />
    </main>
  );
}
