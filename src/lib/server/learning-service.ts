import "server-only";
import { openLearningStore } from "./learning-store";

const processState = globalThis as typeof globalThis & {
  learningStore?: ReturnType<typeof openLearningStore>;
};

export function getLearningStore() {
  processState.learningStore ??= openLearningStore();
  return processState.learningStore;
}
