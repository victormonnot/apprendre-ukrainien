# Déploiement privé sur un VPS

Cette configuration lance un serveur Next.js avec Node 24, SQLite et Caddy. Caddy protège tout le site par identifiant et mot de passe. Le port de l’application reste accessible uniquement sur le réseau Docker. Le service utilise un seul profil personnel partagé par les appareils connectés.

Choisir la configuration Coolify ci-dessous ou l’installation autonome des sections suivantes. Dans Coolify, son proxy gère HTTPS ; en installation autonome, Caddy gère aussi le certificat.

## Avec Coolify

Utiliser une application **Docker Compose depuis le dépôt Git**, avec **Base Directory** `/` et **Docker Compose Location** `/deploy/compose.coolify.yaml`. Laisser **Raw Compose Deployment**, **Connect To Predefined Network** et les prévisualisations désactivés. Le fichier réutilise le Dockerfile du dépôt et embarque la configuration Caddy avec `configs.content` ; Docker Compose 2.23.1 ou plus récent est nécessaire. Aucun montage du dépôt ni deuxième proxy public n’est nécessaire.

Coolify fixe le répertoire de projet à la racine du dépôt. Pour valider cette variante en local avec les valeurs de `deploy/.env`, reproduire ce réglage depuis la racine : `docker compose --project-directory . --env-file deploy/.env -f deploy/compose.coolify.yaml config --quiet`.

Dans **Domains for gateway**, saisir uniquement l’URL HTTPS du site, par exemple `https://ukrainien.example.com`, et garder **Force Https** activé. Laisser **Domains for app** vide, en retirant tout domaine généré. Le proxy Coolify termine HTTPS et transmet à `gateway:80`, qui authentifie la requête avant de joindre `app:3000`. Aucun `ports:` ne doit être ajouté à ces services. Cette configuration remplace le lancement du `compose.yaml` autonome.

Dans **Environment Variables**, renseigner les valeurs suivantes en activant **Runtime Variable** et en désactivant **Build Variable**. Désactiver également **Inject Build Args to Dockerfile** ; aucun secret n’est nécessaire à la construction.

Les quatre variables d’accès `APP_HOST`, `APP_LOGIN`, `APP_PASSWORD_HASH` et `APP_PROXY_SECRET` sont obligatoires au démarrage. Pendant le build, Compose peut annoncer qu’elles sont absentes et les remplacer par des valeurs vides : les services ne démarrent pas à cette étape. Une configuration d’accès restée vide au démarrage ne donne aucun accès au site.

| Variable            | Valeur                                                                                                                                                     |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `APP_HOST`          | Le nom d’hôte du domaine choisi, sans `https://`, chemin ni slash final.                                                                                   |
| `APP_LOGIN`         | L’identifiant personnel, sans espace.                                                                                                                      |
| `APP_PASSWORD_HASH` | Le hash bcrypt généré avec la commande Caddy de la section suivante. En vue **Normal**, coller le hash seul et activer **Literal** pour préserver les `$`. |
| `APP_PROXY_SECRET`  | Le résultat de `openssl rand -hex 32`, identique pour l’application et la passerelle.                                                                      |
| `OPENAI_API_KEY`    | Facultatif ; laisser vide pour utiliser les fonctions locales.                                                                                             |
| `OPENAI_MODEL`      | Facultatif ; `gpt-6-luna` par défaut.                                                                                                                      |

Les variables restent dans Coolify, jamais dans Git. `deploy/.env.example` décrit les mêmes valeurs pour une validation locale, mais aucun fichier `.env` n’est nécessaire dans le dépôt déployé. La passerelle conserve Host et Origin, remplace `X-App-Proxy-Secret`, retire Authorization, limite les imports à 256 Mio et interdit la mise en cache partagée et l’affichage en iframe.

Déployer puis vérifier que HTTP redirige vers HTTPS, qu’une visite HTTPS sans identifiants reçoit `401`, et qu’une connexion permet d’ouvrir **Mes données**. Le stockage `app_data`, monté sur `/app/.data`, appartient à cette ressource Coolify. Relever son nom Docker effectif dans **Persistent Storage** ou dans la configuration Compose générée : Coolify peut le préfixer. Conserver la même ressource et ce volume lors des redéploiements ; supprimer le stockage ou recréer la ressource avec un autre volume ne reprendrait pas les données.

Avant chaque mise à jour, créer et télécharger une sauvegarde depuis **Mes données**, puis redéployer le commit choisi. Garder une seule instance `app` sur ce volume, sans déploiement parallèle ni Swarm ; Compose remplace le conteneur avec une interruption possible. Les sauvegardes hors VPS, la migration depuis le Mac et la compatibilité des migrations suivent les sections ci-dessous. La voix macOS Lesya reste indisponible sur Linux ; les audios déjà conservés restent lisibles.

## Préparer le serveur

Installer Docker Engine et les plugins Docker Compose et Buildx sur un serveur Linux. Les ports TCP 80 et 443 doivent être disponibles et accessibles ; UDP 443 permet HTTP/3.

Créer uniquement un enregistrement DNS pour le sous-domaine choisi, par exemple `ukrainien.example.com`, pointant vers l’adresse IPv4 du VPS. Ajouter un enregistrement AAAA seulement si IPv6 est également configuré. Les autres enregistrements du domaine restent inchangés.

Si le serveur héberge déjà des sites derrière Caddy ou un autre proxy, suivre la section « Plusieurs projets » avant de démarrer ces services.

## Configurer l’accès

Depuis la racine du dépôt :

```sh
cp deploy/.env.example deploy/.env
chmod 600 deploy/.env
```

Choisir `APP_HOST` et `APP_LOGIN`, puis générer le hash du mot de passe avec une saisie interactive :

```sh
docker run --rm -it caddy:2.11.4-alpine caddy hash-password --algorithm bcrypt
```

Copier le hash obtenu dans `APP_PASSWORD_HASH`, entre apostrophes simples. Elles empêchent Compose d’interpréter les caractères `$` du hash. Conserver le mot de passe dans un gestionnaire de mots de passe ; il ne figure ni dans la commande ni dans le fichier de configuration.

Générer ensuite le secret partagé du proxy :

```sh
openssl rand -hex 32
```

Copier les 64 caractères dans `APP_PROXY_SECRET`. Compose fournit la même valeur à Caddy et à l’application. Caddy remplace tout en-tête `X-App-Proxy-Secret` reçu et retire l’en-tête d’authentification avant la transmission à Next.js. Le nom d’hôte et l’origine de la requête restent conservés ; l’application attend exactement `https://APP_HOST`.

`OPENAI_API_KEY` est facultatif et reste une variable du serveur. Les cours, les exercices, les révisions et les données personnelles fonctionnent sans cette clé. Sur Linux, la voix macOS Lesya n’est pas disponible ; les fichiers audio déjà conservés restent lisibles. Les lecteurs de podcasts et de vidéos dépendent de leurs hébergeurs.

Le fichier `deploy/.env` est exclu de Git et du contexte de construction Docker. Aucun secret ne doit être ajouté au Dockerfile ou aux arguments de construction.

Le proxy limite le corps des requêtes à 256 Mio, notamment pour l’import de sauvegardes.

## Construire et démarrer

Valider la configuration sans afficher les variables sensibles :

```sh
docker compose --env-file deploy/.env config --quiet
docker compose --env-file deploy/.env run --rm --no-deps caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
docker compose --env-file deploy/.env build --pull app
docker compose --env-file deploy/.env up -d
docker compose --env-file deploy/.env ps
```

Ouvrir `https://ukrainien.example.com` en remplaçant ce nom par `APP_HOST`. Le navigateur demande l’identifiant et le mot de passe. Caddy obtient le certificat automatiquement lorsque le DNS et les ports sont prêts. Une requête HTTPS sans identifiants doit recevoir une réponse `401` :

```sh
curl --head https://ukrainien.example.com
```

Pour consulter le démarrage :

```sh
docker compose --env-file deploy/.env logs --tail 100 app caddy
```

La sortie de `docker compose config` sans `--quiet` peut contenir les secrets : ne pas la publier.

## Données et sauvegardes

Le volume nommé `app_data` contient `/app/.data`, notamment la base SQLite, les audios conservés et les sauvegardes de l’application. Un volume neuf reçoit les permissions du répertoire de l’image : propriétaire UID/GID 1000, utilisé par le compte `node`. Les volumes `caddy_data` et `caddy_config` conservent les données de Caddy, dont ses certificats.

Garder le même nom de projet Compose (`apprendre-ukrainien`) permet de retrouver ces volumes lors des mises à jour. Une image reconstruite ou un conteneur remplacé ne les efface pas. Ne pas exécuter `docker compose down -v` : cette option supprimerait les volumes et les données.

Avant de migrer depuis une installation locale, créer et télécharger une sauvegarde depuis la page **Mes données**. Après connexion au VPS, utiliser cette même page pour prévisualiser puis restaurer le fichier. Les brouillons restés dans un onglet du navigateur doivent être enregistrés ou exportés séparément.

Conserver une copie téléchargée des sauvegardes en dehors du VPS. Une copie présente uniquement dans `app_data` ne protège pas contre la perte du serveur. Le fichier `deploy/.env` se conserve séparément : une sauvegarde de l’application ne contient pas les identifiants du proxy ni la clé API.

## Mettre à jour

Créer une sauvegarde dans l’application et la télécharger hors du serveur avant chaque mise à jour. Garder également la référence de la version actuellement déployée.

Après récupération de la nouvelle version du dépôt, construire l’image pendant que l’ancienne application reste disponible. Arrêter ensuite l’unique serveur avant son remplacement :

```sh
docker compose --env-file deploy/.env build --pull app
docker compose --env-file deploy/.env stop app
docker compose --env-file deploy/.env up -d --no-deps app
docker compose --env-file deploy/.env ps
```

Une courte interruption est prévue pendant ce remplacement. Les migrations s’appliquent à l’ouverture de la base. Utiliser un seul conteneur `app` : ni plusieurs réplicas, ni démarrage simultané de deux versions sur le même volume SQLite. Un retour à une version ancienne peut nécessiter de restaurer la sauvegarde correspondante ; ne pas ouvrir une base déjà migrée avec un ancien code sans vérifier sa compatibilité.

Après modification des variables d’accès ou du Caddyfile, recréer Caddy pour prendre en compte la configuration :

```sh
docker compose --env-file deploy/.env up -d --no-deps --force-recreate caddy
```

Si `APP_PROXY_SECRET` ou `APP_HOST` change, recréer également `app`, en l’arrêtant d’abord comme ci-dessus.

## Plusieurs projets sur le même VPS

Un seul proxy doit publier les ports 80 et 443. Si Caddy est déjà partagé entre plusieurs projets, ne pas démarrer le service `caddy` fourni ici. Ajouter le bloc de site du Caddyfile à sa configuration existante, avec un nom d’hôte et des variables propres à cette application. Conserver les autres blocs de sites.

Connecter le service `app` et le Caddy partagé à un réseau Docker commun. Utiliser un alias réseau unique pour cette application, puis adapter `reverse_proxy app:3000` à cet alias. L’application garde ses variables `APP_ORIGIN` et `APP_PROXY_SECRET`, son volume personnel et aucun port public. Le Caddy partagé doit recevoir le même secret, imposer l’authentification sur tout ce site et remplacer l’en-tête du proxy comme dans le fichier fourni.

Les autres projets restent sur leurs propres volumes et noms d’hôte. L’ajout de ce sous-domaine ne demande aucun changement du site à la racine du domaine.

## Références

- [Applications Docker Compose dans Coolify](https://coolify.io/docs/applications/builds/docker-compose)
- [Variables runtime et valeurs littérales dans Coolify](https://coolify.io/docs/applications/configuration/environment-variables)
- [Stockage persistant dans Coolify](https://coolify.io/docs/applications/configuration/persistent-storage)
- [Remplacement des conteneurs et Docker Compose dans Coolify](https://coolify.io/docs/applications/deployments/rolling-updates)
- [Configurations embarquées de Docker Compose](https://docs.docker.com/reference/compose-file/configs/)
- [Authentification HTTP de Caddy](https://caddyserver.com/docs/caddyfile/directives/basic_auth)
- [Proxy HTTP et en-têtes](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)
- [Variables et interpolation de Docker Compose](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/)
- [Persistance des volumes Docker](https://docs.docker.com/engine/storage/volumes/)
