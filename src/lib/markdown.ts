import GithubSlugger from "github-slugger";
import { toString } from "mdast-util-to-string";
import type { Root as MarkdownRoot } from "mdast";
import type { Element, Root as HtmlRoot, Text } from "hast";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import { unified } from "unified";

export type Section = { id: string; title: string };

function assignHeadingIds(tree: MarkdownRoot) {
  const slugger = new GithubSlugger();
  const sections: Section[] = [];
  const usedIds = new Set<string>();

  for (const node of tree.children) {
    if (node.type !== "heading") continue;
    const last = node.children.at(-1);
    const explicitId =
      last?.type === "text"
        ? last.value.match(/\s+\{#([a-z0-9][a-z0-9-]*)\}$/)?.[1]
        : undefined;
    if (explicitId && last?.type === "text") {
      last.value = last.value.replace(/\s+\{#[a-z0-9][a-z0-9-]*\}$/, "");
    }
    const title = toString(node);
    const id = explicitId ?? slugger.slug(title);
    if (usedIds.has(id)) throw new Error(`Duplicate heading identifier: ${id}`);
    usedIds.add(id);
    node.data = {
      ...node.data,
      hProperties: { ...node.data?.hProperties, id },
    };
    if (node.depth === 2) sections.push({ id, title });
  }

  return sections;
}

export function prepareDocument(source: string) {
  const parser = unified().use(remarkParse).use(remarkGfm);
  const tree = parser.parse(source);
  const titleNode = tree.children[0];

  if (titleNode?.type !== "heading" || titleNode.depth !== 1) {
    throw new Error("A course document must start with one level-one heading.");
  }

  const title = toString(titleNode);
  const markdown = source.slice(titleNode.position?.end.offset).trim();
  const body = parser.parse(markdown);
  if (
    body.children.some((node) => node.type === "heading" && node.depth === 1)
  ) {
    throw new Error("A course document must have a single level-one heading.");
  }

  return { title, markdown, sections: assignHeadingIds(body) };
}

export function remarkHeadingIds() {
  return (tree: MarkdownRoot) => {
    assignHeadingIds(tree);
  };
}

export function rehypeExerciseSections() {
  return (tree: HtmlRoot) => {
    const children: HtmlRoot["children"] = [];
    let exercise: Element | undefined;

    for (const node of tree.children) {
      if (node.type === "element" && /^h[1-3]$/.test(node.tagName)) {
        exercise = undefined;
        if (
          node.tagName === "h3" &&
          /^exercice-\d+(?:-|$)/.test(String(node.properties.id))
        ) {
          exercise = {
            type: "element",
            tagName: "section",
            properties: {
              className: ["exercise-block"],
              dataExerciseNumber: String(node.properties.id).match(
                /^exercice-(\d+)/,
              )?.[1],
            },
            children: [],
          };
          children.push(exercise);
        }
      }
      if (exercise && node.type !== "doctype") {
        exercise.children.push(node);
      } else {
        children.push(node);
      }
    }
    tree.children = children;
  };
}

export function rehypeUkrainianLanguage() {
  function visit(parent: HtmlRoot | Element) {
    for (
      let childIndex = parent.children.length - 1;
      childIndex >= 0;
      childIndex--
    ) {
      const child = parent.children[childIndex];
      if (!child) continue;
      if (child.type === "element") {
        if (child.tagName !== "code" && child.properties.lang !== "uk") {
          visit(child);
        }
        continue;
      }
      if (child.type !== "text") continue;

      const parts: (Element | Text)[] = [];
      let start = 0;
      for (const match of child.value.matchAll(
        /[\p{Script=Cyrillic}]+(?:[’ʼ'-][\p{Script=Cyrillic}]+)*/gu,
      )) {
        const index = match.index;
        if (index > start)
          parts.push({ type: "text", value: child.value.slice(start, index) });
        parts.push({
          type: "element",
          tagName: "span",
          properties: { lang: "uk" },
          children: [{ type: "text", value: match[0] }],
        });
        start = index + match[0].length;
      }
      if (start < child.value.length)
        parts.push({ type: "text", value: child.value.slice(start) });
      parent.children.splice(childIndex, 1, ...parts);
    }
  }

  return (tree: HtmlRoot) => visit(tree);
}
