import Link from "next/link";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  rehypeExerciseSections,
  rehypeUkrainianLanguage,
  remarkHeadingIds,
} from "@/lib/markdown";

export function CourseMarkdown({ markdown }: { markdown: string }) {
  return (
    <article className="prose">
      <Markdown
        skipHtml
        remarkPlugins={[remarkGfm, remarkHeadingIds]}
        rehypePlugins={[rehypeExerciseSections, rehypeUkrainianLanguage]}
        components={{
          a({ href, children }) {
            if (href?.startsWith("/"))
              return <Link href={href}>{children}</Link>;
            return <a href={href}>{children}</a>;
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
