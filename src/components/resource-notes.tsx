"use client";

import { useEffect, useRef, useState } from "react";
import { ResourceRequestError, updateResource } from "@/lib/resource-client";
import {
  RESOURCE_NOTES_MAX_LENGTH,
  type ResourceCommand,
  type ResourceState,
} from "@/lib/resource-types";
import { useUnsavedWork } from "@/lib/use-unsaved-work";

type NotesCommand = Extract<ResourceCommand, { type: "save-notes" }>;
type Copy = { notes: string; revision: number; pending: NotesCommand | null };
function readCopy(state: ResourceState): Copy | null {
  try {
    const raw = sessionStorage.getItem(`resource-notes:${state.resourceId}`);
    if (!raw || raw.length > 100_000) return null;
    const copy = JSON.parse(raw) as Copy;
    if (
      typeof copy.notes !== "string" ||
      copy.notes.length > RESOURCE_NOTES_MAX_LENGTH ||
      !Number.isSafeInteger(copy.revision) ||
      copy.revision < 0
    )
      return null;
    if (
      copy.pending &&
      (copy.pending.type !== "save-notes" ||
        copy.pending.resourceId !== state.resourceId ||
        copy.pending.notes !== copy.notes ||
        copy.pending.expectedRevision !== copy.revision ||
        typeof copy.pending.requestId !== "string")
    )
      copy.pending = null;
    return copy;
  } catch {
    return null;
  }
}

export function ResourceNotes({
  state,
  onState,
}: {
  state: ResourceState;
  onState: (state: ResourceState) => void;
}) {
  const [copy] = useState(() => readCopy(state));
  const received =
    !!copy?.pending &&
    copy.notes === state.notes &&
    state.notesRevision > copy.revision;
  const [notes, setNotes] = useState(
    received ? state.notes : (copy?.notes ?? state.notes),
  );
  const [saved, setSaved] = useState(
    copy && !received ? { ...state, notesRevision: copy.revision } : state,
  );
  const [pending, setPending] = useState<NotesCommand | null>(
    received ? null : (copy?.pending ?? null),
  );
  const [conflict, setConflict] = useState<ResourceState | null>(
    copy &&
      !received &&
      copy.revision !== state.notesRevision &&
      copy.notes !== state.notes
      ? state
      : null,
  );
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const mounted = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState(
    received
      ? "Tes notes avaient bien été enregistrées."
      : copy
        ? "Le brouillon de cet onglet a été retrouvé."
        : "",
  );
  const dirty = notes !== saved.notes || !!pending;
  useUnsavedWork(dirty);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    try {
      const key = `resource-notes:${state.resourceId}`;
      if (dirty)
        sessionStorage.setItem(
          key,
          JSON.stringify({
            notes,
            revision: pending?.expectedRevision ?? saved.notesRevision,
            pending,
          }),
        );
      else sessionStorage.removeItem(key);
    } catch {
      /* A private browser may deny storage; keep the editor in memory. */
    }
  }, [dirty, notes, saved.notesRevision, pending, state.resourceId]);

  async function save() {
    if (busyRef.current || conflict) return;
    const command: NotesCommand = pending ?? {
      type: "save-notes",
      requestId: crypto.randomUUID(),
      resourceId: state.resourceId,
      expectedRevision: saved.notesRevision,
      notes,
    };
    busyRef.current = true;
    setBusy(true);
    setPending(command);
    setError(null);
    setNotice("");
    try {
      const result = await updateResource(command);
      if (!mounted.current) return;
      onState(result.state);
      setPending(null);
      if (result.state.notes !== command.notes) {
        setConflict(result.state);
        setNotice(
          "L’envoi a été reçu, puis les notes ont changé dans un autre onglet. Ton texte reste dans les champs.",
        );
      } else {
        setSaved(result.state);
        setNotice("Notes enregistrées.");
      }
    } catch (failure) {
      if (!mounted.current) return;
      setError(
        failure instanceof Error
          ? failure.message
          : "Les notes n’ont pas pu être enregistrées.",
      );
      if (failure instanceof ResourceRequestError && failure.workspace)
        setConflict(failure.workspace.state);
      if (failure instanceof ResourceRequestError && failure.status === 400)
        setPending(null);
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  function resolve(useLocal: boolean) {
    if (!conflict) return;
    setSaved(conflict);
    onState(conflict);
    setPending(null);
    setConflict(null);
    setError(null);
    if (useLocal)
      setNotice(
        "Ton texte est conservé. Enregistre-le après comparaison pour remplacer les notes enregistrées.",
      );
    else {
      setNotes(conflict.notes);
      setNotice("La version enregistrée est affichée.");
    }
  }
  return (
    <section className="resource-notes" aria-labelledby="resource-notes-title">
      <h2 id="resource-notes-title">Mes notes d’écoute</h2>
      <p>
        Un mot reconnu, une difficulté ou une phrase à retrouver. Tes notes
        restent dans l’application.
      </p>
      <label htmlFor="resource-notes-text">Ce que je veux retenir</label>
      <textarea
        id="resource-notes-text"
        value={notes}
        maxLength={RESOURCE_NOTES_MAX_LENGTH}
        disabled={busy || !!pending || !!conflict}
        onChange={(event) => {
          setNotes(event.target.value);
          setNotice("");
        }}
        placeholder="Par exemple : je reconnais Привіт, mais je veux réécouter la réponse…"
      />
      {conflict && (
        <div className="resource-conflict" role="alert">
          <h3>Comparer les notes des deux onglets</h3>
          <p>
            Ton texte reste dans le champ. Version actuellement enregistrée :
          </p>
          <pre>{conflict.notes || "Aucune note."}</pre>
          <div className="resource-actions">
            <button type="button" onClick={() => resolve(true)}>
              Garder mon texte après comparaison
            </button>
            <button type="button" onClick={() => resolve(false)}>
              Utiliser les notes enregistrées
            </button>
          </div>
        </div>
      )}
      {error && (
        <p className="resource-error" role="alert">
          {error}
        </p>
      )}
      <div className="resource-actions">
        <button
          className="resource-primary"
          type="button"
          disabled={busy || !!conflict || !dirty}
          onClick={() => void save()}
        >
          {busy
            ? "Enregistrement…"
            : pending
              ? "Réessayer l’enregistrement"
              : "Enregistrer mes notes"}
        </button>
        <span className="resource-small">
          {dirty
            ? "Modifications à enregistrer."
            : "Les notes enregistrées se retrouvent après rechargement."}
        </span>
      </div>
      {notice && (
        <p className="resource-notice" role="status">
          {notice}
        </p>
      )}
    </section>
  );
}
