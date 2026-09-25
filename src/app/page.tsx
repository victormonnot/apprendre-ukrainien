export default function HomePage() {
  return (
    <main id="main-content" className="page" tabIndex={-1}>
      <p className="eyebrow">Parcours</p>
      <h1>Votre espace d’ukrainien</h1>
      <section className="empty-state" aria-labelledby="empty-title">
        <h2 id="empty-title">Aucun module disponible pour le moment</h2>
        <p>Les cours et leurs activités apparaîtront ici.</p>
      </section>
    </main>
  );
}
