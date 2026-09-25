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
et variantes non reconnues restent à vérifier. L’atelier propose une relecture
générée à la demande, distincte de la correction de référence. Un lecteur commun
et un studio permettent d’écouter et de répéter les mots et phrases.

Les révisions espacées sont intégrées à l’application : 31 éléments du premier
module proposent 50 cartes courtes. La sélection et l’historique de révision
sont propres au profil local.

La médiathèque relie des podcasts, une vidéo et un guide audio aux passages du
module. Chaque ressource possède un objectif d’écoute, des notes personnelles
et, pour les lecteurs intégrés, un repère de reprise.

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
Les cours, le suivi, la recherche locale et les révisions fonctionnent sans service externe.
Les éventuels réglages locaux pourront être placés dans `.env.local` ;
`.env.example` documente la configuration attendue sans contenir de secret.

## Commandes

| Commande           | Usage                                                                               |
| ------------------ | ----------------------------------------------------------------------------------- |
| `npm run dev`      | Démarrer le serveur de développement local.                                         |
| `npm run check`    | Vérifier le formatage, le lint et les types.                                        |
| `npm run format`   | Formater les fichiers source et de configuration.                                   |
| `npm run build`    | Compiler l’application pour la production.                                          |
| `npm start`        | Servir localement la compilation de production.                                     |
| `npm run test:e2e` | Vérifier la navigation, les exercices et les sauvegardes avec Chromium.             |
| `npm test`         | Vérifier le stockage, les migrations, les corrections, le planificateur et l’audio. |

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
les explications et la prononciation ne sont pas évalués automatiquement.
**Relire cette remise dans l’atelier** permet de demander une aide écrite sur la
copie conservée ; elle ne remplace ni la remise ni sa correction de référence.
Une réussite ne
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

### Recherche et atelier

**Atelier** réunit une recherche français/ukrainien dans les références du module,
la traduction contextualisée, l’explication d’un passage et la relecture d’un
texte. Sélectionner un passage dans un support permet de l’ouvrir avec son
contexte et un lien de retour. Une recherche locale ne contacte aucun fournisseur.

**Enregistrer la fiche** conserve un résultat avec le texte demandé, le contexte,
la source, le modèle et la date. Enregistrer à nouveau la même demande, dans le
même contexte et depuis la même source, retrouve la fiche existante. Les espaces
et variantes Unicode équivalentes sont normalisés pour cette comparaison ; les
contextes et remises différents restent distincts. Une fiche issue du cours peut
être ajoutée séparément aux révisions : cela active ses cartes existantes sans
remettre leur planning à zéro. Les résultats générés sont conservés dans
l’atelier et ne créent pas automatiquement de cartes de révision.

Les réponses générées sont signalées et peuvent contenir des erreurs. Elles
présentent les sens possibles, des exemples, et des repères français de
prononciation approximatifs. Pour les mots isolés, la syllabe accentuée apparaît
en gras avec sa position lorsque le modèle peut la proposer. Les aides écrites
ne constituent pas une évaluation de la prononciation. La relecture ne note pas
la maîtrise et doit conserver une incertitude quand plusieurs formulations
peuvent convenir.

Pour activer les demandes au modèle, créer `.env.local` à partir des indications
de `.env.example` et définir `OPENAI_API_KEY`. `OPENAI_MODEL` permet de choisir
un modèle compatible avec Responses et Structured Outputs ; la valeur par
défaut est `gpt-5.4-mini`. Redémarrer le serveur après une modification. La clé
reste côté serveur. Les appels sont facturés par le fournisseur sur le compte
associé à cette clé.

Seule une demande explicite transmet le texte, son contexte et les métadonnées
de source à OpenAI. Une relecture d’exercice transmet les consignes et réponses
remises, sans les notes personnelles ni le reste du suivi. Les appels utilisent
`store: false` ; cela ne remplace pas les règles de conservation propres au
fournisseur. Les réponses réussies sont conservées localement pour permettre une
reprise après une perte de connexion ; **Enregistrer** les ajoute à la liste des
fiches conservées. Réessayer une demande déjà reçue ne la régénère pas. Une panne
avant son enregistrement local peut nécessiter un nouvel appel au fournisseur.
Les requêtes sont limitées à une en cours et quatre lancements par minute sur le
profil local. Une indisponibilité du modèle laisse les outils locaux accessibles.

### Audio et studio d’écoute

Les boutons **Écouter** sont disponibles dans les tableaux du cours et du
vocabulaire, les fiches de l’atelier et les réponses révélées des cartes de
révision. Le texte ukrainien de la référence est lu ; les lettres isolées ne sont
pas présentées comme des sons de mots. Les exemples générés conservent le texte
exact de leur fiche sauvegardée par le serveur.

Le lecteur permet de mettre en pause, reprendre et réécouter. Le ralenti
**0,75×** modifie la vitesse du même fichier, avec conservation de la hauteur de
voix lorsque le navigateur le permet. Un seul lecteur fonctionne à la fois dans une page ;
changer de passage ou quitter la page arrête l’ancienne lecture. Masquer l’onglet
la met en pause. Aucun audio ne démarre à l’ouverture d’une page.

**Studio d’écoute** propose les mots et formules du module, puis trois extraits
pour se présenter. Choisir entre :

- **Écouter** : une écoute, puis réécoute libre.
- **Répéter après** : une série de 1, 3 ou 5 écoutes, avec 2, 4 ou 6 secondes de
  silence entre les écoutes. La pause suspend aussi ce silence.
- **Shadowing** : suivre la voix pendant la lecture d’un extrait compris.

Le passage suivant reste un choix explicite. Le studio ne demande aucun accès au
microphone, n’enregistre pas la voix de l’apprenant et n’attribue ni note ni
résultat d’apprentissage. Les voix proposées sont des **synthèses**, avec leur
fournisseur affiché ; les enregistrements de locuteurs cités dans le cours restent
une référence complémentaire.

Sur macOS, **Lesya** est proposée lorsque la voix ukrainienne est installée et
accessible par `/usr/bin/say`. Les fichiers sont alors créés sur le serveur local,
sans clé ni transmission externe. `AUDIO_DISABLE_LOCAL=1` désactive cette
possibilité. Sur un autre système, les sons déjà conservés restent lisibles et
les voix OpenAI peuvent être configurées.

**Marin** et **Cedar** utilisent la même `OPENAI_API_KEY` que l’atelier. Le modèle
audio est fixé à `gpt-4o-mini-tts-2025-12-15`, indépendamment de `OPENAI_MODEL`
qui concerne les textes. Choisir une voix OpenAI et demander un son absent
transmet son texte au fournisseur. La prononciation ukrainienne de ces voix doit
être comparée sur les extraits ; leur présence dans la liste n’atteste pas d’une
validation linguistique. Une voix indisponible pour créer de nouveaux sons reste
sélectionnable pour écouter ceux qui ont déjà été conservés.

Le premier appel crée un WAV privé dans la base SQLite ; les appels suivants
réutilisent ce fichier pour le même texte normalisé, la même voix, le même modèle
et la même version d’instructions. Réécouter ne relance pas une synthèse. Les
sons ne sont pas dans le dépôt public. Texte, provenance, date et octets sont
conservés ensemble et ne sont pas remplacés par une nouvelle génération. Les
fichiers restent disponibles si le fournisseur devient inaccessible. La création
est limitée à une demande simultanée et douze nouveaux sons par minute par
profil, à 1 000 caractères et 8 Mio par fichier. Un redémarrage ou une coupure
avant l’enregistrement peut nécessiter une nouvelle synthèse.

### Le café

**Le café** propose deux versions préparées d’une première rencontre entre Anna
et Maxime. Chaque version réemploie huit répliques du module 01 : salutations,
présentations, remerciements et départ. Un décor et la transcription situent les
personnages ; la traduction et les aides de prononciation sont consultables à la
demande. Ces dialogues sont du contenu de référence préparé, sans improvisation
par un modèle.

**Écouter la conversation** enchaîne les répliques à partir de celle qui est
sélectionnée. Le lecteur commun conserve la voix et la vitesse entre les
répliques ; il permet aussi de réécouter uniquement une phrase ou de la répéter
avec des silences. La pause suspend la lecture, et changer de version, d’activité
ou de réplique manuellement arrête l’enchaînement. Une même voix synthétique lit
les deux personnages. Aucune lecture ne démarre à l’ouverture de la scène.

Depuis une réplique, **Enregistrer l’expression** la retrouve dans l’atelier.
**Ajouter aux révisions** active séparément ses cartes existantes, sans doublon
ni remise à zéro de leur calendrier.

**Prendre un rôle** permet d’écrire les quatre répliques d’Anna ou de Maxime.
Les brouillons sont séparés par version et personnage. Le bouton de sauvegarde
les conserve dans l’application ; changer de personnage, de version ou revenir
à l’observation enregistre d’abord les modifications. En cas d’échec, les champs
restent accessibles pour réessayer. Une copie temporaire dans l’onglet complète
la sauvegarde serveur, sans la remplacer. Un conflit entre deux onglets propose
les deux textes avant de choisir lequel conserver.

**Remettre mon essai** conserve le texte exact, l’aide utilisée et la scène
associée, puis ouvre un nouvel essai vide. Le modèle apparaît après remise ou
sur demande explicite d’aide. La comparaison ignore la casse, les espaces
superflus et la ponctuation ; elle distingue une forme retrouvée d’une
formulation à comparer, sans déclarer une variante fausse ni noter la maîtrise.
Consulter un modèle indique une aide pour cet essai. Les essais antérieurs
restent immuables, même si la scène évolue. Les sources audio sont résolues par
version et réplique. Aucun microphone n’est utilisé.

### Médiathèque

**Médiathèque** rassemble quatre ressources publiques de
[Ukrainian Lessons](https://www.ukrainianlessons.com/) autour de l’alphabet,
des salutations et de la présentation. Les enregistrements sont en ukrainien,
avec des explications en anglais. Les objectifs et consignes d’écoute sont
en français ; chaque fiche renvoie aux passages correspondants du module.

**Charger le lecteur** contacte l’hébergeur de la vidéo YouTube ou du podcast
Buzzsprout. Aucun lecteur externe n’est chargé avant cette action et la lecture
ne démarre pas automatiquement. Les médias restent chez leurs éditeurs : ils ne
sont ni copiés dans le dépôt ni conservés dans la base locale. Le guide audio
s’ouvre sur le site de l’auteur. Le lien **Ouvrir la source officielle** reste
disponible si un hébergeur bloque la lecture intégrée.

**Garder ce repère** enregistre la position du lecteur ou un temps saisi
manuellement. La prochaine ouverture prépare ce point, puis laisse démarrer
la lecture. Les durées affichées sont indicatives ; les annonces insérées dans
un podcast peuvent déplacer les passages. Fermer le lecteur ou quitter la page
arrête la lecture ; masquer l’onglet la met en pause.

Les notes se sauvegardent avec **Enregistrer mes notes**, indépendamment du
repère. Une copie temporaire peut être retrouvée dans le même onglet. Deux
versions concurrentes sont présentées avant remplacement ; réessayer une
sauvegarde déjà reçue ne l’applique pas une seconde fois. Ouvrir une ressource
ou l’écouter n’attribue aucun résultat d’apprentissage et n’ajoute aucune carte
aux révisions.

### Profil local

Cette version utilise un seul profil local, partagé par les navigateurs qui
ouvrent la même application. Elle écoute uniquement sur l’interface locale et
réserve l’API personnelle aux requêtes locales de même origine. L’authentification,
l’accès distant et la synchronisation entre appareils restent à ajouter.

### Sauvegardes et restauration

**Mes données** permet de créer une sauvegarde complète, de la télécharger,
puis de vérifier un fichier avant de le restaurer. Les copies contiennent le
profil, les notes, les bilans, les brouillons enregistrés, les remises, les
révisions et leurs échéances, les fiches de l’atelier, les essais au café, les
repères de la médiathèque et les sons conservés. Les clés API, les préférences du
navigateur, les saisies non enregistrées et les médias externes n’en font pas
partie.

Les fichiers `.sqlite3` restent dans le répertoire privé
`APP_DATA_DIR/backups` (ou `.data/backups` par défaut). Télécharger une copie et
la conserver sur un autre support permet de se protéger d’une perte de
l’ordinateur. Le fichier contient des données personnelles en clair.

La vérification affiche un aperçu des données du fichier sans remplacer le
travail actuel. Cette version accepte les sauvegardes ayant exactement le schéma
et les migrations de la version installée, jusqu’à **256 Mio**. Elle vérifie
l’intégrité SQLite, les contraintes et les relations entre tables ; un fichier
modifié manuellement n’est pas une méthode d’import de contenu. Les préparations
expirent après une heure, avec cinq fichiers au maximum en attente.

La restauration demande une confirmation explicite et **remplace** l’état
actuel, sans fusionner les historiques. Une copie de secours est créée avant le
remplacement ; elle reste téléchargeable et restaurable. Le remplacement est
transactionnel : un échec avant validation conserve les données précédentes.
Réessayer après une réponse réseau perdue retrouve le résultat de la même
opération sans effectuer une seconde restauration.

Après restauration, recharger les autres onglets. Leurs anciennes requêtes ne
peuvent plus modifier le nouvel état, y compris une génération audio ou textuelle
encore en cours. À la réouverture, les brouillons de l’ancien état sont mis à
part dans le même onglet et peuvent être téléchargés depuis **Mes données**.
Ils ne sont pas réinjectés automatiquement dans le travail restauré. Cet export
JSON de brouillons sert à consulter et récupérer les textes ; il ne remplace
pas la sauvegarde complète.

La restauration s’effectue depuis un seul serveur local de l’application. Elle
ne constitue pas une synchronisation entre appareils et ne publie pas les
données.

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
