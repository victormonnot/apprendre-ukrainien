"use client";

import { useWorkspaceStorage } from "@/lib/use-workspace-storage";

import { PersonalGate } from "./auth-context";

import { AudioPlayer } from "@/components/audio-player";
import { documentHref, getModule, modules } from "@/content/catalog";
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import Markdown from "react-markdown";
import {
  loadReviews,
  ReviewRequestError,
  updateReviews,
} from "@/lib/review-client";
import {
  REVIEW_ANSWER_MAX_LENGTH,
  reviewDirectionLabels,
  reviewRatingLabels,
  type ReviewCommand,
  type ReviewOverview,
  type ReviewRating,
} from "@/lib/review-types";
import { useUnsavedWork } from "@/lib/use-unsaved-work";
import { rehypeUkrainianLanguage } from "@/lib/markdown";
import "./review-workspace.css";

type LocalDraft = { attemptId: string; answerText: string };
type SessionMode = "scheduled" | "continuous" | "finish";
type RequestFailure = {
  message: string;
  conflict: boolean;
  command?: ReviewCommand;
};

const draftPrefix = "ukrainian-review-draft:";
const sessionModeKey = "ukrainian-review-session-mode";
const groups = [
  { kind: "letter", title: "Les lettres" },
  { kind: "word", title: "Les mots" },
  { kind: "expression", title: "Les formules" },
] as const;

const ratingDescriptions: Record<ReviewRating, string> = {
  again: "Oubli, erreur ou aide consultée",
  hard: "Réponse juste, avec peine, sans aide",
  good: "Réponse juste, sans aide",
  easy: "Réponse immédiate, sans aide",
};

function savedDrafts(storage: Storage): LocalDraft[] {
  const drafts: LocalDraft[] = [];
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (!key?.startsWith(draftPrefix)) continue;
    const answerText = storage.getItem(key);
    const attemptId = key.slice(draftPrefix.length);
    if (
      attemptId.length > 0 &&
      attemptId.length <= 100 &&
      answerText &&
      answerText.length <= REVIEW_ANSWER_MAX_LENGTH
    )
      drafts.push({ attemptId, answerText });
  }
  return drafts;
}

function fullDate(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(value));
}

function intervalLabel(value: string, now: string) {
  if (new Date(value).getTime() <= new Date(now).getTime())
    return "Échéance atteinte";
  const minutes = Math.max(
    1,
    Math.round((new Date(value).getTime() - new Date(now).getTime()) / 60_000),
  );
  if (minutes < 60) return `Dans ${minutes} min`;
  if (minutes < 24 * 60) return `Dans ${Math.round(minutes / 60)} h`;
  const days = Math.round(minutes / (24 * 60));
  return `Dans ${days} jour${days > 1 ? "s" : ""}`;
}

export function ReviewWorkspace({
  initialModuleId,
}: {
  initialModuleId?: string;
}) {
  return (
    <PersonalGate>
      <ReviewWorkspaceContent initialModuleId={initialModuleId} />
    </PersonalGate>
  );
}

function ReviewWorkspaceContent({
  initialModuleId,
}: {
  initialModuleId?: string;
}) {
  const storage = useWorkspaceStorage();
  const [moduleId, setModuleId] = useState(initialModuleId ?? "all");
  const [overview, setOverview] = useState<ReviewOverview | null>(null);
  const [answerText, setAnswerText] = useState("");
  const [recovered, setRecovered] = useState<LocalDraft[]>([]);
  const [failure, setFailure] = useState<RequestFailure | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [storageWarning, setStorageWarning] = useState(false);
  const [reload, setReload] = useState(0);
  const [sessionMode, setSessionMode] = useState<SessionMode>("scheduled");
  const currentSessionMode = useRef<SessionMode>("scheduled");
  const requestLock = useRef(false);
  const requestVersion = useRef(0);
  const memoryDrafts = useRef(new Map<string, string>());
  const cardHeading = useRef<HTMLHeadingElement>(null);
  const answerHeading = useRef<HTMLHeadingElement>(null);
  const summaryHeading = useRef<HTMLHeadingElement>(null);
  const hadActiveCard = useRef(false);
  const answerId = useId();
  const active = overview?.active;
  const selectedModule = getModule(moduleId);
  const shownElements =
    overview?.elements.filter(
      (element) => moduleId === "all" || element.moduleId === moduleId,
    ) ?? [];
  const shownPacks =
    overview?.packs.filter(
      (pack) => moduleId === "all" || pack.moduleId === moduleId,
    ) ?? [];
  const revealed = active?.revealed;
  const activeId = active?.id;
  const activeStatus = active?.status;
  const unresolved = Boolean(failure?.command || failure?.conflict);
  const disabled = busy || loading || unresolved;
  const dirty = active?.status === "presented" && answerText.length > 0;
  useUnsavedWork(Boolean(dirty));

  const chooseSessionMode = useCallback(
    (mode: SessionMode) => {
      currentSessionMode.current = mode;
      setSessionMode(mode);
      try {
        storage.setItem(sessionModeKey, mode);
      } catch {
        setStorageWarning(true);
      }
    },
    [storage],
  );

  const applyOverview = useCallback(
    (next: ReviewOverview) => {
      const combined = new Map<string, string>();
      try {
        for (const draft of savedDrafts(storage))
          combined.set(draft.attemptId, draft.answerText);
      } catch {
        setStorageWarning(true);
      }
      for (const [attemptId, value] of memoryDrafts.current)
        combined.set(attemptId, value);
      for (const [attemptId, value] of combined) {
        const saved =
          next.active?.id === attemptId && next.active.status === "revealed"
            ? next.active.answerText
            : next.recent.find((entry) => entry.id === attemptId)?.answerText;
        if (saved !== value) continue;
        combined.delete(attemptId);
        try {
          storage.removeItem(draftPrefix + attemptId);
        } catch {
          setStorageWarning(true);
        }
      }
      memoryDrafts.current = combined;
      const drafts = [...combined].map(([attemptId, value]) => ({
        attemptId,
        answerText: value,
      }));
      const current = next.active;
      const local = drafts.find((draft) => draft.attemptId === current?.id);
      setAnswerText(
        current?.status === "presented" ? (local?.answerText ?? "") : "",
      );
      setRecovered(
        drafts.filter(
          (draft) =>
            draft.attemptId !== current?.id ||
            (current.status === "revealed" &&
              draft.answerText !== current.answerText),
        ),
      );
      setOverview(next);
    },
    [storage],
  );

  useEffect(() => {
    const controller = new AbortController();
    const version = ++requestVersion.current;
    requestLock.current = true;
    loadReviews(controller.signal)
      .then((next) => {
        if (controller.signal.aborted || version !== requestVersion.current)
          return;
        try {
          const saved = storage.getItem(sessionModeKey);
          if (
            saved === "continuous" ||
            saved === "finish" ||
            saved === "scheduled"
          ) {
            currentSessionMode.current = saved;
            setSessionMode(saved);
          } else if (next.active?.mode === "practice") {
            chooseSessionMode("continuous");
          }
        } catch {
          setStorageWarning(true);
        }
        applyOverview(next);
        setFailure(null);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted && version === requestVersion.current)
          setFailure((previous) => ({
            ...previous,
            message:
              cause instanceof Error
                ? cause.message
                : "Les révisions sont indisponibles pour le moment.",
            conflict: previous?.conflict ?? false,
          }));
      })
      .finally(() => {
        if (!controller.signal.aborted && version === requestVersion.current) {
          requestLock.current = false;
          setLoading(false);
        }
      });
    return () => {
      controller.abort();
      // Leaving the page must not reserve another card after an in-flight rating.
      requestVersion.current += 1;
    };
  }, [reload, applyOverview, chooseSessionMode, storage]);

  useEffect(() => {
    if (activeStatus === "revealed") answerHeading.current?.focus();
    else if (activeId) cardHeading.current?.focus();
    else if (hadActiveCard.current) summaryHeading.current?.focus();
    hadActiveCard.current = Boolean(activeId);
  }, [activeId, activeStatus]);

  function editAnswer(value: string) {
    if (!active) return;
    setAnswerText(value);
    if (value) memoryDrafts.current.set(active.id, value);
    else memoryDrafts.current.delete(active.id);
    try {
      if (value) storage.setItem(draftPrefix + active.id, value);
      else storage.removeItem(draftPrefix + active.id);
      setStorageWarning(false);
    } catch {
      setStorageWarning(true);
    }
  }

  function forgetDraft(attemptId: string) {
    memoryDrafts.current.delete(attemptId);
    setRecovered((drafts) =>
      drafts.filter((draft) => draft.attemptId !== attemptId),
    );
    try {
      storage.removeItem(draftPrefix + attemptId);
    } catch {
      setStorageWarning(true);
    }
  }

  async function send(command: ReviewCommand) {
    if (requestLock.current) return;
    requestLock.current = true;
    const version = ++requestVersion.current;
    setBusy(true);
    setFailure(null);
    setNotice("");
    let pendingCommand = command;
    let confirmedRating: ReviewOverview | null = null;
    try {
      let next = await updateReviews(command);
      if (version !== requestVersion.current) return;
      if (command.type === "reveal") {
        // A lost response can be retried with the same original answer.
        if (
          next.active?.id === command.attemptId &&
          next.active.answerText === command.answerText
        )
          forgetDraft(command.attemptId);
      }
      if (command.type === "rate") {
        const review = next.recent.find(
          (entry) => entry.id === command.attemptId,
        );
        setNotice(
          review
            ? review.mode === "practice"
              ? `Entraînement enregistré : ${reviewRatingLabels[review.rating]}. Ton calendrier de révision est conservé.`
              : `Révision enregistrée : ${reviewRatingLabels[review.rating]}.${review.dueAt ? ` Prochain passage le ${fullDate(review.dueAt, next.timeZone)}.` : ""}`
            : "Révision enregistrée.",
        );
        const continuePractice =
          currentSessionMode.current === "continuous" &&
          next.practiceAvailableCount > 0;
        const continueScheduled =
          currentSessionMode.current === "scheduled" && next.eligibleCount > 0;
        if (!next.active && (continuePractice || continueScheduled)) {
          // Keep the card on screen and the request lock until the next one is ready.
          // A failed continuation must retry start, never an already confirmed rating.
          confirmedRating = next;
          pendingCommand = {
            type: continuePractice ? "start-practice" : "start",
          };
          next = await updateReviews(pendingCommand);
          if (version !== requestVersion.current) return;
        }
      } else if (command.type === "activate") {
        setNotice("Cet élément est ajouté à tes révisions actives.");
      } else if (command.type === "activate-pack") {
        setNotice(
          "Pack ajouté à tes révisions. Les cartes déjà présentes gardent leur historique.",
        );
      } else if (command.type === "set-daily-limit") {
        setNotice("Ton rythme de nouvelles cartes a été enregistré.");
      } else if (command.type === "suspend") {
        setNotice("Élément mis en pause. Son historique est conservé.");
      }
      applyOverview(next);
    } catch (cause) {
      if (version !== requestVersion.current) return;
      if (confirmedRating) applyOverview(confirmedRating);
      const message =
        cause instanceof Error
          ? cause.message
          : "L’action n’a pas pu être confirmée. Ta réponse est conservée.";
      setFailure({
        message: confirmedRating
          ? `Ta révision est enregistrée, mais la carte suivante n’a pas pu être chargée. ${message}`
          : message,
        conflict: cause instanceof ReviewRequestError && cause.status === 409,
        command: pendingCommand,
      });
    } finally {
      if (version === requestVersion.current) {
        requestLock.current = false;
        setBusy(false);
      }
    }
  }

  function refresh() {
    if (loading || requestLock.current) return;
    requestLock.current = true;
    setLoading(true);
    setReload((value) => value + 1);
  }

  const activeElements =
    overview?.elements.filter(
      (element) => element.selected && element.active,
    ) ?? [];
  const activeCardCount = activeElements.reduce(
    (count, element) => count + element.cardCount,
    0,
  );

  return (
    <div className="review-workspace" aria-busy={busy || loading}>
      {notice && (
        <p className="review-notice" role="status">
          {notice}
        </p>
      )}
      {failure && (
        <div className="review-error" role="alert">
          <p>{failure.message}</p>
          {failure.command?.type === "reveal" && (
            <p>
              Ta saisie reste disponible ci-dessous. La même réponse sera
              envoyée si tu réessaies.
            </p>
          )}
          {failure.conflict && (
            <p>
              Une action a pu être effectuée dans un autre onglet. Actualise
              pour retrouver l’état enregistré ; ta saisie sera gardée en copie
              si elle diffère.
            </p>
          )}
          <div className="review-actions">
            {!failure.conflict && failure.command && (
              <button
                type="button"
                className="button button-primary"
                disabled={busy || loading}
                onClick={() => {
                  if (failure.command) void send(failure.command);
                }}
              >
                Réessayer la même action
              </button>
            )}
            <button
              type="button"
              className="button button-secondary"
              disabled={busy || loading}
              onClick={refresh}
            >
              Actualiser les révisions
            </button>
          </div>
        </div>
      )}
      {storageWarning && (
        <p className="review-warning" role="alert">
          Le navigateur ne peut pas conserver tes préférences ou ton brouillon
          dans cet onglet. Copie ta réponse avant de quitter ou d’actualiser la
          page.
        </p>
      )}
      {recovered.length > 0 && (
        <details className="review-recovery">
          <summary>Une saisie locale est conservée en copie</summary>
          <p>
            Cette copie n’a pas remplacé la réponse enregistrée. Tu peux la
            sélectionner pour la copier, puis retirer cette copie locale.
          </p>
          {recovered.map((draft, index) => (
            <div className="review-recovery-entry" key={draft.attemptId}>
              <label htmlFor={`${answerId}-copy-${index}`}>
                Saisie conservée {recovered.length > 1 ? index + 1 : ""}
              </label>
              <textarea
                id={`${answerId}-copy-${index}`}
                rows={3}
                value={draft.answerText}
                readOnly
              />
              <button
                type="button"
                className="button button-secondary"
                onClick={() => forgetDraft(draft.attemptId)}
              >
                Retirer cette copie locale
              </button>
            </div>
          ))}
        </details>
      )}
      {!overview && !failure && (
        <p role="status">Chargement de tes révisions…</p>
      )}
      {overview && active && (
        <section
          className="review-card"
          aria-label="Carte de révision"
          data-review-attempt-id={active.id}
        >
          <div className="review-session-mode">
            <span>
              {active.mode === "practice"
                ? "Entraînement libre"
                : "Révision prévue"}
              {sessionMode === "continuous" && " · En continu"}
            </span>
            <button
              type="button"
              className="button button-secondary"
              disabled={disabled}
              onClick={() =>
                chooseSessionMode(
                  sessionMode === "finish" ? "continuous" : "finish",
                )
              }
            >
              {sessionMode === "finish"
                ? "Continuer après cette carte"
                : "Terminer après cette carte"}
            </button>
          </div>
          {sessionMode === "finish" && (
            <p className="review-hint" role="status">
              La session se terminera après le bilan de cette carte.
            </p>
          )}
          {active.mode === "practice" && (
            <p className="review-hint">
              Les cartes difficiles reviennent plus souvent. Cet entraînement
              conserve les dates de tes révisions prévues.
            </p>
          )}
          <p className="eyebrow">{reviewDirectionLabels[active.direction]}</p>
          <h2 ref={cardHeading} tabIndex={-1}>
            {active.prompt}
          </h2>
          <p className="review-cue" lang={active.cueLang}>
            {active.cue}
          </p>
          {!revealed ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (!disabled)
                  void send({
                    type: "reveal",
                    attemptId: active.id,
                    answerText,
                  });
              }}
            >
              <label className="review-answer-label" htmlFor={answerId}>
                Ma réponse <span>(facultatif)</span>
              </label>
              <textarea
                id={answerId}
                value={answerText}
                onChange={(event) => editAnswer(event.target.value)}
                maxLength={REVIEW_ANSWER_MAX_LENGTH}
                rows={3}
                disabled={disabled}
                spellCheck={false}
                autoComplete="off"
                aria-describedby={`${answerId}-hint`}
              />
              <p id={`${answerId}-hint`} className="review-hint">
                Écris ici, sur papier ou réponds mentalement avant de révéler la
                réponse. Aucune note n’est attribuée automatiquement.
              </p>
              <button
                type="submit"
                className="button button-primary"
                disabled={disabled}
              >
                {busy ? "Enregistrement…" : "Révéler la réponse"}
              </button>
            </form>
          ) : (
            <div className="review-revealed">
              <div className="review-reference">
                <h3 ref={answerHeading} tabIndex={-1}>
                  La réponse
                </h3>
                <p
                  className="review-reference-answer"
                  lang={revealed.answerLang}
                >
                  {revealed.answer}
                </p>
                {active.direction !== "recognition" && (
                  <AudioPlayer
                    source={{ kind: "review", attemptId: active.id }}
                    text={
                      active.cueLang === "uk" ? active.cue : revealed.answer
                    }
                    compact
                  />
                )}
                <div className="review-answer-details">
                  <Markdown skipHtml rehypePlugins={[rehypeUkrainianLanguage]}>
                    {revealed.details}
                  </Markdown>
                </div>
              </div>
              <div className="review-original">
                <h3>Ma réponse avant de révéler</h3>
                {active.answerText ? (
                  <p className="review-original-text">{active.answerText}</p>
                ) : (
                  <p>Aucune saisie — réponse sur papier ou mentale.</p>
                )}
              </div>
              <fieldset className="review-ratings" disabled={disabled}>
                <legend>Comment s’est passé le rappel ?</legend>
                <p className="review-hint">
                  Choisis « À revoir » si tu as oublié, fait une erreur ou
                  consulté une aide. Les autres choix supposent une réponse
                  juste avant de révéler, sans aide. Ce bilan règle le prochain
                  passage, sans valider une maîtrise.
                </p>
                <div className="review-rating-grid">
                  {revealed.options.map((option) => (
                    <button
                      type="button"
                      key={option.rating}
                      className={`review-rating review-rating-${option.rating}`}
                      onClick={() =>
                        void send({
                          type: "rate",
                          attemptId: active.id,
                          rating: option.rating,
                        })
                      }
                    >
                      <strong>{reviewRatingLabels[option.rating]}</strong>
                      <span>{ratingDescriptions[option.rating]}</span>
                      {option.dueAt ? (
                        <time
                          dateTime={option.dueAt}
                          title={fullDate(option.dueAt, overview.timeZone)}
                        >
                          {intervalLabel(option.dueAt, overview.now)}
                        </time>
                      ) : (
                        <span className="review-practice-gap">
                          Après environ {option.practiceGap ?? 1} carte
                          {(option.practiceGap ?? 1) > 1 ? "s" : ""}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </fieldset>
              <Link href={active.sourceHref} className="review-source-link">
                Revoir ce passage du cours
              </Link>
            </div>
          )}
          <div className="review-card-footer">
            <Link href="/">Revenir à l’accueil</Link>
            <span>
              Tu pourras reprendre cette carte. Quitter n’attribue aucune note.
            </span>
          </div>
        </section>
      )}
      {overview && !active && (
        <>
          <section
            className="review-session"
            aria-labelledby="review-session-title"
          >
            <h2 id="review-session-title" ref={summaryHeading} tabIndex={-1}>
              {overview.eligibleCount > 0
                ? "Prêt pour un rappel ?"
                : activeCardCount > 0
                  ? "Tes révisions sont à jour pour le moment"
                  : "Choisis ce que tu as déjà étudié"}
            </h2>
            <dl className="review-counts">
              <div>
                <dt>Cartes à revoir</dt>
                <dd>{overview.reviewDueCount}</dd>
              </div>
              <div>
                <dt>Nouvelles disponibles aujourd’hui</dt>
                <dd>{overview.newAvailableCount}</dd>
              </div>
              <div>
                <dt>Cartes actives</dt>
                <dd>{activeCardCount}</dd>
              </div>
            </dl>
            <p>
              {overview.newToday} nouvelle{overview.newToday > 1 ? "s" : ""}{" "}
              carte{overview.newToday > 1 ? "s" : ""} déjà présentée
              {overview.newToday > 1 ? "s" : ""} aujourd’hui. Les cartes à
              revoir passent en premier.
            </p>
            <label className="review-daily-limit">
              Nouvelles cartes par jour
              <select
                value={overview.dailyNewLimit ?? "unlimited"}
                disabled={disabled}
                onChange={(event) =>
                  void send({
                    type: "set-daily-limit",
                    dailyNewLimit:
                      event.target.value === "unlimited"
                        ? null
                        : Number(event.target.value),
                  })
                }
              >
                {[5, 10, 20, 50].map((limit) => (
                  <option key={limit} value={limit}>
                    {limit}
                  </option>
                ))}
                <option value="unlimited">Sans limite</option>
              </select>
            </label>
            {overview.nextAvailableAt && overview.eligibleCount === 0 && (
              <p>
                Prochaine révision prévue :{" "}
                <time dateTime={overview.nextAvailableAt}>
                  {fullDate(overview.nextAvailableAt, overview.timeZone)}
                </time>
                .
              </p>
            )}
            <div className="review-actions">
              {overview.eligibleCount > 0 && (
                <button
                  type="button"
                  className="button button-primary"
                  disabled={disabled}
                  onClick={() => {
                    chooseSessionMode("scheduled");
                    void send({ type: "start" });
                  }}
                >
                  {busy ? "Chargement…" : "Commencer les révisions"}
                </button>
              )}
              {overview.practiceAvailableCount > 0 && (
                <button
                  type="button"
                  className={`button ${overview.eligibleCount > 0 ? "button-secondary" : "button-primary"}`}
                  disabled={disabled}
                  onClick={() => {
                    chooseSessionMode("continuous");
                    void send({ type: "start-practice" });
                  }}
                >
                  {overview.eligibleCount > 0
                    ? "Entraînement libre"
                    : "Continuer à m’entraîner"}
                </button>
              )}
              <button
                type="button"
                className="button button-secondary"
                disabled={disabled}
                onClick={refresh}
              >
                Actualiser les échéances
              </button>
            </div>
            <p className="review-hint">
              L’entraînement libre enchaîne tes cartes aussi longtemps que tu le
              souhaites, avec des retours plus fréquents sur les difficultés.
              Les révisions prévues passent en premier ; les passages
              supplémentaires conservent leurs dates. Horaires :{" "}
              {overview.timeZone}.
            </p>
          </section>
          <section
            className="review-selection"
            aria-labelledby="review-selection-title"
          >
            <div className="review-section-heading">
              <div>
                <h2 id="review-selection-title">Mes éléments à réviser</h2>
                <p>
                  {activeElements.length} élément
                  {activeElements.length > 1 ? "s" : ""} actif
                  {activeElements.length > 1 ? "s" : ""} · Tous les modules
                </p>
              </div>
              <Link
                href={
                  selectedModule
                    ? documentHref(selectedModule.id, "cours")
                    : "/parcours"
                }
              >
                {selectedModule
                  ? `Ouvrir le cours ${selectedModule.id}`
                  : "Voir le parcours"}
              </Link>
            </div>
            <p>
              Ajoute un pack correspondant à un cours étudié, puis ajuste les
              cartes si besoin. Les mots et les formules se travaillent dans les
              deux sens.
            </p>
            <label className="review-module-filter">
              Éléments à afficher
              <select
                value={moduleId}
                onChange={(event) => setModuleId(event.target.value)}
              >
                <option value="all">Tous les modules</option>
                {modules.map((module) => (
                  <option key={module.id} value={module.id}>
                    Module {module.id} · {module.title}
                  </option>
                ))}
              </select>
            </label>
            <p className="review-hint">
              Ce filtre sert à choisir les éléments à ajouter. Tes révisions
              continuent à réunir toutes tes cartes actives.
            </p>
            <section
              className="review-packs"
              aria-labelledby="review-packs-title"
            >
              <h3 id="review-packs-title">Les packs de cours</h3>
              <ul className="review-pack-list">
                {shownPacks.map((pack) => {
                  const complete =
                    pack.activeElementCount === pack.elementCount;
                  const action = complete
                    ? "Pack ajouté"
                    : pack.activeElementCount > 0
                      ? "Compléter le pack"
                      : "Ajouter le pack";
                  return (
                    <li key={pack.id} data-review-pack-id={pack.id}>
                      <div>
                        <p className="eyebrow">Module {pack.moduleId}</p>
                        <h4>{pack.title}</h4>
                        <p>{pack.description}</p>
                        <p className="review-hint">
                          {pack.cardCount} cartes · {pack.activeElementCount}/
                          {pack.elementCount} éléments actifs
                        </p>
                      </div>
                      <button
                        type="button"
                        className={`button ${complete ? "button-secondary" : "button-primary"}`}
                        aria-label={`${action} : ${pack.title}`}
                        disabled={disabled || complete}
                        onClick={() =>
                          void send({ type: "activate-pack", packId: pack.id })
                        }
                      >
                        {action}
                      </button>
                    </li>
                  );
                })}
              </ul>
              <p className="review-hint">
                Ajouter un pack active toutes ses cartes, y compris celles en
                pause, sans doublon ni remise à zéro de ton historique.
              </p>
            </section>
            <h3 className="review-individual-title">Ajuster carte par carte</h3>
            <p className="review-hint">
              Une pause conserve les passages précédents et les échéances.
            </p>
            {groups
              .filter((group) =>
                shownElements.some((element) => element.kind === group.kind),
              )
              .map((group) => (
                <section className="review-group" key={group.kind}>
                  <h3>{group.title}</h3>
                  <ul className="review-element-list">
                    {shownElements
                      .filter((element) => element.kind === group.kind)
                      .map((element) => (
                        <li
                          key={element.id}
                          data-review-element-id={element.id}
                        >
                          <div className="review-element-description">
                            <strong lang="uk">{element.label}</strong>
                            <span>
                              Module {element.moduleId} · {element.cardCount}{" "}
                              carte
                              {element.cardCount > 1 ? "s" : ""}
                              {element.selected
                                ? element.active
                                  ? " · Actif"
                                  : " · En pause"
                                : " · Pas encore ajouté"}
                            </span>
                          </div>
                          <div className="review-element-actions">
                            <Link
                              href={element.sourceHref}
                              aria-label={`Revoir ${element.label} dans le cours`}
                            >
                              Cours
                            </Link>
                            <button
                              type="button"
                              className={`button ${element.selected && element.active ? "button-secondary" : "button-primary"}`}
                              disabled={disabled}
                              aria-label={
                                element.selected && element.active
                                  ? `Mettre ${element.label} en pause`
                                  : element.selected
                                    ? `Réactiver ${element.label}`
                                    : `Ajouter ${element.label} à mes révisions`
                              }
                              onClick={() =>
                                void send({
                                  type:
                                    element.selected && element.active
                                      ? "suspend"
                                      : "activate",
                                  elementId: element.id,
                                })
                              }
                            >
                              {element.selected && element.active
                                ? "Mettre en pause"
                                : element.selected
                                  ? "Réactiver"
                                  : "Ajouter à mes révisions"}
                            </button>
                          </div>
                        </li>
                      ))}
                  </ul>
                </section>
              ))}
          </section>
          <section
            className="review-history"
            aria-labelledby="review-history-title"
          >
            <h2 id="review-history-title">Mes derniers passages</h2>
            <p className="review-hint">
              Tes auto-évaluations et tes réponses originales sont conservées.
              Elles ne constituent pas une correction automatique de l’écrit ou
              de la prononciation.
            </p>
            {overview.recent.length === 0 ? (
              <p>Aucune révision terminée pour le moment.</p>
            ) : (
              <ol className="review-history-list">
                {overview.recent.map((entry) => (
                  <li key={entry.id}>
                    <details>
                      <summary>
                        <span lang="uk">{entry.label}</span>
                        <span>{reviewRatingLabels[entry.rating]}</span>
                        {entry.mode === "practice" && (
                          <span>Entraînement libre</span>
                        )}
                        <time dateTime={entry.reviewedAt}>
                          {fullDate(entry.reviewedAt, overview.timeZone)}
                        </time>
                      </summary>
                      <div className="review-history-detail">
                        <p>{reviewDirectionLabels[entry.direction]}</p>
                        <h3>Ma réponse avant de révéler</h3>
                        <p className="review-original-text">
                          {entry.answerText || "Aucune saisie enregistrée."}
                        </p>
                        {entry.dueAt ? (
                          <p>
                            Échéance fixée après ce passage :{" "}
                            <time dateTime={entry.dueAt}>
                              {fullDate(entry.dueAt, overview.timeZone)}
                            </time>
                            .
                          </p>
                        ) : (
                          <p>
                            Entraînement libre : calendrier de révision
                            conservé.
                          </p>
                        )}
                      </div>
                    </details>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </>
      )}
    </div>
  );
}
