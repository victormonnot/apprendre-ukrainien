import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CourseMarkdown } from "@/components/course-markdown";
import { PrintButton } from "@/components/document-tools";
import { TableOfContents } from "@/components/table-of-contents";
import { documentHref, modules } from "@/content/catalog";
import { getCourseDocument } from "@/lib/course-content";
import { DocumentProgress } from "@/components/document-progress";

type PageProps = { params: Promise<{ moduleId: string; view: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return modules.flatMap((module) =>
    module.documents.map((document) => ({
      moduleId: module.id,
      view: document.view,
    })),
  );
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { moduleId, view } = await params;
  const data = await getCourseDocument(moduleId, view);
  return {
    title: data
      ? `${data.document.label} · Module ${moduleId}`
      : "Page introuvable",
  };
}

export default async function CourseDocumentPage({ params }: PageProps) {
  const { moduleId, view } = await params;
  const data = await getCourseDocument(moduleId, view);
  if (!data) notFound();
  const { module, document, markdown, sections } = data;

  return (
    <main id="main-content" className="page document-page" tabIndex={-1}>
      <div className="document-toolbar">
        <nav aria-label="Fil d’Ariane" className="breadcrumbs">
          <Link href="/parcours">Parcours</Link>
          <span aria-hidden="true">/</span>
          <span>Module {module.id}</span>
        </nav>
        <PrintButton />
      </div>
      <header className="document-heading">
        <div className="module-meta">
          <span className="eyebrow">Module {module.id}</span>
          <span className="badge">{module.level}</span>
        </div>
        <h1>
          {view === "cours"
            ? module.title
            : document.label === "Vocabulaire"
              ? "Vocabulaire et usages"
              : "Exercices et corrections"}
        </h1>
        <p className="page-description">
          {view === "cours" ? module.description : module.title}
        </p>
      </header>
      <nav className="document-tabs" aria-label="Supports du module">
        {module.documents.map((item) => (
          <Link
            key={item.view}
            href={documentHref(module.id, item.view)}
            aria-current={item.view === view ? "page" : undefined}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <DocumentProgress
        key={`${module.id}/${document.view}`}
        moduleId={module.id}
        view={document.view}
        sections={sections}
      />
      {(view === "cours" || view === "vocabulaire") && (
        <p className="document-review-link">
          Pour retrouver ce que tu viens d’étudier :{" "}
          <Link href="/revisions">choisir mes éléments à réviser</Link>.
        </p>
      )}
      <details className="mobile-toc">
        <summary>Sommaire de cette fiche</summary>
        <TableOfContents sections={sections} />
      </details>
      <div className="reader-layout">
        <div className="reading-sheet">
          <CourseMarkdown markdown={markdown} moduleId={module.id} />
          <footer className="document-footer">
            <span>
              Module {module.id} · {document.label}
            </span>
            <a href="#main-content">Revenir en haut ↑</a>
          </footer>
        </div>
        <aside className="desktop-toc">
          <p className="nav-label">Dans cette fiche</p>
          <TableOfContents sections={sections} />
          <div className="reading-tip">
            <strong>À ton rythme</strong>
            <p>
              Tu peux lire le cours d’un bloc ou avancer passage par passage.
            </p>
          </div>
        </aside>
      </div>
    </main>
  );
}
