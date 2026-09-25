import { expect, test, type Page } from "@playwright/test";

const documents = [
  { slug: "cours", label: "Cours" },
  { slug: "vocabulaire", label: "Vocabulaire" },
  { slug: "exercices", label: "Exercices" },
] as const;

function documentPath(slug: string) {
  return `/parcours/01/${slug}`;
}

async function exerciseSections(page: Page) {
  return page.locator("article.prose h3").evaluateAll((headings) => {
    const exercises: Record<string, string> = {};

    for (const heading of headings) {
      const match = heading.textContent?.match(/^Exercice\s+(\d+)\s*[—–-]/);
      const number = match?.[1];
      if (!number) continue;

      const parts = [heading.textContent ?? ""];
      let sibling = heading.nextElementSibling;

      while (sibling && !/^H[1-3]$/.test(sibling.tagName)) {
        parts.push(sibling.textContent ?? "");
        sibling = sibling.nextElementSibling;
      }

      exercises[number] = parts.join(" ").replace(/\s+/g, " ").trim();
    }

    return exercises;
  });
}

test("opens the module and moves between its three connected documents", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL("/parcours");
  await page
    .getByRole("link", { name: "Ouvrir le cours", exact: true })
    .click();
  await expect(page).toHaveURL(documentPath("cours"));

  for (const document of documents) {
    const navigation = page.getByRole("navigation", {
      name: "Supports du module",
      exact: true,
    });
    await navigation
      .getByRole("link", { name: document.label, exact: true })
      .click();

    await expect(page).toHaveURL(documentPath(document.slug));
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page.locator("article.prose")).toBeVisible();
    await expect(navigation.locator('[aria-current="page"]')).toHaveCount(1);
    await expect(
      navigation.getByRole("link", { name: document.label, exact: true }),
    ).toHaveAttribute("aria-current", "page");
  }
});

test("contents links address unique, stable headings in every document", async ({
  page,
}) => {
  for (const document of documents) {
    await page.goto(documentPath(document.slug));
    const headings = page.locator("article.prose h2, article.prose h3");
    const ids = await headings.evaluateAll((elements) =>
      elements.map((element) => element.id),
    );

    expect(ids.length).toBeGreaterThan(0);
    expect(ids.every(Boolean)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);

    const mobileContents = page.locator("details").filter({
      has: page.getByRole("navigation", {
        name: "Sommaire",
        exact: true,
        includeHidden: true,
      }),
    });
    for (const details of await mobileContents.all()) {
      if (
        (await details.isVisible()) &&
        (await details.getAttribute("open")) === null
      ) {
        await details.locator("summary").click();
      }
    }

    const contents = page
      .getByRole("navigation", { name: "Sommaire", exact: true })
      .first();
    const links = contents.getByRole("link");
    const targets = await links.evaluateAll((elements) =>
      elements.map((element) =>
        decodeURIComponent(element.getAttribute("href")?.slice(1) ?? ""),
      ),
    );
    const sectionIds = await page
      .locator("article.prose h2")
      .evaluateAll((elements) => elements.map((element) => element.id));

    expect(targets).toEqual(sectionIds);
    await links.last().click();
    expect(decodeURIComponent(new URL(page.url()).hash.slice(1))).toBe(
      sectionIds.at(-1),
    );
    await expect(page.locator("article.prose h2").last()).toBeInViewport();

    await page.reload();
    await expect(headings).toHaveCount(ids.length);
    expect(
      await headings.evaluateAll((elements) =>
        elements.map((element) => element.id),
      ),
    ).toEqual(ids);
  }
});

test("keeps shared exercises identical and adds the five numbered complements", async ({
  page,
}) => {
  await page.goto(documentPath("cours"));
  const courseExercises = await exerciseSections(page);
  expect(Object.keys(courseExercises)).toEqual(
    Array.from({ length: 8 }, (_, index) => String(index + 1)),
  );

  await page.goto(documentPath("exercices"));
  const worksheetExercises = await exerciseSections(page);
  expect(Object.keys(worksheetExercises)).toEqual(
    Array.from({ length: 13 }, (_, index) => String(index + 1)),
  );

  for (const [number, contents] of Object.entries(courseExercises)) {
    expect(contents.length).toBeGreaterThan(80);
    expect(worksheetExercises[number], `Exercise ${number}`).toBe(contents);
  }
  for (let number = 9; number <= 13; number += 1) {
    expect(worksheetExercises[String(number)]?.length).toBeGreaterThan(80);
  }
});

test("keeps the catalogue and long documents within the mobile viewport", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "This check targets the narrow mobile layout.");

  for (const path of [
    "/parcours",
    ...documents.map((document) => documentPath(document.slug)),
  ]) {
    await page.goto(path);
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
    }));

    expect(dimensions.document, path).toBeLessThanOrEqual(
      dimensions.viewport + 1,
    );
    expect(dimensions.body, path).toBeLessThanOrEqual(dimensions.viewport + 1);
  }
});

test("prints the complete course and tables without navigation or clipped containers", async ({
  page,
}) => {
  await page.goto(documentPath("cours"));
  const article = page.locator("article.prose");
  const screenText = (await article.innerText()).replace(/\s+/g, " ").trim();

  await page.evaluate(() => {
    window.print = () => {
      document.documentElement.dataset.printRequested = "true";
    };
  });
  await page.getByRole("button", { name: /Imprimer/ }).click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-print-requested",
    "true",
  );

  await page.emulateMedia({ media: "print" });
  await expect(article).toBeVisible();
  expect((await article.innerText()).replace(/\s+/g, " ").trim()).toBe(
    screenText,
  );
  await expect(page.getByRole("button", { name: /Imprimer/ })).toHaveCount(0);
  await expect(page.getByRole("navigation")).toHaveCount(0);

  const tables = article.locator("table");
  expect(await tables.count()).toBeGreaterThan(0);
  for (const table of await tables.all()) {
    await expect(table).toBeVisible();
  }

  const clippingContainers = await tables.evaluateAll((elements) => {
    const clipped = new Set<string>();
    for (const table of elements) {
      let ancestor: Element | null = table.parentElement;
      while (ancestor && ancestor !== document.body) {
        const style = getComputedStyle(ancestor);
        if (
          [style.overflowX, style.overflowY].some((overflow) =>
            ["auto", "scroll", "hidden", "clip"].includes(overflow),
          )
        ) {
          clipped.add(`${ancestor.tagName}.${ancestor.className}`);
        }
        ancestor = ancestor.parentElement;
      }
    }
    return [...clipped];
  });
  expect(clippingContainers).toEqual([]);
});

test("returns a real 404 for an unknown module or document", async ({
  page,
}) => {
  for (const path of ["/parcours/99/cours", "/parcours/01/inconnu"]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page.locator("article.prose")).toHaveCount(0);
    await page.getByRole("link", { name: /Revenir à l’accueil/ }).click();
    await expect(page).toHaveURL("/parcours");
  }
});
