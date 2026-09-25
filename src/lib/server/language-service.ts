import "server-only";
import { reviewElements } from "@/content/reviews";
import type {
  LanguageInput,
  LanguageReference,
  LanguageResult,
} from "@/lib/language-types";
import { getExerciseStore } from "./exercise-service";
import { getCourseDocument } from "../course-content";
import {
  openLanguageStore,
  languageInputKey,
  LanguageRequestConflictError,
} from "./language-store";
import { generateLanguageResult } from "./language-provider";
import { RequestError } from "./local-request";
import { submittedLanguageInput } from "./language-input";
import {
  assertWorkspaceGeneration,
  getWorkspaceGeneration,
  WorkspaceChangedError,
} from "./workspace-generation";

const state = globalThis as typeof globalThis & {
  languageStore?: ReturnType<typeof openLanguageStore>;
  languageRequests?: Map<
    string,
    { input: string; promise: Promise<LanguageResult> }
  >;
  languageCalls?: Map<string, number[]>;
};
export function getLanguageStore() {
  state.languageStore ??= openLanguageStore();
  return state.languageStore;
}
export function languageConfigured() {
  return !!process.env.OPENAI_API_KEY?.trim();
}
export const languageReferences: LanguageReference[] = reviewElements.map(
  (element) => {
    const card = element.cards[0]!;
    return {
      id: element.id,
      label: element.label,
      kind: element.kind,
      french: card.answer,
      details: card.details,
      sourceHref: element.sourceHref,
    };
  },
);
export function getSubmittedInput(
  userId: string,
  exerciseId: string,
  attemptId: string,
) {
  const attempt = getExerciseStore()
    .getWorkspace(userId, exerciseId)
    .attempts.find((entry) => entry.id === attemptId);
  if (!attempt)
    throw new RequestError(
      "Cette remise est introuvable. Remets tes réponses avant de demander une relecture.",
      404,
    );
  return submittedLanguageInput(attempt);
}
export async function resolveLanguageInput(
  userId: string,
  input: LanguageInput,
): Promise<LanguageInput> {
  if (input.source?.kind === "exercise") {
    const snapshot = getSubmittedInput(
      userId,
      input.source.exerciseId,
      input.source.attemptId,
    );
    return { ...snapshot, context: input.context };
  }
  if (input.source?.kind === "document") {
    const source = input.source;
    const doc = await getCourseDocument(source.moduleId, source.view);
    if (
      !doc ||
      (source.anchor &&
        !doc.sections.some((section) => section.id === source.anchor))
    )
      throw new RequestError("Ce passage du cours est introuvable.", 404);
  }
  return input;
}
export async function requestLanguageResult(
  userId: string,
  requestId: string,
  input: LanguageInput,
) {
  const generation = getWorkspaceGeneration();
  const store = getLanguageStore();
  const serialized = languageInputKey(input);
  const existing = store.getByRequestId(userId, requestId);
  if (existing) {
    if (languageInputKey(existing.input) !== serialized)
      throw new LanguageRequestConflictError();
    return existing;
  }
  state.languageRequests ??= new Map();
  state.languageCalls ??= new Map();
  const owner = `${generation}:${userId}`;
  const key = `${owner}:${requestId}`;
  const current = state.languageRequests.get(key);
  if (current) {
    if (current.input !== serialized) throw new LanguageRequestConflictError();
    return current.promise;
  }
  if (
    [...state.languageRequests.keys()].some((value) =>
      value.startsWith(`${owner}:`),
    )
  )
    throw new RequestError(
      "Une demande est déjà en cours. Attends sa réponse avant d’en envoyer une autre.",
      429,
    );
  const now = Date.now();
  const recent = (state.languageCalls.get(owner) ?? []).filter(
    (time) => now - time < 60_000,
  );
  if (recent.length >= 4)
    throw new RequestError(
      "Plusieurs demandes viennent d’être envoyées. Réessaie dans une minute.",
      429,
    );
  if (languageConfigured()) state.languageCalls.set(owner, [...recent, now]);
  const promise = (async () => {
    const generated = await generateLanguageResult(input);
    assertWorkspaceGeneration(generation);
    return store.recordResult(userId, { requestId, input, ...generated });
  })().catch((error: unknown) => {
    if (error instanceof WorkspaceChangedError)
      throw new RequestError(error.message, error.status);
    throw error;
  });
  state.languageRequests.set(key, { input: serialized, promise });
  try {
    return await promise;
  } finally {
    if (state.languageRequests.get(key)?.promise === promise)
      state.languageRequests.delete(key);
  }
}
