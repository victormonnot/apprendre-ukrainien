# Apprendre l’ukrainien

Application web pour apprendre l’ukrainien en français.

Le premier module propose un cours complet, une fiche de vocabulaire et une fiche
d’exercices sur papier. Les trois supports partagent une navigation, un sommaire
et une mise en page d’impression, sur ordinateur et téléphone.

Chaque support possède un point de reprise, une note personnelle et un bilan de
travail déclaratif. Ces données sont conservées dans une base SQLite locale.
Une consultation n’attribue aucun résultat d’apprentissage.

La remise des réponses, leur correction et l’audio intégré ne sont pas encore
disponibles.

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

| Commande           | Usage                                                                 |
| ------------------ | --------------------------------------------------------------------- |
| `npm run dev`      | Démarrer le serveur de développement local.                           |
| `npm run check`    | Vérifier le formatage, le lint et les types.                          |
| `npm run format`   | Formater les fichiers source et de configuration.                     |
| `npm run build`    | Compiler l’application pour la production.                            |
| `npm start`        | Servir localement la compilation de production.                       |
| `npm run test:e2e` | Vérifier la navigation et les supports avec Chromium.                 |
| `npm test`         | Vérifier le stockage, les migrations et les identifiants de sections. |

Avant de proposer une modification :

```sh
npm run check
npm test
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
les ancres, la cohérence des exercices, l’impression et la sauvegarde du travail.
Une base temporaire distincte est utilisée pour chaque lancement des tests : les
données personnelles ne sont pas modifiées.

## Suivi personnel

Dans une fiche, ouvrir **Mon suivi et mes notes** pour choisir un passage à
retrouver, enregistrer une note ou renseigner un bilan. Le parcours permet ensuite
de reprendre la dernière fiche consultée à son point enregistré. Les notes et les
bilans se sauvegardent avec leurs boutons respectifs. Les réussites indiquées dans
un bilan sont des déclarations personnelles, distinctes d’une correction.

Si deux onglets modifient la même note, l’application conserve le brouillon et
demande de comparer les versions avant de remplacer celle qui est enregistrée.
Un brouillon temporaire peut être retrouvé dans le même onglet ; il ne remplace
pas l’enregistrement dans la base.

Cette version utilise un seul profil local, partagé par les navigateurs qui
ouvrent la même application. Elle écoute uniquement sur l’interface locale et
réserve l’API personnelle aux requêtes locales de même origine. L’authentification,
l’accès distant et la synchronisation entre appareils restent à ajouter.

### Données et migrations

La base est créée au premier accès au suivi dans `.data/learning.sqlite3`, avec
ses fichiers SQLite associés. Le répertoire `.data/` est privé et exclu de Git.
Il doit être conservé lors d’une mise à jour de l’application. `APP_DATA_DIR`
permet de choisir un autre répertoire persistant, indépendant du code ; un
exemple est donné dans `.env.example`.

Les migrations SQL de `migrations/` sont appliquées transactionnellement. Leur
historique et leur empreinte sont vérifiés à l’ouverture. Une migration déjà
appliquée ne doit pas être réécrite : ajouter une nouvelle migration numérotée.
Le stockage utilise le module `node:sqlite` fourni par Node.js, sans service de
base de données externe.

Les données sont rattachées à un identifiant de profil généré côté serveur. Les
visites, points de reprise et bilans conservent un historique ; le texte des notes
est stocké séparément avec une révision pour détecter les modifications
concurrentes. Les contenus pédagogiques ne contiennent aucune donnée personnelle.

## Structure

```text
src/app/             Routes, styles et métadonnées de l’application
src/components/      Navigation et lecture des documents
src/content/         Catalogue et supports pédagogiques en Markdown
src/lib/             Chargement et préparation des documents
src/lib/server/      Stockage local et accès aux données personnelles
migrations/          Évolutions versionnées du schéma SQLite
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

Les sections de niveau 2 portent un identifiant explicite, par exemple
`## Comprendre l’écriture {#ecriture}`. Conserver cet identifiant lors d’un
changement de titre ou de position pour préserver les points de reprise. Les
notes sont reliées au numéro de module et au type de support, indépendamment des
titres et du contenu du cours.

Les liens entre supports utilisent les routes `/parcours/01/cours`,
`/parcours/01/vocabulaire` et `/parcours/01/exercices`. Les ressources externes sont
citées dans les supports. Aucun HTML brut n’est exécuté dans leur rendu.
