import type { Section } from "@/lib/markdown";

export function TableOfContents({ sections }: { sections: Section[] }) {
  return (
    <nav aria-label="Sommaire">
      <ol>
        {sections.map((section) => (
          <li key={section.id}>
            <a href={`#${section.id}`}>{section.title}</a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
