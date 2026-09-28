import "server-only";
import { openReviewStore } from "./review-store";
import { getRequestStore } from "./account-context";

export function getReviewStore() {
  return getRequestStore("reviews", openReviewStore);
}
