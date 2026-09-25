import type { Metadata } from "next";
import { Suspense } from "react";
import { AudioStudio } from "@/components/audio-studio";

export const metadata: Metadata = { title: "Studio d’écoute" };

export default function StudioPage() {
  return (
    <main id="main-content" className="page catalog-page" tabIndex={-1}>
      <header className="page-heading">
        <p className="eyebrow">Écouter et répéter</p>
        <h1>Mon studio d’écoute</h1>
        <p className="page-description">
          Retrouve les sons du cours, écoute une phrase à ton rythme et prends
          le temps de la répéter.
        </p>
      </header>
      <Suspense fallback={<p role="status">Ouverture du studio…</p>}>
        <AudioStudio />
      </Suspense>
    </main>
  );
}
