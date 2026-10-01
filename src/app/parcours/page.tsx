import type { Metadata } from "next";
import Link from "next/link";
import { documentHref, modules, type DocumentView } from "@/content/catalog";
import { LearningOverview } from "@/components/learning-overview";
import { ExerciseOverview } from "@/components/exercise-overview";
import { ReviewOverview } from "@/components/review-overview";

export const metadata: Metadata = { title: "Parcours" };

export default async function CourseCatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  const selectedView: DocumentView =
    view === "vocabulaire" || view === "exercices" ? view : "cours";
  const actionLabel = {
    cours: "Ouvrir le cours",
    vocabulaire: "Ouvrir le vocabulaire",
    exercices: "Ouvrir les exercices",
  }[selectedView];
  return (
    <main id="main-content" className="page catalog-page" tabIndex={-1}>
      <header className="page-heading">
        <p className="eyebrow">Apprendre, comprendre, pratiquer</p>
        <h1>Mon parcours</h1>
        <p className="page-description">
          Des cours à explorer à ton rythme, un module après l’autre.
        </p>
      </header>
      <LearningOverview />
      <ReviewOverview />
      <div className="section-heading">
        <h2>Les premiers pas</h2>
        <span>
          {modules.length} module{modules.length > 1 ? "s" : ""} disponible
          {modules.length > 1 ? "s" : ""}
        </span>
      </div>
      {selectedView !== "cours" && (
        <p>
          Choisis le module dont tu veux ouvrir{" "}
          {selectedView === "vocabulaire"
            ? "la fiche de vocabulaire"
            : "les exercices"}
          .
        </p>
      )}
      {modules.map((module) => (
        <section
          className="module-card"
          key={module.id}
          aria-labelledby={`module-${module.id}`}
        >
          <div className="module-number" aria-hidden="true">
            {module.id}
            <span>LES BASES</span>
          </div>
          <div className="module-card-content">
            <div className="module-meta">
              <span className="badge">{module.level}</span>
              <span>{module.prerequisites}</span>
            </div>
            <h2 id={`module-${module.id}`}>{module.title}</h2>
            <p>{module.description}</p>
            <ul className="objectives">
              {module.objectives.map((objective) => (
                <li key={objective}>{objective}</li>
              ))}
            </ul>
            <div className="module-actions">
              <Link
                className="button button-primary"
                href={documentHref(module.id, selectedView)}
              >
                {actionLabel} <span aria-hidden="true">↗</span>
              </Link>
              <span className="module-supports">
                Cours complet · Vocabulaire · Exercices
              </span>
            </div>
            <nav
              className="module-document-links"
              aria-label={`Supports du module ${module.id}`}
            >
              {module.documents
                .filter((document) => document.view !== selectedView)
                .map((document) => (
                  <Link
                    key={document.view}
                    href={documentHref(module.id, document.view)}
                  >
                    {document.label} ↗
                  </Link>
                ))}
            </nav>
            <ExerciseOverview moduleId={module.id} />
          </div>
        </section>
      ))}
      <div className="cafe-module-link">
        <Link href="/cafe">Entrer dans le café ↗</Link>
        <span>
          Réutiliser les expressions du module 01 dans une conversation.
        </span>
      </div>
      <div className="resource-module-link">
        <Link href="/ressources">Explorer les écoutes du module 01 ↗</Link>
        <span>
          Alphabet, salutations et présentations avec Ukrainian Lessons.
        </span>
      </div>
      <section className="work-method" aria-labelledby="work-method-title">
        <h2 id="work-method-title">Trois supports, un même module</h2>
        <div className="support-grid">
          <div className="support-link">
            <span>Cours</span>
            <p>
              Les explications détaillées, les exemples et les exercices
              communs.
            </p>
          </div>
          <div className="support-link">
            <span>Vocabulaire</span>
            <p>Les mots, leur prononciation et leurs usages en contexte.</p>
          </div>
          <div className="support-link">
            <span>Exercices</span>
            <p>
              Les exercices du cours, des activités complémentaires et tes
              réponses conservées.
            </p>
          </div>
        </div>
      </section>
      <p className="quiet-note">
        Un module peut se travailler en plusieurs séances. Le cours reste
        disponible pour revenir sur une explication.
      </p>
    </main>
  );
}
