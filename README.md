# Apprendre l’ukrainien

Application web pour apprendre l’ukrainien en français.

Le projet contient actuellement le socle de l’application : une page d’accueil,
une page 404 et les outils de développement. Les cours et les fonctions
d’apprentissage seront ajoutés progressivement.

## Prérequis

- Node.js **24.21.0**, version de référence indiquée dans `.nvmrc`.
  Node.js 26 à partir de 26.4.0 est également accepté.
- npm **11.17.0**.

Avec nvm, `nvm install` puis `nvm use` sélectionnent la version du projet.
Si nécessaire, installer la version de npm avec `npm install --global npm@11.17.0`.

## Démarrage

```sh
npm ci
npm run dev
```

L’application est accessible sur <http://127.0.0.1:3000>.
Aucune variable d’environnement ni aucun service externe n’est requis.
Les éventuels réglages locaux pourront être placés dans `.env.local` ;
`.env.example` documente la configuration attendue sans contenir de secret.

## Commandes

| Commande         | Usage                                             |
| ---------------- | ------------------------------------------------- |
| `npm run dev`    | Démarrer le serveur de développement local.       |
| `npm run check`  | Vérifier le formatage, le lint et les types.      |
| `npm run format` | Formater les fichiers source et de configuration. |
| `npm run build`  | Compiler l’application pour la production.        |
| `npm start`      | Servir localement la compilation de production.   |

Avant de proposer une modification :

```sh
npm run check
npm run build
```

Ces vérifications sont également exécutées par GitHub Actions.
Le workflow ne réalise aucun déploiement.

## Structure

```text
src/app/             Routes, styles et métadonnées de l’application
.github/workflows/   Vérifications automatisées
```

Le socle utilise Next.js App Router, React et TypeScript en mode strict,
avec ESLint et Prettier. Les dépendances directes et le lockfile sont versionnés.
Les fichiers générés, configurations locales et données personnelles sont exclus
du suivi Git.
