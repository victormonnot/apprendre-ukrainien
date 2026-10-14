import type { Metadata } from "next";
import Link from "next/link";
import { ImmersionNav } from "@/components/immersion-nav";

export const metadata: Metadata = { title: "Immersion" };

export default function ImmersionPage() {
  return (
    <main id="main-content" className="page catalog-page" tabIndex={-1}>
      <ImmersionNav />
      <header className="page-heading">
        <p className="eyebrow">Écouter, répéter, échanger</p>
        <h1>Immersion</h1>
        <p className="page-description">
          Fais une place à l’ukrainien dans ton quotidien : une conversation,
          quelques phrases à répéter ou un podcast à écouter.
        </p>
      </header>
      <div className="immersion-activities">
        <Link href="/cafe" className="immersion-activity">
          <span className="immersion-letter" aria-hidden="true">
            Привіт!
          </span>
          <div>
            <h2>Le café</h2>
            <p>
              Écoute Anna et Maxime, explore leurs répliques et prends part à la
              conversation à l’écrit.
            </p>
          </div>
          <span className="immersion-action">
            Entrer dans le café <span aria-hidden="true">→</span>
          </span>
        </Link>
        <Link href="/studio" className="immersion-activity">
          <span className="immersion-letter" aria-hidden="true">
            Слухай
          </span>
          <div>
            <h2>Studio d’écoute</h2>
            <p>
              Écoute un mot ou une phrase, ralentis l’audio et répète à ton
              rythme.
            </p>
          </div>
          <span className="immersion-action">
            Ouvrir le studio <span aria-hidden="true">→</span>
          </span>
        </Link>
        <Link href="/ressources" className="immersion-activity">
          <span className="immersion-letter" aria-hidden="true">
            Відкрий
          </span>
          <div>
            <h2>Médiathèque</h2>
            <p>
              Retrouve les podcasts, vidéos et guides sélectionnés, avec des
              repères pour les travailler.
            </p>
          </div>
          <span className="immersion-action">
            Explorer les ressources <span aria-hidden="true">→</span>
          </span>
        </Link>
      </div>
    </main>
  );
}
