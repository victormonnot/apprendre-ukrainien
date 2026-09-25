"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { loadReviews } from "@/lib/review-client";
import type { ReviewOverview as Overview } from "@/lib/review-types";

export function ReviewOverview() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    loadReviews(controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setOverview(value);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, []);
  return (
    <section
      className="review-overview"
      aria-labelledby="review-overview-title"
    >
      <div>
        <h2 id="review-overview-title">Revenir sur ce que tu apprends</h2>
        <p>
          {failed
            ? "Le suivi des révisions est indisponible pour le moment."
            : !overview
              ? "Chargement des révisions…"
              : overview.active
                ? "Une carte t’attend là où tu l’as laissée."
                : overview.eligibleCount > 0
                  ? `${overview.eligibleCount} carte${overview.eligibleCount > 1 ? "s" : ""} disponible${overview.eligibleCount > 1 ? "s" : ""} pour tes révisions.`
                  : !overview.elements.some((element) => element.selected)
                    ? "Ajoute les mots, expressions et lettres que tu souhaites retenir."
                    : overview.nextAvailableAt
                      ? `Prochaine disponibilité : ${new Intl.DateTimeFormat("fr-FR", { timeZone: overview.timeZone, dateStyle: "medium", timeStyle: "short" }).format(new Date(overview.nextAvailableAt))} (heure de Paris).`
                      : "Les éléments ajoutés sont en pause."}
        </p>
      </div>
      <Link className="button button-secondary" href="/revisions">
        {overview?.active ? "Reprendre ma carte" : "Ouvrir mes révisions"}{" "}
        <span aria-hidden="true">↗</span>
      </Link>
    </section>
  );
}
