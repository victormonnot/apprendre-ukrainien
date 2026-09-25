import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getResource, learningResources } from "@/content/resources";
import { ResourceWorkspace } from "@/components/resource-workspace";
import { formatResourceTime } from "@/lib/resource-time";

type Props = { params: Promise<{ resourceId: string }> };
export const dynamicParams = false;
export function generateStaticParams() {
  return learningResources.map((resource) => ({ resourceId: resource.id }));
}
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const resource = getResource((await params).resourceId);
  return {
    title: resource
      ? `${resource.title} · Médiathèque`
      : "Ressource introuvable",
  };
}
export default async function ResourcePage({ params }: Props) {
  const resource = getResource((await params).resourceId);
  if (!resource) notFound();
  return (
    <main id="main-content" className="page resource-page" tabIndex={-1}>
      <nav
        className="breadcrumbs resource-breadcrumbs"
        aria-label="Fil d’Ariane"
      >
        <Link href="/ressources">Médiathèque</Link>
        <span aria-hidden="true">/</span>
        <span>Module {resource.moduleId}</span>
      </nav>
      <header className="page-heading">
        <p className="eyebrow">
          {resource.kind === "podcast"
            ? "Podcast"
            : resource.kind === "video"
              ? "Vidéo"
              : "Guide audio"}{" "}
          · Module {resource.moduleId}
        </p>
        <h1>{resource.title}</h1>
        <p className="page-description">{resource.description}</p>
        <p className="resource-heading-meta">
          {resource.author} · {resource.language}
          {resource.durationSeconds !== null &&
            ` · Durée annoncée ≈ ${formatResourceTime(resource.durationSeconds)}`}
        </p>
      </header>
      <ResourceWorkspace key={resource.id} resource={resource} />
    </main>
  );
}
