export type LearningResource = {
  id: string;
  moduleId: string;
  title: string;
  author: string;
  kind: "podcast" | "video" | "guide";
  description: string;
  language: string;
  durationSeconds: number | null;
  sourceUrl: string;
  verifiedOn: string;
  objective: string;
  steps: string[];
  connections: { label: string; href: string }[];
  media:
    | { kind: "audio"; url: string }
    | { kind: "youtube"; videoId: string }
    | null;
};
export type ResourceState = {
  resourceId: string;
  notes: string;
  notesRevision: number;
  positionSeconds: number | null;
  positionRevision: number;
  openedAt: string | null;
  updatedAt: string | null;
};
export type ResourceWorkspace = {
  resource: LearningResource;
  state: ResourceState;
};
export type ResourceCommand =
  | { type: "open"; requestId: string; resourceId: string }
  | {
      type: "save-notes";
      requestId: string;
      resourceId: string;
      expectedRevision: number;
      notes: string;
    }
  | {
      type: "save-position";
      requestId: string;
      resourceId: string;
      expectedRevision: number;
      positionSeconds: number | null;
    };
export const RESOURCE_NOTES_MAX_LENGTH = 10_000;
export const RESOURCE_POSITION_MAX_SECONDS = 86_400;
