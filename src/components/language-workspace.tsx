"use client";

import { AudioPlayer } from "@/components/audio-player";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import {
  generateLanguageResult,
  loadExerciseLanguageInput,
  loadLanguageLibrary,
  loadLanguageResult,
  saveLanguageReference,
  saveLanguageResult,
  type LanguageGeneration,
} from "@/lib/language-client";
import {
  LANGUAGE_CONTEXT_MAX_LENGTH,
  LANGUAGE_TEXT_MAX_LENGTH,
  type LanguageInput,
  type LanguageLibrary,
  type LanguageMode,
  type LanguageResult,
  type LanguageSource,
} from "@/lib/language-types";
import { rehypeUkrainianLanguage } from "@/lib/markdown";
import { updateReviews } from "@/lib/review-client";
import { useUnsavedWork } from "@/lib/use-unsaved-work";
import "./language-workspace.css";

const modes: { value: LanguageMode; label: string; action: string }[] = [
  { value: "translate", label: "Traduire", action: "Traduire ce texte" },
  { value: "explain", label: "Expliquer", action: "Expliquer ce passage" },
  { value: "correct", label: "Relire un texte", action: "Relire mon texte" },
];
const emptyInput: LanguageInput = {
  mode: "translate",
  text: "",
  context: "",
  source: null,
};
type Draft = {
  input: LanguageInput;
  resultId: string | null;
  pending: LanguageGeneration | null;
};

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/([a-z])\p{M}+/giu, "$1")
    .replace(/\u0301/g, "")
    .normalize("NFC")
    .toLocaleLowerCase("fr")
    .replace(/[’ʼ]/g, "'")
    .trim();
}

function sourceHref(source: LanguageSource) {
  if (source.kind === "document")
    return `/parcours/${encodeURIComponent(source.moduleId)}/${source.view}#${encodeURIComponent(source.anchor)}`;
  const [moduleId, number] = source.exerciseId.split("-");
  return `/parcours/${encodeURIComponent(moduleId ?? "01")}/exercices#exercice-${encodeURIComponent(number ?? "1")}`;
}

function queryInput(query: URLSearchParams): LanguageInput {
  const mode = query.get("mode");
  const view = query.get("view");
  const moduleId = query.get("module");
  const anchor = query.get("anchor");
  return {
    mode: mode === "explain" || mode === "correct" ? mode : "translate",
    text: (query.get("text") ?? "").slice(0, LANGUAGE_TEXT_MAX_LENGTH),
    context: (query.get("context") ?? "").slice(0, LANGUAGE_CONTEXT_MAX_LENGTH),
    source:
      moduleId &&
      anchor !== null &&
      (view === "cours" || view === "vocabulaire" || view === "exercices")
        ? { kind: "document", moduleId, view, anchor }
        : null,
  };
}

function restoreDraft(key: string): Draft | null {
  const raw = sessionStorage.getItem(key);
  if (!raw) return null;
  const parsed = JSON.parse(raw) as Partial<Draft>;
  const input = parsed.input;
  const source = input?.source;
  const validSource =
    source === null ||
    (source?.kind === "document" &&
      typeof source.moduleId === "string" &&
      typeof source.anchor === "string" &&
      ["cours", "vocabulaire", "exercices"].includes(source.view)) ||
    (source?.kind === "exercise" &&
      typeof source.exerciseId === "string" &&
      typeof source.attemptId === "string");
  if (
    !input ||
    !validSource ||
    !modes.some((mode) => mode.value === input.mode) ||
    typeof input.text !== "string" ||
    input.text.length >
      (source?.kind === "exercise" ? 60_000 : LANGUAGE_TEXT_MAX_LENGTH) ||
    typeof input.context !== "string" ||
    input.context.length > LANGUAGE_CONTEXT_MAX_LENGTH
  )
    return null;
  const pending = parsed.pending;
  return {
    input,
    resultId: typeof parsed.resultId === "string" ? parsed.resultId : null,
    pending:
      pending?.type === "generate" &&
      typeof pending.requestId === "string" &&
      JSON.stringify(pending.input) === JSON.stringify(input)
        ? pending
        : null,
  };
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Paris",
  }).format(new Date(value));
}

export function LanguageWorkspace() {
  const params = useSearchParams();
  const query = params.toString();
  return <Workshop key={query} query={query} />;
}

function Workshop({ query }: { query: string }) {
  const [library, setLibrary] = useState<LanguageLibrary | null>(null);
  const [input, setInput] = useState<LanguageInput>(emptyInput);
  const [result, setResult] = useState<LanguageResult | null>(null);
  const [search, setSearch] = useState("");
  const [savedOnly, setSavedOnly] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [inputReady, setInputReady] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [hasPending, setHasPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [storageWarning, setStorageWarning] = useState(false);
  const [reload, setReload] = useState(0);
  const [activated, setActivated] = useState<string[]>([]);
  const pending = useRef<LanguageGeneration | null>(null);
  const memoryDraft = useRef<Draft | null>(null);
  const lock = useRef(false);
  const alive = useRef(true);
  const generation = useRef(0);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const storageKey = `ukrainian-language-draft:${query || "general"}`;
  const exerciseSource = input.source?.kind === "exercise";
  const dirty = Boolean(
    input.text.trim() &&
    (!result || JSON.stringify(input) !== JSON.stringify(result.input)),
  );
  useUnsavedWork(dirty && !exerciseSource);

  function persist(
    nextInput: LanguageInput,
    resultId: string | null,
    command = pending.current,
  ) {
    memoryDraft.current = { input: nextInput, resultId, pending: command };
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(memoryDraft.current));
      setStorageWarning(false);
    } catch {
      setStorageWarning(true);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    const version = ++generation.current;
    alive.current = true;
    async function load() {
      let draft: Draft | null = memoryDraft.current;
      try {
        draft ??= restoreDraft(storageKey);
      } catch {
        if (!controller.signal.aborted) setStorageWarning(true);
      }
      const params = new URLSearchParams(query);
      const exerciseId = params.get("exercise");
      const attemptId = params.get("attempt");
      const resultId = draft?.resultId ?? params.get("result");
      const nextInput = draft?.input ?? queryInput(params);
      const responses = await Promise.allSettled([
        loadLanguageLibrary(controller.signal),
        exerciseId && attemptId
          ? loadExerciseLanguageInput(exerciseId, attemptId, controller.signal)
          : Promise.resolve(nextInput),
        resultId
          ? loadLanguageResult(resultId, controller.signal)
          : Promise.resolve(null),
      ]);
      if (controller.signal.aborted || generation.current !== version) return;
      const [libraryResponse, inputResponse, resultResponse] = responses;
      if (libraryResponse.status === "fulfilled")
        setLibrary(libraryResponse.value);
      if (inputResponse.status === "fulfilled") {
        const initialInput =
          !draft &&
          !(exerciseId && attemptId) &&
          resultResponse.status === "fulfilled" &&
          resultResponse.value
            ? resultResponse.value.input
            : inputResponse.value;
        const restoredInput =
          exerciseId && draft && initialInput.source?.kind === "exercise"
            ? { ...initialInput, context: draft.input.context }
            : initialInput;
        setInput(restoredInput);
        setInputReady(true);
        pending.current =
          JSON.stringify(draft?.pending?.input) ===
          JSON.stringify(restoredInput)
            ? (draft?.pending ?? null)
            : null;
        setHasPending(Boolean(pending.current));
        const initialSearch = params.get("text")?.trim() ?? "";
        if (
          reload === 0 &&
          initialSearch.length <= 80 &&
          !initialSearch.includes("\n")
        )
          setSearch(initialSearch);
      }
      if (resultResponse.status === "fulfilled")
        setResult(resultResponse.value);
      const failed = responses.find(
        (response) => response.status === "rejected",
      );
      setLoadFailed(Boolean(failed));
      setError(
        failed?.status === "rejected"
          ? failed.reason instanceof Error
            ? failed.reason.message
            : "L’atelier est indisponible pour le moment."
          : "",
      );
      if (draft && !failed)
        setNotice("Ton travail dans cet onglet a été retrouvé.");
      setLoading(false);
    }
    void load();
    return () => {
      controller.abort();
      alive.current = false;
      generation.current = version + 1;
    };
  }, [query, reload, storageKey]);

  function edit(next: LanguageInput) {
    setInput(next);
    setNotice("");
    persist(next, result?.id ?? null);
  }

  async function run(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    if (!loadFailed) setError("");
    setNotice("");
    try {
      await action();
    } catch (cause) {
      if (alive.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "Cette action a échoué. Tu peux réessayer.",
        );
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }

  function generate() {
    if (!inputReady || !library?.configured || !input.text.trim()) return;
    void run(async () => {
      const snapshot = { ...input };
      const command: LanguageGeneration =
        pending.current &&
        JSON.stringify(pending.current.input) === JSON.stringify(snapshot)
          ? pending.current
          : {
              type: "generate",
              requestId: crypto.randomUUID(),
              input: snapshot,
            };
      pending.current = command;
      setHasPending(true);
      persist(snapshot, result?.id ?? null, command);
      const version = generation.current;
      const next = await generateLanguageResult(command);
      if (!alive.current || generation.current !== version) return;
      pending.current = null;
      setHasPending(false);
      setResult(next);
      setLoadFailed(false);
      setError("");
      persist(snapshot, next.id, null);
      setNotice("Le résultat est prêt. Tu peux l’enregistrer dans tes fiches.");
      requestAnimationFrame(() => resultHeading.current?.focus());
    });
  }

  function saveResult() {
    if (!result) return;
    void run(async () => {
      const next = await saveLanguageResult(result.id);
      if (!alive.current) return;
      setResult(next);
      setLibrary((previous) =>
        previous
          ? {
              ...previous,
              savedResults: [
                next,
                ...previous.savedResults.filter((item) => item.id !== next.id),
              ],
            }
          : previous,
      );
      persist(input, next.id);
      setNotice("Fiche enregistrée avec son texte et son contexte d’origine.");
    });
  }

  function saveReference(elementId: string) {
    void run(async () => {
      const next = await saveLanguageReference(elementId);
      if (!alive.current) return;
      setLibrary((previous) =>
        previous
          ? { ...previous, savedReferenceIds: next.savedReferenceIds }
          : previous,
      );
      setNotice("La référence a été ajoutée à tes fiches.");
    });
  }

  function activate(elementId: string) {
    void run(async () => {
      await updateReviews({ type: "activate", elementId });
      if (!alive.current) return;
      setActivated((previous) => [...previous, elementId]);
      setNotice("Cet élément est actif dans tes révisions.");
    });
  }

  const term = normalize(search);
  const references = (library?.references ?? []).filter(
    (reference) =>
      (!savedOnly || library?.savedReferenceIds.includes(reference.id)) &&
      (!term ||
        normalize(
          `${reference.label} ${reference.french} ${reference.details}`,
        ).includes(term)),
  );
  const visibleReferences =
    term || savedOnly || showAll ? references : references.slice(0, 6);
  const savedResults = (library?.savedResults ?? []).filter(
    (saved) =>
      !term ||
      normalize(
        `${saved.content.title} ${saved.input.text} ${saved.content.summary} ${saved.content.entries.map((entry) => `${entry.ukrainian} ${entry.french}`).join(" ")}`,
      ).includes(term),
  );
  const disabled = loading || busy;
  const formDisabled = disabled || !inputReady;

  return (
    <div className="language-workspace" aria-busy={busy || loading}>
      {loading && <p role="status">Chargement de tes fiches…</p>}
      {error && (
        <div role="alert" className="language-error">
          <p>{error}</p>
          {loadFailed && (
            <button
              className="button button-secondary"
              disabled={disabled}
              onClick={() => {
                setLoading(true);
                setReload((value) => value + 1);
              }}
            >
              Réessayer le chargement
            </button>
          )}
          {hasPending && library && (
            <p>
              Ton texte est conservé. Le bouton du formulaire permet de
              réessayer la même demande.
            </p>
          )}
        </div>
      )}
      <p className="language-notice" role="status">
        {notice || (busy ? "En cours…" : "")}
      </p>
      {storageWarning && (
        <p className="language-hint">
          Le brouillon ne peut pas être conservé dans cet onglet. Garde la page
          ouverte jusqu’à la fin.
        </p>
      )}

      <section
        className="language-panel"
        aria-labelledby="language-search-title"
      >
        <div className="language-section-heading">
          <div>
            <p className="eyebrow">Les mots à portée de main</p>
            <h2 id="language-search-title">Rechercher dans mes fiches</h2>
          </div>
          <span className="language-tag">Disponible sans service externe</span>
        </div>
        <label htmlFor="language-search">
          Un mot en français ou en ukrainien
        </label>
        <input
          id="language-search"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Par exemple : café, кава, bonjour…"
        />
        <label className="language-checkbox">
          <input
            type="checkbox"
            checked={savedOnly}
            onChange={(event) => setSavedOnly(event.target.checked)}
          />{" "}
          Mes références enregistrées seulement
        </label>
        <p className="language-hint">
          {references.length} référence{references.length > 1 ? "s" : ""} du
          cours{term && " correspondant à ta recherche"}.
        </p>
        <div className="language-reference-grid">
          {visibleReferences.map((reference) => {
            const saved = library?.savedReferenceIds.includes(reference.id);
            return (
              <details
                key={reference.id}
                className="language-reference"
                data-language-reference-id={reference.id}
              >
                <summary>
                  <span lang="uk">{reference.label}</span>
                  <span>{reference.french}</span>
                  {saved && <span className="language-tag">Enregistrée</span>}
                </summary>
                <div className="language-reference-body">
                  <p className="language-hint">
                    Référence du cours · module 01
                  </p>
                  <Markdown skipHtml rehypePlugins={[rehypeUkrainianLanguage]}>
                    {reference.details}
                  </Markdown>
                  {reference.kind !== "letter" && (
                    <AudioPlayer
                      compact
                      source={{ kind: "reference", elementId: reference.id }}
                      text={reference.label}
                    />
                  )}
                  <div className="language-actions">
                    <button
                      className="button button-secondary"
                      disabled={disabled || saved}
                      onClick={() => saveReference(reference.id)}
                    >
                      {saved ? "Fiche enregistrée" : "Enregistrer la référence"}
                    </button>
                    <button
                      className="button button-secondary"
                      disabled={disabled || activated.includes(reference.id)}
                      onClick={() => activate(reference.id)}
                    >
                      {activated.includes(reference.id)
                        ? "Active en révisions"
                        : "Ajouter aux révisions"}
                    </button>
                  </div>
                  <Link href={reference.sourceHref}>
                    Retrouver dans le cours
                  </Link>
                </div>
              </details>
            );
          })}
        </div>
        {!loading && references.length === 0 && (
          <p>
            {savedOnly
              ? "Aucune référence enregistrée ne correspond à cette recherche."
              : "Aucune référence du cours ne correspond. Tu peux explorer ce mot dans l’atelier ci-dessous."}
          </p>
        )}
        {!term && !savedOnly && references.length > 6 && (
          <button
            className="language-text-button"
            onClick={() => setShowAll((value) => !value)}
          >
            {showAll
              ? "Réduire la liste"
              : `Voir les ${references.length} références`}
          </button>
        )}
      </section>

      <section
        className="language-panel language-assistance"
        aria-labelledby="language-form-title"
      >
        <p className="eyebrow">À partir de ton contexte</p>
        <h2 id="language-form-title">Explorer et écrire</h2>
        {library && !library.configured && (
          <div className="language-unavailable">
            <strong>L’assistance n’est pas encore connectée.</strong>
            <p>
              La recherche, les fiches et les révisions restent disponibles. Tu
              peux préparer ton texte ici pour le retrouver plus tard.
            </p>
          </div>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            generate();
          }}
        >
          <fieldset
            disabled={formDisabled || exerciseSource}
            className="language-modes"
          >
            <legend>Que veux-tu faire ?</legend>
            {modes.map((mode) => (
              <label key={mode.value}>
                <input
                  type="radio"
                  name="language-mode"
                  value={mode.value}
                  checked={input.mode === mode.value}
                  onChange={() => edit({ ...input, mode: mode.value })}
                />
                {mode.label}
              </label>
            ))}
          </fieldset>
          <label htmlFor="language-text">
            {exerciseSource
              ? "Mes réponses remises"
              : input.mode === "translate"
                ? "Mot ou phrase à traduire"
                : input.mode === "correct"
                  ? "Mon texte en ukrainien"
                  : "Passage à comprendre"}
          </label>
          <textarea
            id="language-text"
            rows={exerciseSource ? 10 : 5}
            maxLength={exerciseSource ? undefined : LANGUAGE_TEXT_MAX_LENGTH}
            readOnly={exerciseSource}
            disabled={formDisabled}
            value={input.text}
            onChange={(event) => edit({ ...input, text: event.target.value })}
            required
            aria-describedby="language-text-hint"
          />
          <p id="language-text-hint" className="language-hint">
            {exerciseSource
              ? "Ces réponses sont la copie de ta remise. Le retour de l’atelier s’ajoute à ton travail, sans modifier tes réponses ni leur évaluation."
              : input.mode === "translate"
                ? "Français → ukrainien ou ukrainien → français. Précise le sens recherché dans le contexte."
                : input.mode === "correct"
                  ? "Les variantes possibles et les passages incertains seront signalés. Ce retour ne donne pas de note."
                  : "Demande une explication de sens, de grammaire ou d’usage."}
          </p>
          {input.source && (
            <p className="language-source">
              <Link href={sourceHref(input.source)}>
                Revenir{" "}
                {exerciseSource ? "à l’exercice" : "au passage du cours"}
              </Link>
            </p>
          )}
          <label htmlFor="language-context">
            Contexte ou question{" "}
            <span className="language-optional">(facultatif)</span>
          </label>
          <textarea
            id="language-context"
            rows={3}
            maxLength={LANGUAGE_CONTEXT_MAX_LENGTH}
            disabled={formDisabled}
            value={input.context}
            onChange={(event) =>
              edit({ ...input, context: event.target.value })
            }
            placeholder="Situation, sens du mot, difficulté précise…"
          />
          <p className="language-hint">
            En lançant la demande, le texte et le contexte sont transmis à
            OpenAI. Le résultat est une aide générée, à vérifier avec les
            références du cours.
          </p>
          <button
            className="button button-primary"
            type="submit"
            disabled={
              formDisabled || !library?.configured || !input.text.trim()
            }
          >
            {busy && hasPending
              ? "Préparation du résultat…"
              : modes.find((mode) => mode.value === input.mode)?.action}
          </button>
        </form>
      </section>

      {result && (
        <section
          className="language-panel language-result"
          aria-labelledby="language-result-title"
          data-language-result-id={result.id}
        >
          <div className="language-section-heading">
            <h2 id="language-result-title" ref={resultHeading} tabIndex={-1}>
              {result.content.title}
            </h2>
            <span className="language-tag language-generated">
              Aide générée · à vérifier
            </span>
          </div>
          <p className="language-hint">
            {result.model} · {dateLabel(result.createdAt)}
          </p>
          <p className="language-preserve">{result.content.summary}</p>
          <details className="language-original">
            <summary>Texte et contexte de cette demande</summary>
            <p className="language-preserve">{result.input.text}</p>
            {result.input.context && (
              <p className="language-preserve">
                <strong>Contexte :</strong> {result.input.context}
              </p>
            )}
            {result.input.source && (
              <Link href={sourceHref(result.input.source)}>
                Retrouver la source
              </Link>
            )}
          </details>
          {result.content.ambiguity && (
            <p className="language-ambiguity">
              <strong>Sens et nuances :</strong> {result.content.ambiguity}
            </p>
          )}
          {result.content.entries.map((entry, index) => (
            <article
              key={`${entry.ukrainian}-${index}`}
              className="language-entry"
            >
              <h3 lang="uk">{entry.ukrainian}</h3>
              <AudioPlayer
                compact
                source={{
                  kind: "language",
                  resultId: result.id,
                  entryIndex: index,
                  exampleIndex: null,
                }}
                text={entry.ukrainian}
              />
              <p className="language-meaning">{entry.french}</p>
              <p>{entry.usage}</p>
              {entry.syllables.length > 0 && (
                <p>
                  <span lang="uk">
                    {entry.syllables.map((syllable, syllableIndex) => (
                      <span key={syllableIndex}>
                        {syllableIndex > 0 && "·"}
                        {syllableIndex === entry.stressIndex ? (
                          <strong>{syllable}</strong>
                        ) : (
                          syllable
                        )}
                      </span>
                    ))}
                  </span>
                  {entry.stressIndex !== null && (
                    <>
                      {" "}
                      — accent sur la{" "}
                      {entry.stressIndex === 0
                        ? "1re"
                        : `${entry.stressIndex + 1}e`}{" "}
                      syllabe
                    </>
                  )}
                </p>
              )}
              {entry.pronunciation && (
                <p>
                  <strong>Aide française approximative :</strong>{" "}
                  {entry.pronunciation}
                </p>
              )}
              {entry.examples.length > 0 && (
                <ul className="language-examples">
                  {entry.examples.map((example, exampleIndex) => (
                    <li key={exampleIndex}>
                      <p lang="uk">{example.ukrainian}</p>
                      <AudioPlayer
                        compact
                        source={{
                          kind: "language",
                          resultId: result.id,
                          entryIndex: index,
                          exampleIndex,
                        }}
                        text={example.ukrainian}
                      />
                      <p>{example.french}</p>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          ))}
          {result.content.feedback.length > 0 && (
            <div className="language-feedback">
              <h3>Retour sur ton texte</h3>
              {result.content.feedback.map((feedback, index) => (
                <article key={index}>
                  <span
                    className={`language-tag language-feedback-${feedback.status}`}
                  >
                    {feedback.status === "acceptable"
                      ? "Formulation acceptable"
                      : feedback.status === "improve"
                        ? "Piste d’amélioration"
                        : "À vérifier"}
                  </span>
                  <p className="language-preserve">
                    <strong>Ton texte :</strong> {feedback.original}
                  </p>
                  {feedback.suggestion && (
                    <p className="language-preserve">
                      <strong>Proposition :</strong> {feedback.suggestion}
                    </p>
                  )}
                  <p>{feedback.explanation}</p>
                </article>
              ))}
            </div>
          )}
          {result.content.practice && (
            <p className="language-practice">
              <strong>Pour réutiliser :</strong> {result.content.practice}
            </p>
          )}
          <div className="language-actions">
            <button
              className="button button-primary"
              onClick={saveResult}
              disabled={disabled || Boolean(result.savedAt)}
            >
              {result.savedAt ? "Fiche enregistrée" : "Enregistrer cette fiche"}
            </button>
            {result.savedAt && (
              <span className="language-hint">
                Retrouvable dans « Mes fiches enregistrées ».
              </span>
            )}
          </div>
        </section>
      )}

      <section
        className="language-panel"
        aria-labelledby="language-saved-title"
      >
        <h2 id="language-saved-title">Mes fiches enregistrées</h2>
        <p className="language-hint">
          Les références du cours se retrouvent avec le filtre de recherche. Les
          aides générées conservent le texte et le contexte de leur demande.
        </p>
        {savedResults.length === 0 ? (
          <p>
            {term
              ? "Aucune aide enregistrée ne correspond à cette recherche."
              : "Tes aides enregistrées apparaîtront ici."}
          </p>
        ) : (
          <div className="language-saved-grid">
            {savedResults.map((saved) => (
              <article key={saved.id}>
                <span className="language-tag language-generated">
                  Aide générée
                </span>
                <h3>{saved.content.title}</h3>
                <p>{saved.content.summary}</p>
                <button
                  className="language-text-button"
                  disabled={disabled}
                  onClick={() => {
                    setResult(saved);
                    persist(input, saved.id);
                    requestAnimationFrame(() => resultHeading.current?.focus());
                  }}
                >
                  Consulter cette fiche
                </button>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
