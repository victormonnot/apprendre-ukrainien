"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import Markdown from "react-markdown";
import { AudioPlayer } from "@/components/audio-player";
import { loadSceneWorkspace, updateScene } from "@/lib/scene-client";
import {
  SCENE_ANSWER_MAX_LENGTH,
  type SceneCommand,
  type SceneDefinition,
  type SceneRoleId,
  type SceneWorkspace,
} from "@/lib/scene-types";
import { rehypeUkrainianLanguage } from "@/lib/markdown";
import { useUnsavedWork } from "@/lib/use-unsaved-work";

type LocalCopy = {
  answers: Record<string, string>;
  helpUsed: boolean;
  revision: number;
  pending: SceneCommand | null;
};
function equalAnswers(a: Record<string, string>, b: Record<string, string>) {
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].every(
    (key) => (a[key] ?? "") === (b[key] ?? ""),
  );
}
function storageKey(scene: SceneDefinition, role: SceneRoleId) {
  return `cafe-draft:${scene.id}:${scene.variantId}:${scene.version}:${role}`;
}
function readCopy(scene: SceneDefinition, role: SceneRoleId): LocalCopy | null {
  try {
    const copy = JSON.parse(
      sessionStorage.getItem(storageKey(scene, role)) ?? "null",
    ) as LocalCopy | null;
    if (
      !copy ||
      typeof copy.helpUsed !== "boolean" ||
      !Number.isSafeInteger(copy.revision) ||
      !copy.answers ||
      typeof copy.answers !== "object" ||
      Array.isArray(copy.answers)
    )
      return null;
    const ids = scene.lines
      .filter((line) => line.speakerId === role)
      .map((line) => line.id);
    if (
      Object.entries(copy.answers).some(
        ([id, answer]) =>
          !ids.includes(id) ||
          typeof answer !== "string" ||
          answer.length > SCENE_ANSWER_MAX_LENGTH,
      )
    )
      return null;
    const command = copy.pending;
    if (
      command &&
      (command.sceneId !== scene.id ||
        command.variantId !== scene.variantId ||
        command.version !== scene.version ||
        command.roleId !== role ||
        !["save", "submit"].includes(command.type) ||
        command.expectedRevision !== copy.revision ||
        command.helpUsed !== copy.helpUsed ||
        !equalAnswers(command.answers, copy.answers))
    )
      copy.pending = null;
    return copy;
  } catch {
    return null;
  }
}

export function ScenePractice({
  scene,
  beforeLeaveRef,
}: {
  scene: SceneDefinition;
  beforeLeaveRef: RefObject<() => Promise<boolean>>;
}) {
  const [role, setRole] = useState<SceneRoleId>("maxime");
  const [workspace, setWorkspace] = useState<SceneWorkspace | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [helpUsed, setHelpUsed] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [consultedModel, setConsultedModel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [conflict, setConflict] = useState<SceneWorkspace | null>(null);
  const [reload, setReload] = useState(0);
  const [pending, setPending] = useState<SceneCommand | null>(null);
  const mounted = useRef(false);
  const inFlight = useRef(false);
  const ownLines = scene.lines.filter((line) => line.speakerId === role);
  const dirty =
    !!workspace &&
    (!equalAnswers(answers, workspace.draft.answers) ||
      helpUsed !== workspace.draft.helpUsed ||
      !!pending);
  useUnsavedWork(dirty);

  const remember = useCallback(
    (copy: LocalCopy | null) => {
      try {
        const key = storageKey(scene, role);
        if (copy) sessionStorage.setItem(key, JSON.stringify(copy));
        else sessionStorage.removeItem(key);
      } catch {
        /* The server remains the durable store; memory remains usable. */
      }
    },
    [scene, role],
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadSceneWorkspace(scene.id, scene.variantId, role, controller.signal)
      .then((value) => {
        if (controller.signal.aborted) return;
        const copy = readCopy(scene, role);
        const receivedSubmission =
          copy?.pending?.type === "submit" &&
          value.attempts.some(
            (attempt) => attempt.requestId === copy.pending?.requestId,
          );
        const receivedSave =
          copy?.pending?.type === "save" &&
          value.draft.revision > copy.revision &&
          equalAnswers(copy.answers, value.draft.answers) &&
          copy.helpUsed === value.draft.helpUsed;
        setWorkspace(value);
        setModels([]);
        setConsultedModel(false);
        setConflict(null);
        setError(null);
        if (copy && !receivedSubmission && !receivedSave) {
          setAnswers(copy.answers);
          setHelpUsed(copy.helpUsed || value.draft.helpUsed);
          setConsultedModel(copy.helpUsed);
          setPending(copy.pending);
          if (copy.revision !== value.draft.revision) {
            setConflict(value);
            setNotice(
              "Ton texte dans cet onglet et le brouillon enregistré sont différents. Compare-les avant de continuer.",
            );
          } else setNotice("Ton brouillon de cet onglet a été retrouvé.");
        } else {
          setAnswers(value.draft.answers);
          setHelpUsed(value.draft.helpUsed);
          setPending(null);
          remember(null);
          setNotice(
            receivedSubmission
              ? "Ton essai avait bien été remis. Il figure dans l’historique."
              : receivedSave
                ? "Ton brouillon avait bien été enregistré."
                : "",
          );
        }
        setLoading(false);
      })
      .catch((failure: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          failure instanceof Error
            ? failure.message
            : "Ton travail est indisponible. Réessaie.",
        );
        setLoading(false);
      });
    return () => controller.abort();
  }, [scene, role, remember, reload]);

  useEffect(() => {
    if (!workspace || loading || conflict) return;
    if (dirty)
      remember({
        answers,
        helpUsed,
        revision: workspace.draft.revision,
        pending,
      });
    else remember(null);
  }, [
    answers,
    helpUsed,
    pending,
    workspace,
    loading,
    conflict,
    dirty,
    remember,
  ]);

  const save = useCallback(
    async (type: "save" | "submit") => {
      if (!workspace || inFlight.current || loading || conflict) return false;
      if (type === "save" && !dirty) return true;
      const command = pending ?? {
        type,
        requestId: crypto.randomUUID(),
        sceneId: scene.id,
        variantId: scene.variantId,
        version: scene.version,
        roleId: role,
        expectedRevision: workspace.draft.revision,
        answers,
        helpUsed,
      };
      setPending(command);
      remember({
        answers,
        helpUsed,
        revision: workspace.draft.revision,
        pending: command,
      });
      inFlight.current = true;
      setBusy(true);
      setError(null);
      try {
        const value = await updateScene(command);
        if (!mounted.current) return false;
        setWorkspace(value);
        setAnswers(value.draft.answers);
        setHelpUsed(value.draft.helpUsed);
        setPending(null);
        setModels([]);
        if (command.type === "submit") setConsultedModel(false);
        remember(null);
        setNotice(
          command.type === "submit"
            ? "Essai conservé. Compare tes réponses au modèle ci-dessous ; tu peux ensuite réessayer."
            : "Brouillon enregistré.",
        );
        return true;
      } catch (failure) {
        if (!mounted.current) return false;
        setError(
          failure instanceof Error
            ? failure.message
            : "L’enregistrement a échoué. Ton texte reste ici.",
        );
        if (
          failure &&
          typeof failure === "object" &&
          "status" in failure &&
          failure.status === 409
        ) {
          try {
            const value = await loadSceneWorkspace(
              scene.id,
              scene.variantId,
              role,
            );
            if (mounted.current) setConflict(value);
          } catch {
            /* Keep the exact pending command for a later retry. */
          }
        } else if (
          failure &&
          typeof failure === "object" &&
          "status" in failure &&
          failure.status === 400
        )
          setPending(null);
        return false;
      } finally {
        inFlight.current = false;
        if (mounted.current) setBusy(false);
      }
    },
    [
      workspace,
      loading,
      conflict,
      dirty,
      pending,
      scene,
      role,
      answers,
      helpUsed,
      remember,
    ],
  );

  useEffect(() => {
    beforeLeaveRef.current = async () => {
      if (inFlight.current || conflict) return false;
      return dirty ? save("save") : true;
    };
    return () => {
      beforeLeaveRef.current = async () => true;
    };
  }, [beforeLeaveRef, conflict, dirty, save]);

  async function chooseRole(next: SceneRoleId) {
    if (next === role || !(await beforeLeaveRef.current())) return;
    setLoading(true);
    setWorkspace(null);
    setPending(null);
    setAnswers({});
    setRole(next);
  }
  function resolveConflict(useLocal: boolean) {
    if (!conflict) return;
    setWorkspace(conflict);
    setPending(null);
    if (!useLocal) {
      setAnswers(conflict.draft.answers);
      setHelpUsed(conflict.draft.helpUsed);
      remember(null);
    } else {
      setHelpUsed(helpUsed || conflict.draft.helpUsed);
      remember({
        answers,
        helpUsed: helpUsed || conflict.draft.helpUsed,
        revision: conflict.draft.revision,
        pending: null,
      });
    }
    setConflict(null);
    setError(null);
    setNotice(
      useLocal
        ? "Ton texte est conservé dans les champs. Enregistre-le pour remplacer le brouillon après comparaison."
        : "Le brouillon enregistré est maintenant affiché.",
    );
  }
  const locked = busy || loading || !!pending || !!conflict;
  return (
    <section className="cafe-practice" aria-labelledby="cafe-practice-title">
      <div className="cafe-practice-heading">
        <div>
          <p className="eyebrow">À toi de jouer</p>
          <h2 id="cafe-practice-title">Prendre un rôle à l’écrit</h2>
        </div>
        <div className="cafe-select-field">
          <label htmlFor="cafe-role">Mon personnage</label>
          <select
            id="cafe-role"
            value={role}
            disabled={busy || loading || !!conflict}
            onChange={(event) =>
              void chooseRole(event.target.value as SceneRoleId)
            }
          >
            {scene.characters.map((character) => (
              <option key={character.id} value={character.id}>
                {character.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p>
        Écris les répliques de ton personnage en ukrainien. Les indications en
        français donnent l’intention. Tu peux consulter un modèle si tu en as
        besoin.
      </p>
      {loading && <p role="status">Chargement de ton travail…</p>}
      {error && (
        <div role="alert" className="cafe-error">
          {error}
          {!workspace && (
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                setReload((value) => value + 1);
              }}
            >
              Réessayer le chargement
            </button>
          )}
        </div>
      )}
      {notice && (
        <p className="cafe-notice" role="status">
          {notice}
        </p>
      )}
      {conflict && (
        <div className="cafe-conflict">
          <h3>Comparer les deux brouillons</h3>
          <p>
            Les champs conservent ton texte. Voici la version actuellement
            enregistrée :
          </p>
          {ownLines.map((line) => (
            <div key={line.id}>
              <strong>{line.prompt}</strong>
              <p lang="uk">{conflict.draft.answers[line.id] || "—"}</p>
            </div>
          ))}
          <p>Aide déclarée : {conflict.draft.helpUsed ? "oui" : "non"}.</p>
          <div className="cafe-actions">
            <button type="button" onClick={() => resolveConflict(true)}>
              Garder mon texte après comparaison
            </button>
            <button type="button" onClick={() => resolveConflict(false)}>
              Utiliser le brouillon enregistré
            </button>
          </div>
        </div>
      )}
      {workspace && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void save("submit");
          }}
        >
          <ol className="cafe-writing-lines">
            {scene.lines.map((line, index) => {
              const character = scene.characters.find(
                (entry) => entry.id === line.speakerId,
              )!;
              const own = line.speakerId === role;
              return (
                <li
                  key={line.id}
                  className={own ? "cafe-your-turn" : "cafe-partner-turn"}
                >
                  {line.direction && (
                    <p className="cafe-direction">{line.direction}</p>
                  )}
                  <span className="cafe-speaker">
                    {String(index + 1).padStart(2, "0")} · {character.name}
                    {own ? " · Toi" : ""}
                  </span>
                  {own ? (
                    <>
                      <label htmlFor={`answer-${line.id}`}>{line.prompt}</label>
                      <textarea
                        id={`answer-${line.id}`}
                        lang="uk"
                        maxLength={SCENE_ANSWER_MAX_LENGTH}
                        disabled={locked}
                        value={answers[line.id] ?? ""}
                        spellCheck={false}
                        onChange={(event) => {
                          setAnswers((old) => ({
                            ...old,
                            [line.id]: event.target.value,
                          }));
                          setNotice("");
                        }}
                      />
                      <button
                        className="cafe-model-button"
                        type="button"
                        disabled={busy || loading || !!pending || !!conflict}
                        aria-expanded={models.includes(line.id)}
                        onClick={() => {
                          setHelpUsed(true);
                          setConsultedModel(true);
                          setModels((old) =>
                            old.includes(line.id)
                              ? old.filter((id) => id !== line.id)
                              : [...old, line.id],
                          );
                        }}
                      >
                        {" "}
                        {models.includes(line.id)
                          ? "Masquer le modèle"
                          : "Voir le modèle"}
                      </button>
                      {models.includes(line.id) && (
                        <div className="cafe-model">
                          <p lang="uk">{line.ukrainian}</p>
                          <Markdown rehypePlugins={[rehypeUkrainianLanguage]}>
                            {line.help}
                          </Markdown>
                          <AudioPlayer
                            compact
                            text={line.ukrainian}
                            source={{
                              kind: "scene",
                              sceneId: scene.id,
                              variantId: scene.variantId,
                              version: scene.version,
                              lineId: line.id,
                            }}
                          />
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <p className="cafe-partner-uk" lang="uk">
                        {line.ukrainian}
                      </p>
                      <p>{line.french}</p>
                    </>
                  )}
                </li>
              );
            })}
          </ol>
          <label className="cafe-checkbox">
            <input
              type="checkbox"
              checked={helpUsed}
              disabled={locked || consultedModel || workspace.draft.helpUsed}
              onChange={(event) => setHelpUsed(event.target.checked)}
            />
            J’ai utilisé une aide pour cet essai (modèle, cours, dictionnaire…).
          </label>
          <p className="cafe-small">
            Une aide consultée ou déjà enregistrée reste indiquée pour cet
            essai. La comparaison écrite ne valide ni la prononciation ni la
            maîtrise.
          </p>
          <div className="cafe-actions">
            <button
              type="button"
              disabled={busy || loading || !!conflict || (!dirty && !pending)}
              onClick={() => void save("save")}
            >
              {pending ? "Réessayer l’envoi" : "Enregistrer le brouillon"}
            </button>
            <button
              className="cafe-primary"
              type="submit"
              disabled={
                locked ||
                ownLines.some((line) => !(answers[line.id] ?? "").trim())
              }
            >
              Remettre mon essai
            </button>
          </div>
          <p className="cafe-small">
            {busy
              ? "Enregistrement…"
              : dirty
                ? "Modifications à enregistrer."
                : workspace.draft.updatedAt
                  ? "Brouillon conservé dans l’application."
                  : "Les réponses seront conservées avec cette version de la scène."}
          </p>
        </form>
      )}
      {!!workspace?.attempts.length && (
        <section className="cafe-history" aria-labelledby="cafe-history-title">
          <h3 id="cafe-history-title">Mes essais conservés</h3>
          <p>
            Une formulation différente reste à comparer ; elle n’est pas
            déclarée fausse automatiquement.
          </p>
          {workspace.attempts.map((attempt, index) => (
            <details key={attempt.id} open={index === 0}>
              <summary>
                {attempt.scene.variantLabel} ·{" "}
                {new Date(attempt.submittedAt).toLocaleString("fr-FR")} ·{" "}
                {attempt.helpUsed ? "Avec aide" : "Sans aide déclarée"}
              </summary>
              {attempt.feedback.map((entry) => (
                <div className="cafe-feedback" key={entry.lineId}>
                  <p>
                    {
                      attempt.scene.lines.find(
                        (line) => line.id === entry.lineId,
                      )?.prompt
                    }
                  </p>
                  <p>
                    <strong>Ta réponse :</strong>{" "}
                    <span lang="uk">{entry.answer}</span>
                  </p>
                  <p>
                    <strong>Modèle :</strong>{" "}
                    <span lang="uk">{entry.reference}</span>
                  </p>
                  <span className="cafe-comparison">
                    {entry.status === "matches"
                      ? "Forme du modèle retrouvée"
                      : "Formulation à comparer"}
                  </span>
                </div>
              ))}
            </details>
          ))}
        </section>
      )}
    </section>
  );
}
