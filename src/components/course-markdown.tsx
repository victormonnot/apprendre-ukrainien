import type { Element, Text } from "hast";
import { AudioPlayer } from "@/components/audio-player";
import { findAudioSegment } from "@/content/audio";
import Link from "next/link";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getExerciseByNumber } from "@/content/exercises";
import { ExerciseWorkspace } from "@/components/exercise-workspace";
import {
  rehypeExerciseSections,
  rehypeUkrainianLanguage,
  remarkHeadingIds,
} from "@/lib/markdown";

function contentText(node: Element | Text): string {
  return node.type === "text"
    ? node.value
    : node.children
        .map((child) =>
          child.type === "element" || child.type === "text"
            ? contentText(child)
            : "",
        )
        .join("");
}

export function CourseMarkdown({
  markdown,
  moduleId,
}: {
  markdown: string;
  moduleId: string;
}) {
  return (
    <article className="prose">
      <Markdown
        skipHtml
        remarkPlugins={[remarkGfm, remarkHeadingIds]}
        rehypePlugins={[rehypeExerciseSections, rehypeUkrainianLanguage]}
        components={{
          section({ node, children }) {
            const exercise = getExerciseByNumber(
              moduleId,
              Number(node?.properties.dataExerciseNumber),
            );
            return (
              <section className="exercise-block">
                <div className="exercise-instructions">{children}</div>
                {exercise && (
                  <ExerciseWorkspace key={exercise.id} definition={exercise} />
                )}
              </section>
            );
          },
          a({ href, children }) {
            if (href?.startsWith("/"))
              return <Link href={href}>{children}</Link>;
            return <a href={href}>{children}</a>;
          },
          td({ node, children }) {
            const segment = node
              ? findAudioSegment(contentText(node))
              : undefined;
            return (
              <td>
                {children}
                {segment && (
                  <AudioPlayer
                    compact
                    source={segment.source}
                    text={segment.text}
                  />
                )}
              </td>
            );
          },
          table({ children }) {
            return (
              <div
                className="table-scroll"
                role="region"
                aria-label="Tableau, défilement horizontal si nécessaire"
                tabIndex={0}
              >
                <table>{children}</table>
              </div>
            );
          },
        }}
      >
        {markdown}
      </Markdown>
    </article>
  );
}
