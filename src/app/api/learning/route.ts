import { getCourseDocument } from "@/lib/course-content";
import {
  NOTE_MAX_LENGTH,
  REPORT_MAX_LENGTH,
  selfReportLabels,
  type LearningCommand,
} from "@/lib/learning-types";
import { getLearningStore } from "@/lib/server/learning-service";
import { NoteConflictError } from "@/lib/server/learning-store";

import {
  RequestError,
  json,
  requireLocalRequest,
  readLocalJson,
} from "@/lib/server/local-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function readCommand(request: Request): Promise<LearningCommand> {
  const body = await readLocalJson(request);
  if (typeof body.moduleId !== "string" || typeof body.view !== "string") {
    throw new RequestError("Le support est manquant.");
  }
  const document = await getCourseDocument(body.moduleId, body.view);
  if (!document) throw new RequestError("Ce support n’existe pas.", 404);
  const sharedKeys = ["type", "moduleId", "view"];
  const knownKeys: Record<string, string[]> = {
    visit: [],
    checkpoint: ["sectionId"],
    note: ["text", "expectedRevision"],
    "self-report": ["level", "detail"],
  };
  const keys =
    typeof body.type === "string" && Object.hasOwn(knownKeys, body.type)
      ? knownKeys[body.type]
      : undefined;
  if (
    !keys ||
    Object.keys(body).some((key) => ![...sharedKeys, ...keys].includes(key))
  ) {
    throw new RequestError("Cette action est invalide.");
  }
  if (
    body.type === "checkpoint" &&
    body.sectionId !== null &&
    !document.sections.some((section) => section.id === body.sectionId)
  ) {
    throw new RequestError(
      "Ce passage n’existe plus. Choisis un passage dans la fiche actuelle.",
    );
  }
  if (
    body.type === "note" &&
    (typeof body.text !== "string" ||
      body.text.length > NOTE_MAX_LENGTH ||
      !Number.isSafeInteger(body.expectedRevision) ||
      (body.expectedRevision as number) < 0)
  ) {
    throw new RequestError("La note ou sa version est invalide.");
  }
  if (body.type === "self-report") {
    if (
      typeof body.level !== "string" ||
      !Object.hasOwn(selfReportLabels, body.level) ||
      typeof body.detail !== "string" ||
      body.detail.length > REPORT_MAX_LENGTH
    ) {
      throw new RequestError("Le bilan est invalide.");
    }
    if (
      ["with_help", "first_success", "delayed_success"].includes(body.level) &&
      !body.detail.trim()
    ) {
      throw new RequestError(
        "Ajoute le repère de travail qui accompagne ce résultat.",
      );
    }
  }
  return body as LearningCommand;
}

function handleError(error: unknown) {
  if (error instanceof RequestError)
    return json({ message: error.message }, error.status);
  if (error instanceof NoteConflictError) {
    return json(
      {
        message: "Une autre version de cette note a été enregistrée.",
        currentNote: error.currentNote,
      },
      409,
    );
  }
  console.error("Learning storage request failed", error);
  return json(
    {
      message:
        "Le suivi est momentanément indisponible. Tes modifications ne sont pas enregistrées ; conserve ton texte et réessaie.",
    },
    503,
  );
}

export async function GET(request: Request) {
  try {
    requireLocalRequest(request);
    const store = getLearningStore();
    return json(store.getOverview(store.getLocalUserId()));
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    requireLocalRequest(request, true);
    const command = await readCommand(request);
    const store = getLearningStore();
    const userId = store.getLocalUserId();
    const { moduleId, view } = command;
    switch (command.type) {
      case "visit":
        return json(store.recordVisit(userId, moduleId, view));
      case "checkpoint":
        return json(
          store.saveCheckpoint(userId, moduleId, view, command.sectionId),
        );
      case "note":
        return json(
          store.saveNote(
            userId,
            moduleId,
            view,
            command.text,
            command.expectedRevision,
          ),
        );
      case "self-report":
        return json(
          store.saveSelfReport(
            userId,
            moduleId,
            view,
            command.level,
            command.detail,
          ),
        );
    }
  } catch (error) {
    return handleError(error);
  }
}
