export type SceneRoleId = "anna" | "maxime";
export type SceneCharacter = {
  id: SceneRoleId;
  name: string;
  ukrainian: string;
  description: string;
};
export type SceneLine = {
  id: string;
  speakerId: SceneRoleId;
  ukrainian: string;
  french: string;
  direction: string;
  prompt: string;
  /** Pedagogical Markdown, with whole stressed syllables in bold. */
  help: string;
  referenceIds: string[];
};
export type SceneDefinition = {
  id: string;
  version: number;
  variantId: string;
  title: string;
  variantLabel: string;
  description: string;
  setting: string;
  moduleId: string;
  sourceHref: string;
  characters: SceneCharacter[];
  lines: SceneLine[];
};
export type SceneDraft = {
  revision: number;
  answers: Record<string, string>;
  helpUsed: boolean;
  updatedAt: string | null;
};
export type SceneFeedback = {
  lineId: string;
  answer: string;
  reference: string;
  status: "matches" | "compare";
};
export type SceneAttempt = {
  id: string;
  requestId: string;
  scene: SceneDefinition;
  roleId: SceneRoleId;
  answers: Record<string, string>;
  helpUsed: boolean;
  feedback: SceneFeedback[];
  submittedAt: string;
};
export type SceneWorkspace = {
  scene: SceneDefinition;
  roleId: SceneRoleId;
  draft: SceneDraft;
  attempts: SceneAttempt[];
};
export type SceneCommand = {
  type: "save" | "submit";
  requestId: string;
  sceneId: string;
  variantId: string;
  version: number;
  roleId: SceneRoleId;
  expectedRevision: number;
  answers: Record<string, string>;
  helpUsed: boolean;
};
export const SCENE_ANSWER_MAX_LENGTH = 500;
