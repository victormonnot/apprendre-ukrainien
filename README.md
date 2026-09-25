# Apprendre l’ukrainien

Application web pour apprendre l’ukrainien en français.

Le premier module propose un cours complet, une fiche de vocabulaire et une fiche
d’exercices à réaliser dans l’application ou sur papier. Les trois supports partagent une navigation, un sommaire
et une mise en page d’impression, sur ordinateur et téléphone.

Chaque support possède un point de reprise, une note personnelle et un bilan de
travail déclaratif. Ces données sont conservées dans une base SQLite locale.
Une consultation n’attribue aucun résultat d’apprentissage.

Les treize exercices permettent d’enregistrer un brouillon, de remettre ses
réponses puis de réessayer en conservant les tentatives précédentes. Les réponses
écrites vérifiables reçoivent une correction automatique ; les productions libres
et variantes non reconnues restent à vérifier. L’audio intégré et l’assistance IA
ne sont pas encore disponibles.

Les révisions espacées sont intégrées à l’application : 31 éléments du premier
module proposent 50 cartes courtes. La sélection et l’historique de révision
sont propres au profil local.

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

| Commande           | Usage                                                                      |
| ------------------ | -------------------------------------------------------------------------- |
| `npm run dev`      | Démarrer le serveur de développement local.                                |
| `npm run check`    | Vérifier le formatage, le lint et les types.                               |
| `npm run format`   | Formater les fichiers source et de configuration.                          |
| `npm run build`    | Compiler l’application pour la production.                                 |
| `npm start`        | Servir localement la compilation de production.                            |
| `npm run test:e2e` | Vérifier la navigation, les exercices et les sauvegardes avec Chromium.    |
| `npm test`         | Vérifier le stockage, les migrations, les corrections et le planificateur. |

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
Ils vérifient aussi les remises, les réessais, le cycle de révision espacée, les
conflits entre onglets et la validation des requêtes. Les tests unitaires couvrent
les échéances, les changements de jour et d’heure, et les limites de nouveautés.
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

### Exercices et corrections

Sous un exercice, ouvrir **Répondre dans l’application**, puis **Commencer
l’exercice**. Indiquer ses réponses et l’aide utilisée pour chaque question.
Le brouillon peut être enregistré incomplet ; la remise demande toutes les
réponses et leurs conditions de réalisation. Un travail sur papier peut être
recopié dans ces champs. Les exercices communs au cours et à la fiche partagent
les mêmes réponses et le même historique.

La correction n’apparaît qu’après remise. Elle distingue les réponses justes,
celles à reprendre et celles qui demandent une vérification. Une variante
inconnue n’est pas automatiquement considérée comme fausse. Les textes libres,
les explications et la prononciation ne sont pas évalués automatiquement dans
cette version ; aucune correction différée n’est programmée. Une réussite ne
modifie pas automatiquement le bilan personnel et ne vaut pas maîtrise.

**Réessayer l’exercice** ouvre une tentative vierge. Les réponses, l’aide déclarée
et la correction de chaque remise restent conservées avec la version de
l’exercice. En cas de conflit entre onglets, les réponses locales sont affichées
à côté de la version enregistrée pour pouvoir les récupérer. Le parcours indique
les brouillons et les remises disponibles. Les supports imprimés restent sans
réponses personnelles ni corrections.

### Révisions espacées

Ouvrir **Révisions**, puis ajouter les lettres, mots ou expressions déjà abordés
dans le cours. L’ajout d’un élément active ses cartes : reconnaissance pour les
lettres, compréhension et production pour les mots et expressions. Ajouter à
nouveau le même élément ne crée pas de doublon et ne réinitialise pas son état.
Les liens vers les supports permettent de retrouver le passage correspondant.

Une carte montre d’abord la question. Répondre dans le champ, sur papier ou
mentalement, puis choisir **Révéler la réponse**. Comparer sa réponse avant
l’auto-évaluation :

- **À revoir** : oubli, erreur ou réponse retrouvée avec une aide ;
- **Difficile** : réponse juste, retrouvée sans aide mais avec peine ;
- **Bien** : réponse juste après un effort de rappel normal ;
- **Facile** : réponse juste, retrouvée immédiatement sans aide.

Ce choix détermine la prochaine échéance ; la simple révélation ne valide pas la
carte. Les aides de prononciation et l’accent apparaissent au verso. Les réponses
ne reçoivent pas de note automatique : les résultats déclarés ne valident ni
l’oral ni la maîtrise générale du cours.

Le moteur utilise [ts-fsrs](https://open-spaced-repetition.github.io/ts-fsrs/),
avec une cible de rétention de 0,9, les paramètres généraux de la version fixée
et sans optimisation personnelle à ce stade. L’apprentissage initial comporte
des étapes de 1 et 10 minutes ; un oubli après apprentissage prévoit une étape
de 10 minutes. Les intervalles suivants sont calculés par FSRS. Ce réglage est
une cible du moteur, pas une garantie de mémorisation.

La file privilégie les rappels déjà commencés avant les nouvelles cartes, avec
un plafond de **cinq nouvelles cartes par jour**. Les jours suivent le fuseau
**Europe/Paris**, y compris les changements d’heure. Une première présentation
réserve une place dans ce plafond. Après une auto-évaluation, les autres cartes
du même élément attendent au moins le lendemain pour ne pas fournir un indice
immédiat ; la carte travaillée peut revenir plus tôt selon son résultat. Les
autres cartes échues restent disponibles, même si le plafond de nouveautés est
atteint.

Une tentative en cours se retrouve après rechargement ou redémarrage. Les
réponses révélées et les auto-évaluations sont enregistrées ; une requête répétée
ne crée pas une seconde révision. La mise en pause d’un élément conserve son
historique et ses échéances. Terminer sa carte en cours avant de le mettre en
pause. La réactivation reprend son état existant.

Aucune progression provenant d’Anki ou des cours n’est importée automatiquement.
Cette version n’effectue aucune synchronisation avec Anki. Les paramètres du
moteur, l’état précédent, la définition de la carte et son résultat sont
conservés avec la révision pour permettre les évolutions du planificateur.

### Profil local

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

Le planificateur et la correction s’exécutent côté serveur. Les réponses des
cartes de révision sont envoyées lors de la révélation ; le navigateur ne choisit
ni la date du rappel ni les paramètres du moteur.

Les données sont rattachées à un identifiant de profil généré côté serveur. Les
visites, points de reprise, bilans et opérations sur les exercices conservent un historique ; le texte des notes
est stocké séparément avec une révision pour détecter les modifications
concurrentes. Les contenus pédagogiques ne contiennent aucune donnée personnelle.
Les remises et leurs corrections sont immuables en base. Les brouillons sont
protégés par une révision pour éviter qu’un onglet remplace silencieusement le
travail d’un autre.

## Structure

```text
src/app/             Routes, styles et métadonnées de l’application
src/components/      Lecture, exercices et suivi personnel
src/content/         Catalogue, supports Markdown et définitions des exercices
src/lib/             Préparation des documents et échanges avec les API
src/lib/server/      Stockage local et correction des réponses
migrations/          Évolutions versionnées du schéma SQLite
tests/               Tests unitaires et parcours navigateur
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

Les exercices portent eux aussi une ancre stable (`{#exercice-1}`, etc.). Leurs
questions et champs sont définis dans `src/content/exercises.ts` ; les réponses
attendues restent dans le correcteur serveur. Conserver les identifiants lors
des évolutions et augmenter la version si les questions ou leur sens changent.
Chaque tentative conserve sa définition afin que les anciennes réponses restent
lisibles. Un brouillon d’une ancienne version est préservé mais ne peut pas être
remis selon les nouvelles questions ; sa reprise doit être prévue lors d’un
changement de contenu.

Les liens entre supports utilisent les routes `/parcours/01/cours`,
`/parcours/01/vocabulaire` et `/parcours/01/exercices`. Les ressources externes sont
citées dans les supports. Aucun HTML brut n’est exécuté dans leur rendu.
