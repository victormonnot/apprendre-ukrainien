"use client";

export function PrintButton() {
  return (
    <button
      className="button button-secondary print-button"
      type="button"
      onClick={() => window.print()}
    >
      <svg
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        aria-hidden="true"
      >
        <path d="M7 8V3h10v5M7 17H4V9h16v8h-3" />
        <path d="M7 14h10v7H7zM16 11h1" />
      </svg>
      Imprimer
    </button>
  );
}
