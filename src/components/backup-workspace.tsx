"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  BackupFile,
  BackupInspection,
  BackupSummary,
  RestoreResult,
} from "@/lib/backup-types";
import { BACKUP_MAX_BYTES } from "@/lib/backup-types";
import {
  appFetch,
  bootstrapWorkspace,
  acceptRestoredGeneration,
  getArchivedDrafts,
  exportArchivedDrafts,
} from "@/lib/workspace-client";
import { useUnsavedWork } from "@/lib/use-unsaved-work";
import "./backup-workspace.css";

type Overview = {
  generation: string;
  current: BackupSummary;
  files: BackupFile[];
};
type RestoreCommand = {
  inspectionId: string;
  sha256: string;
  requestId: string;
  expectedGeneration: string;
};
type Preparation = {
  inspection: BackupInspection;
  command: RestoreCommand | null;
};
const pendingKey = "backup-preparation";
function recovered(): Preparation | null {
  try {
    const raw = sessionStorage.getItem(pendingKey);
    if (!raw || raw.length > 20000) return null;
    const value = JSON.parse(raw) as Preparation;
    if (
      !value?.inspection?.id ||
      !value.inspection.sha256 ||
      !value.inspection.summary
    )
      return null;
    return value;
  } catch {
    return null;
  }
}
async function readResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(body?.message ?? "L’opération est indisponible. Réessaie.");
  if (!body)
    throw new Error(
      "La réponse est illisible. Réessaie sans fermer cette page.",
    );
  return body as T;
}
function size(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.ceil(bytes / 1024)} Ko`
    : `${(bytes / 1024 / 1024).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mio`;
}
function date(value: string) {
  return new Date(value).toLocaleString("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Paris",
  });
}
const summaryLabels: [keyof BackupSummary, string][] = [
  ["documentNotes", "notes de cours"],
  ["submittedExercises", "exercices remis"],
  ["activeCards", "cartes actives"],
  ["reviewAttempts", "évaluations de révision"],
  ["savedLanguageItems", "fiches de l’atelier"],
  ["audioClips", "sons conservés"],
  ["sceneAttempts", "essais au café"],
  ["resourceNotes", "notes d’écoute"],
  ["resourceBookmarks", "repères d’écoute"],
];
function Summary({ value }: { value: BackupSummary }) {
  return (
    <dl className="data-summary">
      {summaryLabels.map(([key, label]) => (
        <div key={key}>
          <dt>{label}</dt>
          <dd>{value[key]}</dd>
        </div>
      ))}
    </dl>
  );
}
export function BackupWorkspace() {
  const [initial] = useState(recovered);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [inspection, setInspection] = useState<BackupInspection | null>(
    initial?.inspection ?? null,
  );
  const [pending, setPending] = useState<RestoreCommand | null>(
    initial?.command ?? null,
  );
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [archives, setArchives] = useState(0);
  const [restored, setRestored] = useState<RestoreResult | null>(null);
  useUnsavedWork(!!pending);
  const refresh = useCallback(async () => {
    const value = await readResponse<Overview>(await appFetch("/api/backups"));
    setOverview(value);
    setArchives(getArchivedDrafts().length);
  }, []);
  useEffect(() => {
    void appFetch("/api/backups")
      .then((response) => readResponse<Overview>(response))
      .then((value) => {
        setOverview(value);
        setArchives(getArchivedDrafts().length);
      })
      .catch((failure: unknown) =>
        setError(
          failure instanceof Error
            ? failure.message
            : "Les données sont indisponibles.",
        ),
      );
  }, []);
  useEffect(() => {
    try {
      if (inspection)
        sessionStorage.setItem(
          pendingKey,
          JSON.stringify({ inspection, command: pending }),
        );
      else sessionStorage.removeItem(pendingKey);
    } catch {
      /* An unavailable tab store does not prevent a server backup. */
    }
  }, [inspection, pending]);
  async function run(task: string, action: () => Promise<void>) {
    if (busy) return;
    setBusy(task);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "L’opération n’a pas pu être terminée. Réessaie.",
      );
    } finally {
      setBusy("");
    }
  }
  async function download(file: BackupFile) {
    const response = await appFetch(
      `/api/backups/download?id=${encodeURIComponent(file.id)}`,
    );
    if (!response.ok) {
      await readResponse(response);
      return;
    }
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = url;
    link.download = `ukrainien-${file.createdAt.slice(0, 10)}-${file.id}.sqlite3`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function inspect(bytes: Blob) {
    if (bytes.size === 0 || bytes.size > BACKUP_MAX_BYTES)
      throw new Error("Choisis un fichier de sauvegarde de moins de 256 Mio.");
    const result = await readResponse<BackupInspection>(
      await appFetch("/api/backups/inspect", {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: bytes,
      }),
    );
    setInspection(result);
    setPending(null);
    setConfirmed(false);
    setNotice(
      "Le fichier a été vérifié. Ton travail actuel n’a pas été modifié.",
    );
  }
  async function restore() {
    if (!inspection || (!confirmed && !pending)) return;
    const command: RestoreCommand = pending ?? {
      inspectionId: inspection.id,
      sha256: inspection.sha256,
      requestId: crypto.randomUUID(),
      expectedGeneration: await bootstrapWorkspace(),
    };
    setPending(command);
    // Keep the exact command before sending, including across a tab reload.
    try {
      sessionStorage.setItem(
        pendingKey,
        JSON.stringify({ inspection, command }),
      );
    } catch {
      /* Memory still retains the retry. */
    }
    const response = await fetch("/api/backups/restore", {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "X-Workspace-Generation": command.expectedGeneration,
      },
      body: JSON.stringify(command),
    });
    if (!response.ok && [400, 404, 409, 410, 413].includes(response.status)) {
      setPending(null);
      setInspection(null);
      setConfirmed(false);
    }
    const result = await readResponse<RestoreResult>(response);
    setRestored(result);
    setPending(null);
    setInspection(null);
    setConfirmed(false);
    try {
      sessionStorage.removeItem(pendingKey);
    } catch {
      /* The committed receipt is authoritative. */
    }
  }
  if (restored)
    return (
      <section className="data-panel data-success" role="status">
        <p className="eyebrow">Restauration terminée</p>
        <h2>Le travail a été restauré</h2>
        <p>
          Les notes, réponses, cartes et sons du fichier sont à nouveau
          disponibles. Une sauvegarde de secours du travail précédent a été
          conservée dans Mes données.
        </p>
        <p>
          Recharge les autres onglets ouverts. Leurs brouillons seront conservés
          à part et pourront être téléchargés depuis cet espace.
        </p>
        <button
          className="data-primary"
          type="button"
          onClick={() =>
            void run("open", async () => {
              await acceptRestoredGeneration(restored.generation);
              // A full navigation drops all data and draft caches from the previous workspace.
              // eslint-disable-next-line @next/next/no-location-assign-relative-destination
              window.location.href = "/parcours";
            })
          }
        >
          Ouvrir le travail restauré
        </button>
        {error && <p role="alert">{error}</p>}
      </section>
    );
  return (
    <div className="data-workspace">
      <section className="data-panel data-current">
        <div>
          <p className="eyebrow">Enregistré dans l’application</p>
          <h2>Mon travail actuel</h2>
        </div>
        {overview ? (
          <>
            <Summary value={overview.current} />
            <p className="data-small">
              Audio conservé : {size(overview.current.audioBytes)}. Les
              brouillons déjà sauvegardés, les bilans et l’historique sont
              également inclus.
            </p>
          </>
        ) : (
          <p role="status">Chargement du suivi…</p>
        )}
        <p>
          Crée une copie, puis télécharge-la pour la conserver sur un autre
          support. Les copies laissées uniquement sur cet ordinateur ne
          protègent pas d’une perte de l’appareil.
        </p>
        <button
          className="data-primary"
          type="button"
          disabled={!!busy || !!pending || !overview}
          onClick={() =>
            void run("create", async () => {
              await readResponse<BackupFile>(
                await appFetch("/api/backups", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ type: "create" }),
                }),
              );
              await refresh();
              setNotice(
                "La sauvegarde est créée. Tu peux maintenant la télécharger.",
              );
            })
          }
        >
          {busy === "create" ? "Création…" : "Créer une sauvegarde"}
        </button>
      </section>
      {error && (
        <div className="data-error" role="alert">
          <p>{error}</p>
          {!overview && (
            <button type="button" onClick={() => void run("refresh", refresh)}>
              Réessayer le chargement
            </button>
          )}
        </div>
      )}
      {notice && (
        <p className="data-notice" role="status">
          {notice}
        </p>
      )}
      <section className="data-panel">
        <h2>Mes sauvegardes</h2>
        <p>
          Ces copies sont conservées sur l’ordinateur qui fait fonctionner
          l’application. Le fichier téléchargé contient tes données personnelles
          et tes sons, sans clé API.
        </p>
        {overview?.files.length ? (
          <ul className="data-files">
            {overview.files.map((file) => (
              <li key={file.id} data-backup-id={file.id}>
                <div>
                  <strong>
                    {file.kind === "safety"
                      ? "Avant une restauration"
                      : "Sauvegarde personnelle"}
                  </strong>
                  <span>
                    {date(file.createdAt)} · {size(file.sizeBytes)}
                  </span>
                </div>
                <div className="data-actions">
                  <button
                    type="button"
                    disabled={!!busy || !!pending}
                    onClick={() => void run("download", () => download(file))}
                  >
                    Télécharger
                  </button>
                  <button
                    type="button"
                    disabled={!!busy || !!pending}
                    onClick={() =>
                      void run("inspect", async () => {
                        const response = await appFetch(
                          `/api/backups/download?id=${encodeURIComponent(file.id)}`,
                        );
                        if (!response.ok) {
                          await readResponse(response);
                          return;
                        }
                        await inspect(await response.blob());
                      })
                    }
                  >
                    Vérifier cette sauvegarde
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="data-empty">Aucune sauvegarde créée pour le moment.</p>
        )}
      </section>
      <section className="data-panel">
        <h2>Retrouver une sauvegarde</h2>
        <p>
          Choisis un fichier créé par cette version de l’application. Il sera
          vérifié avant toute modification de ton travail.
        </p>
        <label className="data-file-label" htmlFor="backup-file">
          Choisir un fichier de sauvegarde
        </label>
        <input
          id="backup-file"
          type="file"
          accept=".sqlite3,application/vnd.sqlite3"
          disabled={!!busy || !!pending}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void run("inspect", () => inspect(file));
          }}
        />
        <p className="data-small">
          Format de sauvegarde .sqlite3 · 256 Mio maximum. Les fichiers externes
          des podcasts, les clés et les saisies non enregistrées ne sont pas
          inclus.
        </p>
      </section>
      {inspection && (
        <section
          className="data-panel data-inspection"
          aria-labelledby="backup-inspection-title"
        >
          <p className="eyebrow">
            Fichier vérifié · {size(inspection.sizeBytes)}
          </p>
          <h2 id="backup-inspection-title">Vérifier avant de restaurer</h2>
          <Summary value={inspection.summary} />
          <p>
            <strong>Ce fichier remplacera le travail actuel.</strong> Les deux
            historiques ne seront pas fusionnés. Une copie de secours de l’état
            actuel sera créée juste avant la restauration.
          </p>
          <p className="data-small">
            Cette préparation reste disponible jusqu’au{" "}
            {date(inspection.expiresAt)}.
          </p>
          <label className="data-confirm">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={!!busy || !!pending}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            Je veux remplacer le travail actuel par cette sauvegarde.
          </label>
          <div className="data-actions">
            <button
              className="data-restore"
              type="button"
              disabled={!!busy || (!confirmed && !pending)}
              onClick={() => void run("restore", restore)}
            >
              {busy === "restore"
                ? "Restauration…"
                : pending
                  ? "Réessayer la restauration"
                  : "Restaurer cette sauvegarde"}
            </button>
            {!pending && (
              <button
                type="button"
                disabled={!!busy}
                onClick={() => {
                  setInspection(null);
                  setConfirmed(false);
                  setNotice("");
                }}
              >
                Annuler
              </button>
            )}
          </div>
          {pending && (
            <p className="data-small">
              La confirmation précédente est conservée. Réessayer retrouve son
              résultat sans restaurer une seconde fois.
            </p>
          )}
        </section>
      )}
      {archives > 0 && (
        <section className="data-panel">
          <h2>Brouillons des états précédents</h2>
          <p>
            Des textes non enregistrés de cet onglet ont été mis à part après
            une restauration. Télécharge-les pour les consulter ; ils ne sont
            pas ajoutés au travail restauré.
          </p>
          <button type="button" onClick={exportArchivedDrafts}>
            Télécharger les anciens brouillons
          </button>
        </section>
      )}
      <p className="data-footer">
        Les sauvegardes conservent ce qui est enregistré sur le serveur. L’accès
        depuis plusieurs appareils sera configuré séparément.
      </p>
    </div>
  );
}
