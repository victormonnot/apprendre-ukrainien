import "server-only";
import { openExerciseStore } from "./exercise-store";
import { getRequestStore } from "./account-context";

export function getExerciseStore() {
  return getRequestStore("exercises", openExerciseStore);
}
