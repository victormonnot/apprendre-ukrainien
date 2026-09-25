import "server-only";
import { openReviewStore } from "./review-store";

const processState = globalThis as typeof globalThis & {
  reviewStore?: ReturnType<typeof openReviewStore>;
};

export function getReviewStore() {
  processState.reviewStore ??= openReviewStore();
  return processState.reviewStore;
}
