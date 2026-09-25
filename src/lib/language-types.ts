export type LanguageMode = "translate" | "explain" | "correct";
export type LanguageSource =
  | {
      kind: "document";
      moduleId: string;
      view: "cours" | "vocabulaire" | "exercices";
      anchor: string;
    }
  | { kind: "exercise"; exerciseId: string; attemptId: string };
export type LanguageInput = {
  mode: LanguageMode;
  text: string;
  context: string;
  source: LanguageSource | null;
};
export type LanguageExample = { ukrainian: string; french: string };
export type LanguageEntry = {
  ukrainian: string;
  french: string;
  usage: string;
  pronunciation: string;
  syllables: string[];
  stressIndex: number | null;
  examples: LanguageExample[];
};
export type LanguageResultContent = {
  title: string;
  summary: string;
  ambiguity: string;
  entries: LanguageEntry[];
  feedback: {
    original: string;
    suggestion: string;
    explanation: string;
    status: "acceptable" | "improve" | "uncertain";
  }[];
  practice: string;
};
export type LanguageResult = {
  id: string;
  requestId: string;
  input: LanguageInput;
  content: LanguageResultContent;
  model: string;
  createdAt: string;
  savedAt: string | null;
};
export type LanguageReference = {
  id: string;
  label: string;
  kind: "letter" | "word" | "expression";
  french: string;
  details: string;
  sourceHref: string;
};
export type LanguageLibrary = {
  configured: boolean;
  references: LanguageReference[];
  savedReferenceIds: string[];
  savedResults: LanguageResult[];
};
export const LANGUAGE_TEXT_MAX_LENGTH = 2_000;
export const LANGUAGE_CONTEXT_MAX_LENGTH = 2_000;
