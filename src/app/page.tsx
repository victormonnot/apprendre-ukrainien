import type { Metadata } from "next";
import Link from "next/link";
import "@/components/activity-hub.css";

export const metadata: Metadata = { title: "Accueil" };

const activities = [
  {
    id: "reviews",
    href: "/revisions",
    title: "Révisions",
    description: "Retrouve tes cartes et entraîne ta mémoire à ton rythme.",
    action: "Réviser",
  },
  {
    id: "workshop",
    href: "/atelier",
    title: "Atelier",
    description:
      "Explore un mot, comprends une phrase ou retravaille ton texte.",
    action: "Explorer",
  },
  {
    id: "cafe",
    href: "/cafe",
    title: "Le café",
    description:
      "Écoute une conversation et reprends chaque réplique à ton rythme.",
    action: "Entrer",
  },
  {
    id: "listening",
    href: "/studio",
    title: "Studio d’écoute",
    description:
      "Écoute les mots et les phrases, ralentis et prends le temps de répéter.",
    action: "Écouter",
  },
  {
    id: "library",
    href: "/ressources",
    title: "Médiathèque",
    description:
      "Découvre des podcasts, des vidéos et des ressources pour aller plus loin.",
    action: "Découvrir",
  },
  {
    id: "courses",
    href: "/parcours",
    title: "Cours & fiches",
    description:
      "Avance dans les modules ou retrouve une explication et ses exercices.",
    action: "Consulter",
  },
] as const;

const activityIcons = {
  reviews: (
    <>
      <rect x="7" y="7" width="13" height="14" rx="2" />
      <path d="M16 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h2m4-5h5m-5 4h3" />
    </>
  ),
  workshop: (
    <>
      <path d="m16 3 5 5-12 12-6 1 1-6L16 3Zm-3 3 5 5M3 8V3h5" />
    </>
  ),
  cafe: (
    <>
      <path d="M4 8h12v7a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8Zm12 1h2a3 3 0 1 1 0 6h-2M3 22h14M7 2v2m6-2v2" />
    </>
  ),
  listening: (
    <>
      <path d="M4 13V11a8 8 0 0 1 16 0v2" />
      <rect x="3" y="12" width="5" height="9" rx="2" />
      <rect x="16" y="12" width="5" height="9" rx="2" />
    </>
  ),
  library: (
    <>
      <rect x="3" y="4" width="4" height="16" rx="1" />
      <rect x="7" y="4" width="5" height="16" rx="1" />
      <path d="m15 4 4-1 4 16-4 1-4-16ZM3 8h9m-9 8h9" />
    </>
  ),
  courses: (
    <>
      <path d="M12 6c-3-2-6-2-10-1v15c4-1 7-1 10 1m0-15c3-2 6-2 10-1v15c-4-1-7-1-10 1V6ZM5 9h3m-3 4h3m8-4h3m-3 4h3" />
    </>
  ),
};

export default function HomePage() {
  return (
    <main id="main-content" className="page activity-hub" tabIndex={-1}>
      <header className="activity-hub-heading">
        <h1>Ton ukrainien, à ta façon.</h1>
        <p className="page-description">
          Réviser, écouter, comprendre ou suivre un cours. Choisis ce que tu as
          envie de travailler aujourd’hui.
        </p>
      </header>
      <nav aria-label="Choisir une activité">
        <ul className="activity-hub-grid">
          {activities.map((activity) => (
            <li key={activity.id}>
              <Link
                className="activity-hub-link"
                href={activity.href}
                aria-labelledby={`activity-${activity.id}-title`}
                aria-describedby={`activity-${activity.id}-description`}
              >
                <svg
                  className="activity-hub-icon"
                  viewBox="0 0 24 24"
                  width="28"
                  height="28"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  {activityIcons[activity.id]}
                </svg>
                <h2 id={`activity-${activity.id}-title`}>{activity.title}</h2>
                <p id={`activity-${activity.id}-description`}>
                  {activity.description}
                </p>
                <span className="activity-hub-action">
                  {activity.action} <span aria-hidden="true">→</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </main>
  );
}
