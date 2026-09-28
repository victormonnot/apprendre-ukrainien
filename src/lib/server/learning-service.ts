import "server-only";
import { openLearningStore } from "./learning-store";
import { getRequestStore } from "./account-context";

export function getLearningStore() {
  return getRequestStore("learning", openLearningStore);
}
