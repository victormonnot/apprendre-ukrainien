import { modules } from "./catalog.ts";
import { reviewElements } from "./reviews.ts";

// Membership is resolved from the published catalogue, never from client input.
export const reviewPacks = modules.map((module) => ({
  id: `module-${module.id}`,
  moduleId: module.id,
  title: module.title,
  description: module.description,
  elementIds: reviewElements
    .filter((element) => element.moduleId === module.id)
    .map((element) => element.id),
}));

export function getReviewPack(id: string) {
  return reviewPacks.find((pack) => pack.id === id);
}
