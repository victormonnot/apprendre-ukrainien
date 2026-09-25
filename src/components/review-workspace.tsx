"use client";

import { AudioPlayer } from "@/components/audio-player";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
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
type RequestFailure = {
  message: string;
  conflict: boolean;
  command?: ReviewCommand;
};

const draftPrefix = "ukrainian-review-draft:";
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

function savedDrafts(): LocalDraft[] {
  const drafts: LocalDraft[] = [];
  for (let index = 0; index < sessionStorage.length; index++) {
    const key = sessionStorage.key(index);
    if (!key?.startsWith(draftPrefix)) continue;
    const answerText = sessionStorage.getItem(key);
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

export function ReviewWorkspace() {
  const [overview, setOverview] = useState<ReviewOverview | null>(null);
  const [answerText, setAnswerText] = useState("");
  const [recovered, setRecovered] = useState<LocalDraft[]>([]);
  const [failure, setFailure] = useState<RequestFailure | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [storageWarning, setStorageWarning] = useState(false);
  const [reload, setReload] = useState(0);
  const requestLock = useRef(false);
  const requestVersion = useRef(0);
  const memoryDrafts = useRef(new Map<string, string>());
  const cardHeading = useRef<HTMLHeadingElement>(null);
  const answerHeading = useRef<HTMLHeadingElement>(null);
  const summaryHeading = useRef<HTMLHeadingElement>(null);
  const answerId = useId();
  const active = overview?.active;
  const revealed = active?.revealed;
  const activeId = active?.id;
  const activeStatus = active?.status;
  const unresolved = Boolean(failure?.command || failure?.conflict);
  const disabled = busy || loading || unresolved;
  const dirty = active?.status === "presented" && answerText.length > 0;
  useUnsavedWork(Boolean(dirty));

  function applyOverview(next: ReviewOverview) {
    const combined = new Map<string, string>();
    try {
      for (const draft of savedDrafts())
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
        sessionStorage.removeItem(draftPrefix + attemptId);
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
  }

  useEffect(() => {
    const controller = new AbortController();
    const version = ++requestVersion.current;
    requestLock.current = true;
    loadReviews(controller.signal)
      .then((next) => {
        if (controller.signal.aborted || version !== requestVersion.current)
          return;
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
    return () => controller.abort();
  }, [reload]);

  useEffect(() => {
    if (activeStatus === "revealed") answerHeading.current?.focus();
    else if (activeId) cardHeading.current?.focus();
  }, [activeId, activeStatus]);

  function editAnswer(value: string) {
    if (!active) return;
    setAnswerText(value);
    if (value) memoryDrafts.current.set(active.id, value);
    else memoryDrafts.current.delete(active.id);
    try {
      if (value) sessionStorage.setItem(draftPrefix + active.id, value);
      else sessionStorage.removeItem(draftPrefix + active.id);
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
      sessionStorage.removeItem(draftPrefix + attemptId);
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
    try {
      const next = await updateReviews(command);
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
            ? `Révision enregistrée : ${reviewRatingLabels[review.rating]}. Prochain passage le ${fullDate(review.dueAt, next.timeZone)}.`
            : "Révision enregistrée. Tu peux passer à la carte suivante quand tu le souhaites.",
        );
        requestAnimationFrame(() => summaryHeading.current?.focus());
      } else if (command.type === "activate") {
        setNotice("Cet élément est ajouté à tes révisions actives.");
      } else if (command.type === "suspend") {
        setNotice("Élément mis en pause. Son historique est conservé.");
      }
      applyOverview(next);
    } catch (cause) {
      if (version !== requestVersion.current) return;
      setFailure({
        message:
          cause instanceof Error
            ? cause.message
            : "L’action n’a pas pu être confirmée. Ta réponse est conservée.",
        conflict: cause instanceof ReviewRequestError && cause.status === 409,
        command,
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
          Le navigateur ne peut pas conserver ton brouillon dans cet onglet.
          Copie ta réponse avant de quitter ou d’actualiser la page.
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
                      <time
                        dateTime={option.dueAt}
                        title={fullDate(option.dueAt, overview.timeZone)}
                      >
                        {intervalLabel(option.dueAt, overview.now)}
                      </time>
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
            <Link href="/parcours">Revenir au parcours</Link>
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
              {overview.dailyNewLimit} nouvelles cartes au maximum par jour ;{" "}
              {overview.newToday} déjà présentée
              {overview.newToday > 1 ? "s" : ""} aujourd’hui. Les cartes à
              revoir passent en premier.
            </p>
            {overview.nextAvailableAt && overview.eligibleCount === 0 && (
              <p>
                Prochaine disponibilité :{" "}
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
                  onClick={() => void send({ type: "start" })}
                >
                  {busy ? "Chargement…" : "Commencer une carte"}
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
              Horaires : {overview.timeZone}. Une carte révélée reste à évaluer
              jusqu’à ton prochain passage.
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
                  {activeElements.length > 1 ? "s" : ""} · Module 01
                </p>
              </div>
              <Link href="/parcours/01/cours">Ouvrir le cours</Link>
            </div>
            <p>
              Ajoute seulement les lettres, mots et formules que tu as étudiés.
              Les mots et les formules se travaillent dans les deux sens. Une
              pause conserve les passages précédents et les échéances.
            </p>
            {groups.map((group) => (
              <section className="review-group" key={group.kind}>
                <h3>{group.title}</h3>
                <ul className="review-element-list">
                  {overview.elements
                    .filter((element) => element.kind === group.kind)
                    .map((element) => (
                      <li key={element.id} data-review-element-id={element.id}>
                        <div className="review-element-description">
                          <strong lang="uk">{element.label}</strong>
                          <span>
                            {element.cardCount} carte
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
                        <p>
                          Échéance fixée après ce passage :{" "}
                          <time dateTime={entry.dueAt}>
                            {fullDate(entry.dueAt, overview.timeZone)}
                          </time>
                          .
                        </p>
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
