import type { Metadata } from "next";
import Link from "next/link";
import { documentHref, modules } from "@/content/catalog";

export const metadata: Metadata = { title: "Parcours" };

export default function CourseCatalogPage() {
  return (
    <main id="main-content" className="page catalog-page" tabIndex={-1}>
      <header className="page-heading">
        <p className="eyebrow">Apprendre, comprendre, pratiquer</p>
        <h1>Mon parcours</h1>
        <p className="page-description">
          Des cours à explorer à ton rythme, un module après l’autre.
        </p>
      </header>
      <div className="section-heading">
        <h2>Les premiers pas</h2>
        <span>{modules.length} module disponible</span>
      </div>
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
                href={documentHref(module.id, "cours")}
              >
                Ouvrir le cours <span aria-hidden="true">↗</span>
              </Link>
              <span className="module-supports">
                Cours complet · Vocabulaire · Exercices
              </span>
            </div>
          </div>
        </section>
      ))}
      <section className="work-method" aria-labelledby="work-method-title">
        <h2 id="work-method-title">Trois supports, un même module</h2>
        <div className="support-grid">
          {modules[0]?.documents.map((document) => (
            <Link
              key={document.view}
              className="support-link"
              href={documentHref("01", document.view)}
            >
              <span>
                {document.label}
                <span aria-hidden="true">↗</span>
              </span>
              <p>{document.description}</p>
            </Link>
          ))}
        </div>
      </section>
      <p className="quiet-note">
        Un module peut se travailler en plusieurs séances. Le cours reste
        disponible pour revenir sur une explication.
      </p>
    </main>
  );
}
