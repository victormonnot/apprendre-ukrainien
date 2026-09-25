"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import type { DocumentView } from "@/content/catalog";
import "./contextual-language-tools.css";

export function ContextualLanguageTools({
  moduleId,
  view,
  children,
}: {
  moduleId: string;
  view: DocumentView;
  children: ReactNode;
}) {
  const region = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<{
    text: string;
    context: string;
    anchor: string;
  } | null>(null);
  useEffect(() => {
    function readSelection() {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !selection.rangeCount) return;
      const range = selection.getRangeAt(0);
      if (
        !region.current?.contains(range.startContainer) ||
        !region.current.contains(range.endContainer)
      )
        return;
      const element =
        range.startContainer.nodeType === Node.ELEMENT_NODE
          ? (range.startContainer as Element)
          : range.startContainer.parentElement;
      if (!element || element.closest(".exercise-workspace, .contextual-tools"))
        return;
      const text = selection.toString().trim();
      if (!text || text.length > 2000) return;
      const context =
        element.closest("p, tr, li")?.textContent?.trim().slice(0, 2000) ?? "";
      const headings = [...region.current.querySelectorAll("h2[id]")];
      const heading = headings.findLast(
        (node) =>
          node === element ||
          !!(
            node.compareDocumentPosition(element) &
            Node.DOCUMENT_POSITION_FOLLOWING
          ),
      );
      setSelected({
        text,
        context: context === text ? "" : context,
        anchor: heading?.id ?? "",
      });
    }
    document.addEventListener("selectionchange", readSelection);
    return () => document.removeEventListener("selectionchange", readSelection);
  }, []);
  function href(mode: "translate" | "explain") {
    return `/atelier?${new URLSearchParams({ mode, text: selected!.text, context: selected!.context, module: moduleId, view, anchor: selected!.anchor })}`;
  }
  return (
    <div ref={region}>
      <p className="contextual-hint">
        Sélectionne un mot ou un passage pour le retrouver dans l’atelier.{" "}
        <Link href="/atelier">Ouvrir l’atelier</Link>
      </p>
      {children}
      {selected && (
        <aside
          className="contextual-tools"
          aria-label="Outils du passage sélectionné"
        >
          <p>
            <span>Passage sélectionné</span>
            <q>{selected.text}</q>
          </p>
          <div>
            <Link className="button button-secondary" href={href("translate")}>
              Chercher ou traduire
            </Link>
            <Link className="button button-primary" href={href("explain")}>
              Expliquer ce passage
            </Link>
            <button
              type="button"
              className="contextual-close"
              onClick={() => setSelected(null)}
              aria-label="Fermer les outils du passage"
            >
              ×
            </button>
          </div>
        </aside>
      )}
    </div>
  );
}
