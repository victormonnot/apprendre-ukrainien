export type ExerciseAid = "none" | "resource" | "correction";

export type ExerciseField = {
  id: string;
  label: string;
  multiline?: boolean;
  options?: { value: string; label: string }[];
};

export type ExerciseItem = {
  id: string;
  label: string;
  fields: ExerciseField[];
};

export type ExerciseDefinition = {
  id: string;
  moduleId: string;
  number: number;
  title: string;
  version: number;
  items: ExerciseItem[];
  guidance?: string;
};

export type ExerciseAnswers = Record<
  string,
  {
    fields: Record<string, string>;
    aid: ExerciseAid | null;
  }
>;

export type FieldAssessment = {
  fieldId: string;
  status: "correct" | "incorrect" | "pending";
  feedback: string;
  expected?: string;
};

export type ItemAssessment = { itemId: string; fields: FieldAssessment[] };
export type ExerciseAssessment = {
  status: "corrected" | "partial" | "pending";
  items: ItemAssessment[];
};

export type ExerciseAttempt = {
  id: string;
  exerciseId: string;
  definitionVersion: number;
  definition: ExerciseDefinition;
  number: number;
  status: "draft" | "submitted";
  revision: number;
  retryOf: string | null;
  answers: ExerciseAnswers;
  workNote: string;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  assessment: ExerciseAssessment | null;
};

export type ExerciseWorkspaceState = {
  exerciseId: string;
  draft: ExerciseAttempt | null;
  attempts: ExerciseAttempt[];
};

export type ExerciseCommand =
  | { type: "start"; retryOf?: string }
  | {
      type: "save";
      attemptId: string;
      expectedRevision: number;
      answers: ExerciseAnswers;
      workNote: string;
    }
  | {
      type: "submit";
      attemptId: string;
      expectedRevision: number;
      answers: ExerciseAnswers;
      workNote: string;
    };

export const EXERCISE_FIELD_MAX_LENGTH = 2_000;
export const EXERCISE_WORK_NOTE_MAX_LENGTH = 2_000;
