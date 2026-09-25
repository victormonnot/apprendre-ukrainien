# Apprendre l’ukrainien

Application web pour apprendre l’ukrainien en français.

Le premier module propose un cours complet, une fiche de vocabulaire et une fiche
d’exercices sur papier. Les trois supports partagent une navigation, un sommaire
et une mise en page d’impression, sur ordinateur et téléphone.

La sauvegarde de progression, la remise des réponses et l’audio intégré ne sont
pas encore disponibles.

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

| Commande           | Usage                                                 |
| ------------------ | ----------------------------------------------------- |
| `npm run dev`      | Démarrer le serveur de développement local.           |
| `npm run check`    | Vérifier le formatage, le lint et les types.          |
| `npm run format`   | Formater les fichiers source et de configuration.     |
| `npm run build`    | Compiler l’application pour la production.            |
| `npm start`        | Servir localement la compilation de production.       |
| `npm run test:e2e` | Vérifier la navigation et les supports avec Chromium. |

Avant de proposer une modification :

```sh
npm run check
npm run build
```

Ces vérifications sont également exécutées par GitHub Actions.
Le workflow ne réalise aucun déploiement.

Pour les tests de parcours, installer Chromium une première fois :

```sh
npx playwright install chromium
npm run test:e2e
```

Les tests compilent l’application et démarrent un serveur de production local sur
le port 3101, qui doit être libre. Ils couvrent les affichages ordinateur et mobile,
les ancres, la cohérence des exercices et l’impression.

## Structure

```text
src/app/             Routes, styles et métadonnées de l’application
src/components/      Navigation et lecture des documents
src/content/         Catalogue et supports pédagogiques en Markdown
src/lib/             Chargement et préparation des documents
tests/               Parcours de navigation et d’impression
.github/workflows/   Vérifications automatisées
```

Le socle utilise Next.js App Router, React et TypeScript en mode strict,
avec ESLint et Prettier. Les dépendances directes et le lockfile sont versionnés.
Les fichiers générés, configurations locales et données personnelles sont exclus
du suivi Git.

## Contenus pédagogiques

Le catalogue définit les identifiants des modules et leurs trois supports.
Chaque document Markdown commence par un titre de niveau 1 ; ses sections de
niveau 2 alimentent automatiquement le sommaire. Les exercices communs conservent
les mêmes numéros et consignes dans le cours et la fiche d’exercices.

Les liens entre supports utilisent les routes `/parcours/01/cours`,
`/parcours/01/vocabulaire` et `/parcours/01/exercices`. Les ressources externes sont
citées dans les supports. Aucun HTML brut n’est exécuté dans leur rendu.
