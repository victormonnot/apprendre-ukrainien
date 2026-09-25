import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { cache } from "react";
import { getModule } from "@/content/catalog";
import { prepareDocument } from "@/lib/markdown";

export const getCourseDocument = cache(
  async (moduleId: string, view: string) => {
    const learningModule = getModule(moduleId);
    const document = learningModule?.documents.find(
      (item) => item.view === view,
    );
    if (!learningModule || !document) return null;

    const filename = path.join(
      process.cwd(),
      "src/content/modules",
      learningModule.id,
      document.filename,
    );
    const source = await readFile(filename, "utf8");
    return { module: learningModule, document, ...prepareDocument(source) };
  },
);
