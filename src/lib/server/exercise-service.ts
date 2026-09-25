import "server-only";
import { openExerciseStore } from "./exercise-store";

const processState = globalThis as typeof globalThis & {
  exerciseStore?: ReturnType<typeof openExerciseStore>;
};

export function getExerciseStore() {
  processState.exerciseStore ??= openExerciseStore();
  return processState.exerciseStore;
}
