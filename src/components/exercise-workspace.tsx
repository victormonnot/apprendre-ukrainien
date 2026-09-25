"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import {
  ExerciseConflictError,
  loadExercise,
  updateExercise,
} from "@/lib/exercise-client";
import {
  EXERCISE_FIELD_MAX_LENGTH,
  EXERCISE_WORK_NOTE_MAX_LENGTH,
  type ExerciseAid,
  type ExerciseAnswers,
  type ExerciseAttempt,
  type ExerciseDefinition,
  type ExerciseWorkspaceState,
} from "@/lib/exercise-types";
import { useUnsavedWork } from "@/lib/use-unsaved-work";
import "./exercise-workspace.css";

type Draft = {
  version: 1;
  attemptId: string;
  revision: number;
  definition: ExerciseDefinition;
  answers: ExerciseAnswers;
  workNote: string;
};

const aidLabels: Record<ExerciseAid, string> = {
  none: "Sans aide",
  resource: "Avec le cours ou une ressource",
  correction: "Après avoir consulté une correction",
};

const assessmentLabels = {
  corrected: "Correction disponible",
  partial: "Correction partielle",
  pending: "En attente de correction",
};

const fieldStatusLabels = {
  correct: "Réponse juste",
  incorrect: "À reprendre",
  pending: "À vérifier",
};

function draftKey(id: string) {
  return `exercise-draft:${id}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAid(value: unknown): value is ExerciseAid | null {
  return (
    value === null ||
    value === "none" ||
    value === "resource" ||
    value === "correction"
  );
}

function validDefinition(
  value: unknown,
  exerciseId: string,
): value is ExerciseDefinition {
  const text = (entry: unknown, limit = 2_000) =>
    typeof entry === "string" && entry.length <= limit;
  const identifier = (entry: unknown) =>
    typeof entry === "string" &&
    /^[a-zA-Z0-9_-]{1,80}$/.test(entry) &&
    !["__proto__", "constructor", "prototype"].includes(entry);
  if (
    !isRecord(value) ||
    value.id !== exerciseId ||
    !identifier(value.moduleId) ||
    !text(value.title) ||
    typeof value.number !== "number" ||
    !Number.isSafeInteger(value.number) ||
    value.number < 1 ||
    typeof value.version !== "number" ||
    !Number.isSafeInteger(value.version) ||
    value.version < 1 ||
    (value.guidance !== undefined && !text(value.guidance, 10_000)) ||
    !Array.isArray(value.items) ||
    value.items.length < 1 ||
    value.items.length > 100
  )
    return false;
  const itemIds = new Set();
  for (const item of value.items) {
    if (
      !isRecord(item) ||
      !identifier(item.id) ||
      itemIds.has(item.id) ||
      !text(item.label) ||
      !Array.isArray(item.fields) ||
      item.fields.length < 1 ||
      item.fields.length > 20
    )
      return false;
    itemIds.add(item.id);
    const fieldIds = new Set();
    for (const field of item.fields) {
      if (
        !isRecord(field) ||
        !identifier(field.id) ||
        fieldIds.has(field.id) ||
        !text(field.label) ||
        (field.multiline !== undefined && typeof field.multiline !== "boolean")
      )
        return false;
      fieldIds.add(field.id);
      if (
        field.options !== undefined &&
        (!Array.isArray(field.options) ||
          field.options.length > 100 ||
          !field.options.every(
            (option) =>
              isRecord(option) && text(option.value) && text(option.label),
          ))
      )
        return false;
    }
  }
  return true;
}

function readDraft(definition: ExerciseDefinition): Draft | null {
  try {
    const stored = sessionStorage.getItem(draftKey(definition.id));
    if (!stored || stored.length > 500_000) return null;
    const value: unknown = JSON.parse(stored);
    if (
      !isRecord(value) ||
      value.version !== 1 ||
      typeof value.attemptId !== "string" ||
      !value.attemptId ||
      value.attemptId.length > 200 ||
      typeof value.revision !== "number" ||
      !Number.isSafeInteger(value.revision) ||
      value.revision < 1 ||
      typeof value.workNote !== "string" ||
      value.workNote.length > EXERCISE_WORK_NOTE_MAX_LENGTH ||
      !validDefinition(value.definition, definition.id) ||
      !isRecord(value.answers) ||
      Object.keys(value.answers).length !== value.definition.items.length
    )
      return null;
    const answers: ExerciseAnswers = {};
    for (const item of value.definition.items) {
      const answer = value.answers[item.id];
      if (
        !isRecord(answer) ||
        !isAid(answer.aid) ||
        !isRecord(answer.fields) ||
        Object.keys(answer.fields).length !== item.fields.length
      )
        return null;
      const fields: Record<string, string> = {};
      for (const field of item.fields) {
        const text = answer.fields[field.id];
        if (
          typeof text !== "string" ||
          text.length > EXERCISE_FIELD_MAX_LENGTH ||
          (text !== "" &&
            field.options &&
            !field.options.some((option) => option.value === text))
        )
          return null;
        fields[field.id] = text;
      }
      answers[item.id] = { aid: answer.aid, fields };
    }
    return {
      version: 1,
      attemptId: value.attemptId,
      revision: value.revision,
      definition: value.definition,
      answers,
      workNote: value.workNote,
    };
  } catch {
    return null;
  }
}

function fromAttempt(attempt: ExerciseAttempt | null): Draft | null {
  return attempt
    ? {
        version: 1,
        attemptId: attempt.id,
        revision: attempt.revision,
        definition: attempt.definition,
        answers: attempt.answers,
        workNote: attempt.workNote,
      }
    : null;
}

function sameAnswers(left: Draft, right: ExerciseAttempt) {
  return (
    left.attemptId === right.id &&
    left.revision === right.revision &&
    left.definition.version === right.definitionVersion &&
    left.workNote === right.workNote &&
    left.definition.items.every(
      (item) =>
        left.answers[item.id]?.aid === right.answers[item.id]?.aid &&
        item.fields.every(
          (field) =>
            left.answers[item.id]?.fields[field.id] ===
            right.answers[item.id]?.fields[field.id],
        ),
    )
  );
}

function savedDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "L’enregistrement est indisponible. Ton brouillon reste disponible ici.";
}

function readableAnswers(
  definition: ExerciseDefinition,
  draft: Pick<Draft, "answers" | "workNote">,
) {
  return (
    definition.items
      .map((item) => {
        const answer = draft.answers[item.id];
        return [
          item.label,
          ...item.fields.map((field) => {
            const value = answer?.fields[field.id] ?? "";
            return `${field.label} : ${field.options?.find((option) => option.value === value)?.label ?? value}`;
          }),
          `Aide : ${answer?.aid ? aidLabels[answer.aid] : "Non précisée"}`,
        ].join("\n");
      })
      .join("\n\n") +
    (draft.workNote ? `\n\nNote sur le travail : ${draft.workNote}` : "")
  );
}

function AttemptResult({
  attempt,
  reveal,
}: {
  attempt: ExerciseAttempt;
  reveal: boolean;
}) {
  const summaryRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (reveal) summaryRef.current?.focus();
  }, [reveal]);
  return (
    <details className="exercise-attempt" open={reveal || undefined}>
      <summary ref={summaryRef}>
        <span>
          Remise {attempt.number} ·{" "}
          {attempt.assessment
            ? assessmentLabels[attempt.assessment.status]
            : "En attente de correction"}
        </span>
        <span className="exercise-summary-date">
          {savedDate(attempt.submittedAt ?? attempt.updatedAt)}
        </span>
      </summary>
      <div className="exercise-attempt-body">
        <p className="exercise-hint">
          Réponses conservées telles que remises.{" "}
          {attempt.retryOf
            ? "Réessai après une remise précédente."
            : "Première tentative."}{" "}
          Version {attempt.definitionVersion} de l’exercice.
        </p>
        {attempt.assessment?.status !== "corrected" && (
          <p className="exercise-hint">
            Les réponses « À vérifier » ne sont pas évaluées automatiquement. Tu
            peux demander une relecture dans l’atelier ; ce retour généré reste
            distinct de la correction et de tes réponses d’origine.
          </p>
        )}
        <p className="exercise-hint">
          <Link
            href={`/atelier?exercise=${encodeURIComponent(attempt.exerciseId)}&attempt=${encodeURIComponent(attempt.id)}`}
          >
            Relire cette remise dans l’atelier
          </Link>
        </p>
        {attempt.definition.items.map((item) => {
          const answer = attempt.answers[item.id];
          const assessment = attempt.assessment?.items.find(
            (entry) => entry.itemId === item.id,
          );
          return (
            <div className="exercise-result-item" key={item.id}>
              <p className="exercise-item-title">{item.label}</p>
              <p className="exercise-aid">
                Conditions :{" "}
                {answer?.aid ? aidLabels[answer.aid] : "Aide non précisée"}.
              </p>
              <dl className="exercise-result-fields">
                {item.fields.map((field) => {
                  const feedback = assessment?.fields.find(
                    (entry) => entry.fieldId === field.id,
                  );
                  const value = answer?.fields[field.id] ?? "";
                  return (
                    <div key={field.id}>
                      <dt>{field.label}</dt>
                      <dd className="exercise-answer">
                        {field.options?.find((option) => option.value === value)
                          ?.label ?? value}
                      </dd>
                      <dd
                        className={`exercise-feedback exercise-feedback-${feedback?.status ?? "pending"}`}
                      >
                        <strong>
                          {fieldStatusLabels[feedback?.status ?? "pending"]}
                        </strong>
                        <span>
                          {feedback?.feedback ??
                            "Cette réponse attend une vérification."}
                        </span>
                        {feedback?.expected && (
                          <span>
                            {feedback.status === "pending"
                              ? "Réponse de référence (ta variante reste à vérifier)"
                              : "Repère de correction"}{" "}
                            : {feedback.expected}
                          </span>
                        )}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </div>
          );
        })}
        {attempt.workNote && (
          <div className="exercise-work-note">
            <strong>Note sur mon travail</strong>
            <p>{attempt.workNote}</p>
          </div>
        )}
      </div>
    </details>
  );
}

function ExerciseEditor({
  definition,
  initialState,
}: {
  definition: ExerciseDefinition;
  initialState: ExerciseWorkspaceState;
}) {
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [focusDraft, setFocusDraft] = useState(0);
  const [restoredDraft] = useState(() => readDraft(definition));
  const [workspace, setWorkspace] = useState(initialState);
  const [draft, setDraft] = useState(
    () => restoredDraft ?? fromAttempt(initialState.draft),
  );
  const [conflict, setConflict] = useState<ExerciseWorkspaceState | null>(() =>
    restoredDraft &&
    (!initialState.draft ||
      restoredDraft.attemptId !== initialState.draft.id ||
      restoredDraft.revision !== initialState.draft.revision)
      ? initialState
      : null,
  );
  const [pending, setPending] = useState<"start" | "save" | "submit" | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState(
    restoredDraft ? "Brouillon non enregistré retrouvé dans cet onglet." : "",
  );
  const [revealedAttempt, setRevealedAttempt] = useState<string | null>(null);
  const dirty =
    !!draft && (!workspace.draft || !sameAnswers(draft, workspace.draft));
  const submissions = workspace.attempts
    .filter((attempt) => attempt.status === "submitted")
    .toSorted((left, right) => right.number - left.number);
  const latestSubmission = submissions[0];
  const outdatedDraft =
    !!draft && draft.definition.version !== definition.version;
  const outdatedServerDraft =
    !!conflict?.draft &&
    conflict.draft.definitionVersion !== definition.version;

  useUnsavedWork(dirty);

  useEffect(() => {
    if (focusDraft > 0)
      formRef.current
        ?.querySelector<HTMLElement>("input, textarea, select")
        ?.focus();
  }, [focusDraft]);

  useEffect(() => {
    try {
      if (draft && dirty)
        sessionStorage.setItem(draftKey(definition.id), JSON.stringify(draft));
      else sessionStorage.removeItem(draftKey(definition.id));
    } catch {
      // The editable draft remains available if temporary browser storage is unavailable.
    }
  }, [definition.id, draft, dirty]);

  function acceptState(next: ExerciseWorkspaceState) {
    setWorkspace(next);
    setDraft(fromAttempt(next.draft));
    setConflict(null);
    setError(null);
  }

  function failedRequest(cause: unknown) {
    if (cause instanceof ExerciseConflictError) {
      setConflict(cause.workspace);
      setError(null);
      setMessage("");
    } else setError(errorMessage(cause));
  }

  async function startAttempt() {
    if (pending || draft || conflict) return;
    setPending("start");
    setError(null);
    try {
      const next = await updateExercise(definition.id, {
        type: "start",
        ...(latestSubmission ? { retryOf: latestSubmission.id } : {}),
      });
      acceptState(next);
      setFocusDraft((value) => value + 1);
      setMessage(
        latestSubmission
          ? "Nouveau réessai prêt. Les réponses précédentes restent dans l’historique."
          : "Brouillon créé. Tu peux répondre à ton rythme.",
      );
    } catch (cause) {
      failedRequest(cause);
    } finally {
      setPending(null);
    }
  }

  async function saveAttempt(type: "save" | "submit") {
    if (!draft || pending || conflict || outdatedDraft) return;
    if (
      type === "submit" &&
      draft.definition.items.some(
        (item) =>
          draft.answers[item.id]?.aid === null ||
          item.fields.some(
            (field) => !draft.answers[item.id]?.fields[field.id]?.trim(),
          ),
      )
    ) {
      setError(
        "Complète chaque réponse et indique l’aide utilisée pour chaque question avant de remettre l’exercice.",
      );
      const fields = formRef.current?.querySelectorAll<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >("fieldset input, fieldset textarea, fieldset select");
      Array.from(fields ?? [])
        .find((field) => !field.value.trim())
        ?.focus();
      return;
    }
    setPending(type);
    setError(null);
    setMessage("");
    try {
      const next = await updateExercise(definition.id, {
        type,
        attemptId: draft.attemptId,
        expectedRevision: draft.revision,
        answers: draft.answers,
        workNote: draft.workNote,
      });
      acceptState(next);
      if (type === "submit") {
        setRevealedAttempt(draft.attemptId);
        setMessage(
          "Exercice remis. Tes réponses sont conservées et la correction disponible apparaît ci-dessous.",
        );
      } else setMessage("Brouillon enregistré.");
    } catch (cause) {
      failedRequest(cause);
    } finally {
      setPending(null);
    }
  }

  function updateField(itemId: string, fieldId: string, value: string) {
    setDraft((current) => {
      const answer = current?.answers[itemId];
      if (!current || !answer) return current;
      return {
        ...current,
        answers: {
          ...current.answers,
          [itemId]: {
            ...answer,
            fields: { ...answer.fields, [fieldId]: value },
          },
        },
      };
    });
    setMessage("");
  }

  function updateAid(itemId: string, value: string) {
    const aid = value === "" ? null : (value as ExerciseAid);
    setDraft((current) => {
      const answer = current?.answers[itemId];
      if (!current || !answer) return current;
      return {
        ...current,
        answers: { ...current.answers, [itemId]: { ...answer, aid } },
      };
    });
    setMessage("");
  }

  return (
    <div className="exercise-editor">
      <p className="exercise-introduction">
        Tu peux répondre ici ou recopier ton travail sur papier. Enregistre ton
        brouillon pour le retrouver dans le cours et la fiche d’exercices.
      </p>
      {(draft?.definition ?? definition).guidance && (
        <p className="exercise-guidance">
          {(draft?.definition ?? definition).guidance}
        </p>
      )}
      {outdatedDraft && draft && (
        <section
          className="exercise-conflict"
          aria-labelledby={`${id}-outdated-title`}
        >
          <h4 id={`${id}-outdated-title`}>
            Ce brouillon appartient à une ancienne version de l’exercice
          </h4>
          <p role="alert">
            Tes réponses restent visibles et copiables. Leur enregistrement et
            leur remise sont suspendus : la consigne a changé depuis la création
            de ce brouillon. Recharger la page ne résout pas ce changement de
            version.
          </p>
          <div className="exercise-input-group">
            <label htmlFor={`${id}-outdated-copy`}>
              Copie de mes réponses à conserver
            </label>
            <textarea
              id={`${id}-outdated-copy`}
              readOnly
              rows={7}
              value={readableAnswers(draft.definition, draft)}
            />
          </div>
        </section>
      )}
      {!draft && !conflict && (
        <button
          className="button button-primary"
          type="button"
          disabled={!!pending}
          onClick={() => void startAttempt()}
        >
          {pending === "start"
            ? "Ouverture…"
            : latestSubmission
              ? "Réessayer l’exercice"
              : "Commencer l’exercice"}
        </button>
      )}
      {draft && (
        <form
          ref={formRef}
          className="exercise-form"
          onSubmit={(event) => {
            event.preventDefault();
            void saveAttempt("submit");
          }}
        >
          <div className="exercise-draft-heading">
            <strong>
              {workspace.draft?.id === draft.attemptId
                ? `Tentative ${workspace.draft.number} · Brouillon`
                : "Brouillon de cet onglet"}
            </strong>
            {workspace.draft?.retryOf && (
              <span>
                Réessai après une remise précédente : reprends sans recopier la
                correction, puis indique l’aide réellement utilisée.
              </span>
            )}
          </div>
          {draft.definition.items.map((item, index) => (
            <fieldset
              className="exercise-item"
              key={item.id}
              disabled={!!pending}
            >
              <legend>
                {index + 1}. {item.label}
              </legend>
              {item.fields.map((field) => {
                const fieldId = `${id}-${item.id}-${field.id}`;
                const value = draft.answers[item.id]?.fields[field.id] ?? "";
                return (
                  <div className="exercise-input-group" key={field.id}>
                    <label htmlFor={fieldId}>{field.label}</label>
                    {field.options ? (
                      <select
                        id={fieldId}
                        value={value}
                        onChange={(event) =>
                          updateField(item.id, field.id, event.target.value)
                        }
                        required
                      >
                        <option value="">Choisir une réponse</option>
                        {field.options.map((option) => (
                          <option value={option.value} key={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    ) : field.multiline ? (
                      <textarea
                        id={fieldId}
                        value={value}
                        onChange={(event) =>
                          updateField(item.id, field.id, event.target.value)
                        }
                        rows={3}
                        maxLength={EXERCISE_FIELD_MAX_LENGTH}
                        required
                        autoCapitalize="off"
                        spellCheck={false}
                      />
                    ) : (
                      <input
                        id={fieldId}
                        value={value}
                        onChange={(event) =>
                          updateField(item.id, field.id, event.target.value)
                        }
                        maxLength={EXERCISE_FIELD_MAX_LENGTH}
                        required
                        autoComplete="off"
                        autoCapitalize="off"
                        spellCheck={false}
                      />
                    )}
                  </div>
                );
              })}
              <div className="exercise-input-group exercise-aid-input">
                <label htmlFor={`${id}-${item.id}-aid`}>
                  Aide utilisée pour cette question
                </label>
                <select
                  id={`${id}-${item.id}-aid`}
                  value={draft.answers[item.id]?.aid ?? ""}
                  onChange={(event) => updateAid(item.id, event.target.value)}
                  required
                >
                  <option value="">Préciser les conditions</option>
                  {Object.entries(aidLabels).map(([value, label]) => (
                    <option value={value} key={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </fieldset>
          ))}
          <div className="exercise-input-group">
            <label htmlFor={`${id}-work-note`}>
              Note sur mon travail (facultatif)
            </label>
            <textarea
              id={`${id}-work-note`}
              rows={3}
              maxLength={EXERCISE_WORK_NOTE_MAX_LENGTH}
              value={draft.workNote}
              disabled={!!pending}
              onChange={(event) => {
                setDraft({ ...draft, workNote: event.target.value });
                setMessage("");
              }}
              aria-describedby={`${id}-note-hint`}
            />
            <p className="exercise-hint" id={`${id}-note-hint`}>
              Une hésitation, une ressource utilisée, un point à vérifier… 2 000
              caractères maximum.
            </p>
          </div>
          <p className="exercise-hint" id={`${id}-submission-hint`}>
            Après remise, tes réponses sont conservées sans modification.
            Certaines réponses écrites peuvent être vérifiées automatiquement ;
            les réponses libres et la prononciation demandent une vérification
            distincte. Aucun audio n’est évalué.
          </p>
          <div className="exercise-actions">
            <button
              className="button button-secondary"
              type="button"
              disabled={!!pending || !!conflict || outdatedDraft || !dirty}
              onClick={() => void saveAttempt("save")}
            >
              {pending === "save"
                ? "Enregistrement…"
                : "Enregistrer le brouillon"}
            </button>
            <button
              className="button button-primary"
              type="submit"
              disabled={!!pending || !!conflict || outdatedDraft}
              aria-describedby={`${id}-submission-hint`}
            >
              {pending === "submit"
                ? "Remise en cours…"
                : "Remettre l’exercice"}
            </button>
          </div>
          <p className="exercise-hint">
            {outdatedDraft
              ? "Les réponses locales sont gardées temporairement dans cet onglet. Copie-les avant de le fermer si elles ne sont pas déjà enregistrées."
              : dirty
                ? "Modifications non enregistrées. Le navigateur peut garder un brouillon temporaire dans cet onglet ; utilise le bouton pour le sauvegarder durablement."
                : workspace.draft
                  ? `Brouillon enregistré le ${savedDate(workspace.draft.updatedAt)}.`
                  : ""}
          </p>
        </form>
      )}
      <p className="exercise-status" role="status">
        {message}
      </p>
      {error && (
        <p className="exercise-error" role="alert">
          {error}
        </p>
      )}
      {conflict && (
        <section
          className="exercise-conflict"
          aria-labelledby={`${id}-conflict-title`}
        >
          <h4 id={`${id}-conflict-title`}>Une autre version est enregistrée</h4>
          <p role="alert">
            Cet exercice a changé dans un autre onglet. Compare les deux
            versions avant de continuer. Aucune réponse locale n’a été envoyée
            pour remplacer cette version.
          </p>
          {draft && (
            <div className="exercise-input-group">
              <label htmlFor={`${id}-local-copy`}>
                Mes réponses dans cet onglet — à copier si besoin
              </label>
              <textarea
                id={`${id}-local-copy`}
                readOnly
                rows={7}
                value={readableAnswers(draft.definition, draft)}
              />
            </div>
          )}
          <div className="exercise-server-version">
            <strong>Version enregistrée</strong>
            {conflict.draft ? (
              <>
                <p>
                  Brouillon, tentative {conflict.draft.number}, enregistré le{" "}
                  {savedDate(conflict.draft.updatedAt)}.
                </p>
                <pre>
                  {readableAnswers(conflict.draft.definition, conflict.draft)}
                </pre>
              </>
            ) : (
              <>
                <p>
                  Il n’y a plus de brouillon actif.
                  {conflict.attempts.length > 0
                    ? " Une remise a déjà été enregistrée ; elle reste inchangée."
                    : " Aucun exercice n’a encore été remis."}
                </p>
                {conflict.attempts
                  .filter((attempt) => attempt.status === "submitted")
                  .toSorted((left, right) => right.number - left.number)
                  .slice(0, 1)
                  .map((attempt) => (
                    <pre key={attempt.id}>
                      {readableAnswers(attempt.definition, attempt)}
                    </pre>
                  ))}
              </>
            )}
          </div>
          {outdatedServerDraft ? (
            <p className="exercise-hint">
              Le brouillon enregistré utilise une ancienne consigne. Il reste
              conservé ; charger cette version ne permettrait pas encore de le
              remettre avec la nouvelle consigne. Garde une copie de tes
              réponses.
            </p>
          ) : (
            <>
              <button
                className="button button-secondary"
                type="button"
                disabled={!!pending}
                aria-describedby={`${id}-replace-hint`}
                onClick={() => {
                  acceptState(conflict);
                  setMessage("Version enregistrée chargée.");
                }}
              >
                Charger la version enregistrée
              </button>
              <p className="exercise-hint" id={`${id}-replace-hint`}>
                Ce choix remplace le brouillon de cet onglet par la version
                enregistrée. Copie d’abord les réponses locales que tu souhaites
                garder ; tu pourras les reporter dans le brouillon ou un nouveau
                réessai.
              </p>
            </>
          )}
        </section>
      )}
      {submissions.length > 0 && (
        <section
          className="exercise-history"
          aria-label={`Historique de l’exercice ${definition.number}`}
        >
          <p className="exercise-history-title">Mes remises</p>
          {submissions.map((attempt) => (
            <AttemptResult
              key={attempt.id}
              attempt={attempt}
              reveal={attempt.id === revealedAttempt}
            />
          ))}
        </section>
      )}
    </div>
  );
}

function UnavailableDraftCopy({
  definition,
}: {
  definition: ExerciseDefinition;
}) {
  const id = useId();
  const [draft] = useState(() => readDraft(definition));
  useUnsavedWork(!!draft);
  if (!draft) return null;
  return (
    <div className="exercise-input-group">
      <label htmlFor={`${id}-recovery-copy`}>
        Brouillon retrouvé dans cet onglet — copie de secours
      </label>
      <textarea
        id={`${id}-recovery-copy`}
        rows={7}
        readOnly
        value={readableAnswers(draft.definition, draft)}
      />
      <p className="exercise-hint">
        Ces réponses restent dans cet onglet. Le chargement doit réussir avant
        de reprendre leur modification et de vérifier la version enregistrée.
      </p>
    </div>
  );
}

export function ExerciseWorkspace({
  definition,
}: {
  definition: ExerciseDefinition;
}) {
  const [open, setOpen] = useState(false);
  const [workspace, setWorkspace] = useState<ExerciseWorkspaceState | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!open || workspace) return;
    const controller = new AbortController();
    loadExercise(definition.id, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) {
          setWorkspace(value);
          setError(null);
        }
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(errorMessage(cause));
      });
    return () => controller.abort();
  }, [definition.id, open, workspace, reload]);

  return (
    <details
      className="exercise-workspace"
      data-exercise-id={definition.id}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary
        aria-label={`Répondre dans l’application — exercice ${definition.number}`}
      >
        <span>Répondre dans l’application</span>
        <span className="exercise-summary-hint">
          Exercice {definition.number}
        </span>
      </summary>
      {workspace ? (
        <ExerciseEditor definition={definition} initialState={workspace} />
      ) : (
        <div className="exercise-loading">
          {error ? (
            <>
              <p className="exercise-error" role="alert">
                {error}
              </p>
              <UnavailableDraftCopy definition={definition} />
              <button
                className="button button-secondary"
                type="button"
                onClick={() => {
                  setError(null);
                  setReload((current) => current + 1);
                }}
              >
                Réessayer le chargement
              </button>
            </>
          ) : (
            <p role="status">Chargement de ton travail…</p>
          )}
        </div>
      )}
    </details>
  );
}
