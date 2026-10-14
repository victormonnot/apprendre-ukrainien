import { expect, test, type Page } from "./fixtures";

const documents = [
  { slug: "cours", label: "Cours" },
  { slug: "vocabulaire", label: "Vocabulaire" },
  { slug: "exercices", label: "Exercices" },
] as const;

function documentPath(slug: string) {
  return `/parcours/01/${slug}`;
}

async function exerciseSections(page: Page) {
  const headings = page.locator("article.prose .exercise-instructions h3");
  await expect(headings.first()).toBeVisible();
  return headings.evaluateAll((headings) => {
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

test("offers six activities from the home page and keeps the main menu compact on desktop and mobile", async ({
  page,
  isMobile,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL("/");
  const activities = page.getByRole("navigation", {
    name: "Choisir une activité",
    exact: true,
  });
  await expect(activities).toBeVisible();
  expect(
    await activities
      .getByRole("link")
      .evaluateAll((links) => links.map((link) => link.getAttribute("href"))),
  ).toEqual([
    "/revisions",
    "/atelier",
    "/cafe",
    "/studio",
    "/ressources",
    "/parcours",
  ]);
  for (const link of await activities.getByRole("link").all()) {
    await expect(link).toBeVisible();
  }

  const navigation = page.getByRole("navigation", {
    name: "Navigation principale",
    exact: true,
    includeHidden: true,
  });
  const menu = page.getByRole("button", { name: "Menu", exact: true });
  if (isMobile) {
    await expect(menu).toHaveAttribute("aria-expanded", "false");
    await expect(navigation).toBeHidden();
    await menu.click();
    await expect(menu).toHaveAttribute("aria-expanded", "true");
  } else {
    await expect(menu).toBeHidden();
  }
  await expect(navigation).toBeVisible();
  expect(
    await navigation
      .getByRole("link")
      .evaluateAll((links) => links.map((link) => link.getAttribute("href"))),
  ).toEqual(["/", "/revisions", "/atelier", "/immersion", "/parcours"]);
  await expect(navigation.locator('[aria-current="page"]')).toHaveCount(1);
  await expect(navigation.locator('a[href="/"]')).toHaveAttribute(
    "aria-current",
    "page",
  );
  await navigation
    .getByRole("link", { name: "Immersion", exact: true })
    .click();
  await expect(page).toHaveURL("/immersion");
  if (isMobile) {
    await expect(menu).toHaveAttribute("aria-expanded", "false");
    await expect(navigation).toBeHidden();
  }
  await page.locator(".brand").click();
  await expect(page).toHaveURL("/");

  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport + 1);
  expect(dimensions.body).toBeLessThanOrEqual(dimensions.viewport + 1);
});

test("keeps the menu and draft when navigation is cancelled, then closes it after leaving", async ({
  page,
  isMobile,
}) => {
  await page.goto("/parcours/01/cours");
  await page.getByText("Mon suivi et mes notes", { exact: true }).click();
  const note = page.getByRole("textbox", {
    name: "Ma note personnelle",
    exact: true,
  });
  await expect(note).toBeEnabled();
  await note.fill("Un brouillon conservé pendant la navigation.");
  const menu = page.getByRole("button", { name: "Menu", exact: true });
  if (isMobile) await menu.click();
  const navigation = page.getByRole("navigation", {
    name: "Navigation principale",
    exact: true,
  });
  const home = navigation.getByRole("link", { name: "Accueil", exact: true });
  page.once("dialog", (dialog) => dialog.dismiss());
  await home.click();
  await expect(page).toHaveURL("/parcours/01/cours");
  await expect(navigation).toBeVisible();
  await expect(note).toHaveValue(
    "Un brouillon conservé pendant la navigation.",
  );
  if (isMobile) {
    await expect(menu).toHaveAttribute("aria-expanded", "true");
    await menu.focus();
    await page.keyboard.press("Escape");
    await expect(menu).toHaveAttribute("aria-expanded", "false");
    await expect(menu).toBeFocused();
    await menu.click();
  }
  page.once("dialog", (dialog) => dialog.accept());
  await home.click();
  await expect(page).toHaveURL("/");
  if (isMobile) await expect(menu).toHaveAttribute("aria-expanded", "false");
});

test("groups the cafe, listening studio and media library under immersion while keeping their direct links", async ({
  page,
}) => {
  await page.goto("/immersion");
  await expect(
    page.getByRole("heading", { name: "Immersion", exact: true, level: 1 }),
  ).toBeVisible();
  for (const href of ["/cafe", "/studio", "/ressources"]) {
    await expect(page.locator(`main a[href="${href}"]`).first()).toBeVisible();
  }
  await page.locator('main a[href="/cafe"]').first().click();

  const localNavigation = page.getByRole("navigation", {
    name: "Explorer l’immersion",
    exact: true,
  });
  const mainNavigation = page.getByRole("navigation", {
    name: "Navigation principale",
    exact: true,
    includeHidden: true,
  });
  for (const href of ["/cafe", "/studio", "/ressources"]) {
    await localNavigation.locator(`a[href="${href}"]`).click();
    await expect(page).toHaveURL(href);
    await expect(localNavigation).toBeVisible();
    await expect(localNavigation.locator('[aria-current="page"]')).toHaveCount(
      1,
    );
    await expect(localNavigation.locator(`a[href="${href}"]`)).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(mainNavigation.locator('[aria-current="page"]')).toHaveCount(
      1,
    );
    await expect(
      mainNavigation.locator('a[href="/immersion"]'),
    ).toHaveAttribute("aria-current", "page");
  }
  await page.goto("/ressources/ulp-001");
  await expect(
    localNavigation.locator('a[href="/ressources"]'),
  ).toHaveAttribute("aria-current", "page");
  await expect(mainNavigation.locator('a[href="/immersion"]')).toHaveAttribute(
    "aria-current",
    "page",
  );
});

test("opens the module and moves between its three connected documents", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL("/");
  await page.locator('main a[href="/parcours"]').click();
  await expect(page).toHaveURL("/parcours");
  await expect(
    page.getByRole("heading", { name: "Cours & fiches", exact: true }),
  ).toBeVisible();
  await page
    .locator('[aria-labelledby="module-01"]')
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

test("opens the next module and keeps vocabulary and exercise navigation in that module", async ({
  page,
}) => {
  await page.goto("/parcours");
  await expect(
    page.getByText("2 modules disponibles", { exact: true }),
  ).toBeVisible();
  await page
    .locator('[aria-labelledby="module-02"]')
    .getByRole("link", { name: "Ouvrir le cours", exact: true })
    .click();
  await expect(page).toHaveURL("/parcours/02/cours");
  const moduleNavigation = page.getByRole("navigation", {
    name: "Supports du module",
    exact: true,
  });
  for (const document of documents.slice(1)) {
    await expect(
      moduleNavigation.getByRole("link", { name: document.label, exact: true }),
    ).toHaveAttribute("href", `/parcours/02/${document.slug}`);
    await moduleNavigation
      .getByRole("link", { name: document.label, exact: true })
      .click();
    await expect(page).toHaveURL(`/parcours/02/${document.slug}`);
  }
  await page
    .getByRole("navigation", { name: "Passer à un autre module", exact: true })
    .getByRole("link")
    .click();
  await expect(page).toHaveURL("/parcours/01/exercices");
  await page
    .getByRole("navigation", { name: "Passer à un autre module", exact: true })
    .getByRole("link")
    .click();
  await expect(page).toHaveURL("/parcours/02/exercices");

  for (const document of documents.slice(1)) {
    await page.goto(`/parcours?view=${document.slug}`);
    const action =
      document.slug === "vocabulaire"
        ? "Ouvrir le vocabulaire"
        : "Ouvrir les exercices";
    await page
      .locator('[aria-labelledby="module-02"]')
      .getByRole("link", { name: action, exact: true })
      .click();
    await expect(page).toHaveURL(`/parcours/02/${document.slug}`);
  }
});

test("contents links address unique, stable headings in every document", async ({
  page,
}) => {
  for (const document of documents) {
    await page.goto(documentPath(document.slug));
    const headings = page.locator("article.prose h2, article.prose h3[id]");
    await expect(headings.first()).toBeVisible();
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
    ...["01", "02"].flatMap((moduleId) =>
      documents.map((document) => `/parcours/${moduleId}/${document.slug}`),
    ),
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
  const hideWorkspaces = await page.addStyleTag({
    content: ".exercise-workspace, .audio-player { display: none !important; }",
  });
  const screenText = (await article.innerText()).replace(/\s+/g, " ").trim();
  await hideWorkspaces.evaluate((element) =>
    element.parentNode?.removeChild(element),
  );

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
  await expect(article.locator(".exercise-workspace").first()).toBeHidden();
  expect((await article.innerText()).replace(/\s+/g, " ").trim()).toBe(
    screenText,
  );
  for (const block of await article.locator(".exercise-instructions").all()) {
    await expect(block.locator("h3")).toBeVisible();
  }
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
    await expect(page).toHaveURL("/");
  }
});
