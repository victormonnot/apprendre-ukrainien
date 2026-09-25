"use client";

import { useEffect } from "react";

const editors = new Set<symbol>();

function beforeUnload(event: BeforeUnloadEvent) {
  event.preventDefault();
  event.returnValue = "";
}

function beforeNavigation(event: MouseEvent) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  )
    return;
  if (!(event.target instanceof Element)) return;
  const link = event.target.closest<HTMLAnchorElement>("a[href]");
  if (
    !link ||
    link.hasAttribute("download") ||
    (link.target && link.target !== "_self")
  )
    return;
  const destination = new URL(link.href, location.href);
  if (
    destination.origin !== location.origin ||
    (destination.pathname === location.pathname &&
      destination.search === location.search)
  )
    return;
  if (
    !window.confirm(
      "Tu as du travail non enregistré dans cette fiche. Quitter sans enregistrer ces modifications ?",
    )
  ) {
    event.preventDefault();
    event.stopPropagation();
  }
}

export function useUnsavedWork(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const editor = Symbol();
    if (editors.size === 0) {
      window.addEventListener("beforeunload", beforeUnload);
      document.addEventListener("click", beforeNavigation, true);
    }
    editors.add(editor);
    return () => {
      editors.delete(editor);
      if (editors.size === 0) {
        window.removeEventListener("beforeunload", beforeUnload);
        document.removeEventListener("click", beforeNavigation, true);
      }
    };
  }, [dirty]);
}
