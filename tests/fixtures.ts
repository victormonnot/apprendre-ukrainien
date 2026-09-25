import { expect, test as base } from "@playwright/test";

export { expect } from "@playwright/test";
export type * from "@playwright/test";

export const test = base.extend({
  request: async ({ playwright, baseURL, extraHTTPHeaders }, run) => {
    const probe = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders,
    });
    let generation: string;
    try {
      const response = await probe.get("/api/workspace");
      expect(response.status()).toBe(200);
      const state = (await response.json()) as { generation?: unknown };
      expect(typeof state.generation).toBe("string");
      expect(state.generation).not.toBe("");
      generation = state.generation as string;
    } finally {
      await probe.dispose();
    }
    const request = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: {
        ...extraHTTPHeaders,
        "X-Workspace-Generation": generation,
      },
    });
    try {
      await run(request);
    } finally {
      await request.dispose();
    }
  },
});
