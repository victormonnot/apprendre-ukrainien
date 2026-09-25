import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main-content" className="page" tabIndex={-1}>
      <p className="eyebrow">Page introuvable</p>
      <h1>Cette page n’existe pas.</h1>
      <p>Le lien a peut-être changé.</p>
      <Link className="text-link" href="/">
        Revenir à l’accueil
      </Link>
    </main>
  );
}
