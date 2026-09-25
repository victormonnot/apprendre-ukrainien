"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  bootstrapWorkspace,
  exportCurrentDrafts,
} from "@/lib/workspace-client";

export function WorkspaceBoundary({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [changed, setChanged] = useState(false);
  useEffect(() => {
    let active = true;
    bootstrapWorkspace()
      .then(() => {
        if (active) {
          setReady(true);
          setError("");
        }
      })
      .catch((failure: unknown) => {
        if (active)
          setError(
            failure instanceof Error
              ? failure.message
              : "Le suivi personnel est momentanément indisponible. Réessaie lorsque l’application répond.",
          );
      });
    const onChanged = () => setChanged(true);
    window.addEventListener("workspace-changed", onChanged);
    return () => {
      active = false;
      window.removeEventListener("workspace-changed", onChanged);
    };
  }, [attempt]);
  if (!ready)
    return (
      <main id="main-content" className="page" tabIndex={-1}>
        <p role={error ? "alert" : "status"}>
          {error || "Ouverture de ton espace…"}
        </p>
        {error && (
          <>
            <button
              type="button"
              onClick={() => setAttempt((value) => value + 1)}
            >
              Réessayer
            </button>{" "}
            <button type="button" onClick={exportCurrentDrafts}>
              Télécharger les brouillons de cet onglet
            </button>
          </>
        )}
      </main>
    );
  return (
    <>
      {changed && (
        <section className="workspace-change-notice" role="alert">
          <strong>Une sauvegarde a été restaurée.</strong>
          <p>
            Cette page correspond à l’ancien état. Tes champs restent visibles ;
            recharge pour retrouver le travail restauré. Les brouillons de cet
            onglet seront conservés à part dans Mes données.
          </p>
          <button type="button" onClick={() => window.location.reload()}>
            Recharger l’application
          </button>{" "}
          <button type="button" onClick={exportCurrentDrafts}>
            Télécharger les brouillons de cet onglet
          </button>
        </section>
      )}
      {children}
    </>
  );
}
