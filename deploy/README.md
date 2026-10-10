# Deployment

This guide describes a single-server deployment of the prototype using Next.js, Node 24, SQLite and Caddy. The app is still in development before V1. This guide covers access, persistence and updates. See the [project overview](../README.md) for scope and the [development guide](../docs/development.md) for local setup and checks.

The supplied configurations keep the application port inside Docker and pass the same `APP_ACCESS_MODE` to the gateway and application:

| Mode                | Public access                            | Personal data                                                   |
| ------------------- | ---------------------------------------- | --------------------------------------------------------------- |
| `private` (default) | HTTP Basic Auth protects the whole site. | One existing personal workspace.                                |
| `accounts`          | Course pages are public.                 | An application session is required for each personal workspace. |

Choose either Coolify or standalone Compose. Coolify's proxy handles HTTPS in the first option; Caddy handles HTTPS and certificates in the second. Both use one application instance and one persistent data volume.

## Coolify

Create a **Docker Compose application from a Git repository** with **Base Directory** `/` and **Docker Compose Location** `/deploy/compose.coolify.yaml`. Keep Raw Compose deployment, connection to a predefined network and preview deployments disabled. The file uses the repository's Dockerfile and embeds Caddy's configuration through `configs.content`, which requires Docker Compose 2.23.1 or later. No repository bind mount or second public proxy is needed. See [Coolify's Compose setup](https://coolify.io/docs/applications/builds/docker-compose) and [Docker's config reference](https://docs.docker.com/reference/compose-file/configs/).

Coolify uses the repository root as its project directory. To validate this variant locally with values from `deploy/.env`, run from the repository root:

```sh
docker compose --project-directory . --env-file deploy/.env -f deploy/compose.coolify.yaml config --quiet
```

Assign only the HTTPS site URL, such as `https://ukrainien.example.com`, to the **gateway** service in Domains. Keep HTTPS redirection enabled. Leave **app** without a domain, removing any generated domain. Coolify terminates HTTPS and forwards to `gateway:80`, which applies the selected access mode before forwarding to `app:3000`. Do not add `ports:` to either service. Use this configuration instead of running the standalone `compose.yaml`.

Set the following **Environment Variables** to runtime only: available in the container, unavailable during build. Disable automatic build-argument injection, called **Inject Build Args to Dockerfile** in older interfaces; current interfaces offer **Advanced > Build > Build arguments > Managed manually in Dockerfile**. This image needs no build secrets. See [Coolify's variable settings](https://coolify.io/docs/applications/configuration/environment-variables).

| Variable            | Value                                                                                                                                                                                    |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `APP_HOST`          | Required in both modes. Hostname only, without `https://`, a path or a trailing slash.                                                                                                   |
| `APP_ACCESS_MODE`   | `private` for HTTP Basic Auth; `accounts` for public pages and separate accounts. Defaults to `private`.                                                                                 |
| `APP_LOGIN`         | Required only in `private` mode. Personal login without spaces.                                                                                                                          |
| `APP_PASSWORD_HASH` | Required only in `private` mode. Generate bcrypt with the Caddy command below. In **Normal** view, paste the hash alone and set interpolation to **Literal** to preserve `$` characters. |
| `APP_PROXY_SECRET`  | Required in both modes. Output of `openssl rand -hex 32`, shared by the application and gateway.                                                                                         |
| `OPENAI_API_KEY`    | Optional. Leave empty to use local features without provider calls.                                                                                                                      |
| `OPENAI_MODEL`      | Optional model for written assistance. The configured default is `gpt-6-luna`.                                                                                                           |

Compose may warn about missing runtime variables and substitute empty values during the build, when services are not started. Required access values must be present at runtime: an empty host or proxy secret prevents application access, and private mode also needs its Basic Auth credentials.

Keep these values in Coolify, never Git. `deploy/.env.example` documents the same variables for local validation; no `.env` file is needed in the deployed repository. The gateway preserves Host and Origin, replaces `X-App-Proxy-Secret`, removes Authorization, limits request bodies to 256 MiB and sets headers that prevent shared caching and framing.

After deploying, verify HTTP redirects to HTTPS and check the selected mode:

- **Private:** an HTTPS request without credentials returns `401`; after HTTP login, **Mes données** opens.
- **Accounts:** courses open without credentials; personal APIs return `401` without an application session. Sign in as the provisioned owner and check **Mes données**. Follow [account activation](#enable-accounts-and-public-pages) before enabling this mode.

The `app_data` volume mounted at `/app/.data` belongs to this Coolify resource. Record its actual Docker name from **Persistent Storage** or the generated Compose configuration, because Coolify may prefix it. Retain the same resource and volume across deployments. Removing storage or creating a resource with a different volume does not carry the data over.

Before each update, create and download a backup from **Mes données**, then deploy the selected commit. Keep one `app` instance on this volume, without parallel deployments or Swarm. Container replacement may interrupt service. The backup, migration and schema compatibility guidance below also applies to Coolify. Previously saved audio remains playable.

## Prepare a standalone server

Install Docker Engine with the Compose and Buildx plugins on a Linux server. TCP ports 80 and 443 must be available and reachable; UDP 443 enables HTTP/3.

Create a DNS record for the chosen subdomain, such as `ukrainien.example.com`, pointing to the server's IPv4 address. Add an AAAA record only if IPv6 is configured too. Leave the domain's other records unchanged.

If the server already hosts sites behind Caddy or another proxy, read [sharing a server](#several-projects-on-one-server) before starting these services.

## Enable accounts and public pages

1. Download a fresh learning-data backup and retain the existing volume. Deploy the code with `APP_ACCESS_MODE=private` while preparing the owner.
2. Outside the repository, create a JSON file with permissions `0600` containing `username`, `displayName` and `password`. Passwords must have 12 to 128 characters. Usernames have 3 to 32 ASCII letters, digits, dots, hyphens or underscores, starting with a letter or digit.
3. Explicitly provision the owner from the application container. The script reads credentials from stdin and returns a recovery code. Redirect that output to a private `0600` file too. For standalone Compose, replace the placeholder paths below with your private files:

   ```sh
   umask 077
   docker compose --env-file deploy/.env exec -T app node scripts/account.ts provision-owner < /chemin/prive/compte.json > /chemin/prive/recuperation.json
   ```

   For Coolify, use this application's exact **app** container and the command `node /app/scripts/account.ts provision-owner`, with the same private stdin and output handling. The script refuses to create a second owner. Public registration cannot create an owner or claim the historical workspace. Provisioning associates the owner with the existing directory without moving or rewriting its learning data. Keep the recovery file private.

4. Set `APP_ACCESS_MODE=accounts` at runtime for **both the application and gateway**. Stop `app` before recreating the gateway, then start `app` with the new mode; on Coolify, stop the resource before redeploying it. This avoids serving requests while the services have different modes. Both supplied Compose files propagate one value to both services. The HTTP password prompt is replaced by `/connexion` and `/inscription`; accounts persist on the same volume. `APP_LOGIN` and `APP_PASSWORD_HASH` are used only in `private` mode.
5. Confirm courses are accessible without credentials and personal APIs return `401` without a session. Sign in as the owner and check the existing data. Test a second, empty account before sharing the site.

For local development, use `APP_AUTH_ENABLED=1`, a **disposable data directory** and an owner provisioned with `npm run account -- provision-owner`. Do not test against personal data. When set for accounts, `APP_DATA_DIR` must be an absolute path. See the [development guide](../docs/development.md) for local configuration.

Opaque session tokens are stored as hashes in `accounts.sqlite3`. Cookies are HttpOnly and SameSite=Lax, use Secure in the supplied HTTPS deployment, and expire after 30 days. Each member has an `accounts/<id>/` directory for its database, audio and backups; the owner retains the original data directory. Learning-data imports and exports exclude identities and sessions, so a restore does not change the account. Recovery codes replace email password resets. Using a code rotates it and revokes old sessions.

AI generation is restricted to the owner in this version. Members can play their own saved or imported audio. Registration, login and writes have persistent rate limits outside learning-data backups. Member limits include:

- 10 backup operations per 24 hours and imports of at most 8 MiB.
- Three retained manual backups and two safety backups; expired pending imports are cleaned up.
- A 48 MiB storage threshold that blocks other writes while still allowing export or restore. This is a preflight check, not a strict physical limit during transactions.

The owner's existing limits are retained. Upload reads have a deadline, with at most two inspections running concurrently.

Operational backups must include `accounts.sqlite3` and all data directories on the volume, using consistent SQLite snapshots. Individual **Mes données** exports do not back up identities. Keep the registry and existing files for rollback: switching back to `private` hides member accounts and restores access to the historical workspace without deleting member data.

## Configure standalone access

From the repository root:

```sh
cp deploy/.env.example deploy/.env
chmod 600 deploy/.env
```

Set `APP_HOST`. For the default `private` mode, choose `APP_LOGIN` and generate a password hash interactively:

```sh
docker run --rm -it caddy:2.11.4-alpine caddy hash-password --algorithm bcrypt
```

Copy the hash into `APP_PASSWORD_HASH`, enclosed in single quotes to prevent Compose from interpreting its `$` characters. Keep the password in a password manager; it belongs in neither the command nor the configuration file. These two Basic Auth variables are unnecessary once `accounts` mode is enabled.

Generate the shared proxy secret for either mode:

```sh
openssl rand -hex 32
```

Copy the 64 characters into `APP_PROXY_SECRET`. Compose supplies the same value to Caddy and the application. Caddy replaces incoming `X-App-Proxy-Secret` headers and removes Authorization before forwarding to Next.js. It preserves the hostname and origin; the application expects exactly `https://APP_HOST`.

`OPENAI_API_KEY` is optional and stays on the server. Courses, exercises, reviews and personal data work without it. It enables written AI assistance and new audio using the configured Cedar and Nova voices. Previously saved audio works without the key. Embedded podcast and video players depend on their hosts.

`deploy/.env` is excluded from Git and the Docker build context. Never put secrets in the Dockerfile or build arguments. The proxy caps request bodies at 256 MiB, including backup uploads; member imports have the lower limit described above.

## Build and start standalone Compose

Validate the configuration without displaying sensitive variables, then build and start:

```sh
docker compose --env-file deploy/.env config --quiet
docker compose --env-file deploy/.env run --rm --no-deps caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
docker compose --env-file deploy/.env build --pull app
docker compose --env-file deploy/.env up -d
docker compose --env-file deploy/.env ps
```

Open `https://ukrainien.example.com`, replacing the example with `APP_HOST`. Caddy obtains the certificate automatically once DNS and ports are ready. In **private mode**, the browser prompts for the HTTP login and password; an HTTPS request without credentials must return `401`:

```sh
curl --head https://ukrainien.example.com
```

In **accounts mode**, this page must be public. Check instead that personal APIs reject requests without a session, then sign in through `/connexion` and confirm the expected workspace.

Inspect startup logs with:

```sh
docker compose --env-file deploy/.env logs --tail 100 app caddy
```

`docker compose config` without `--quiet` can print secrets. Do not publish that output.

## Data and backups

The named `app_data` volume contains `/app/.data`, including SQLite databases, saved audio and application backups. A new volume inherits the image directory's ownership: UID/GID 1000, used by the `node` account. The standalone `caddy_data` and `caddy_config` volumes preserve Caddy's state, including certificates.

Keep the Compose project name `apprendre-ukrainien` to reuse these volumes during updates. Rebuilding an image or replacing a container does not erase them. Do not run `docker compose down -v`: it deletes the volumes and their data.

Before migrating from a local installation, create and download a backup through **Mes données**. After signing in on the server, use that page to preview and restore the file. Save or export drafts left in browser tabs separately.

Keep downloaded backups outside the server. A copy stored only in `app_data` does not protect against server loss. Store `deploy/.env` separately: application backups contain neither proxy credentials nor API keys. In accounts mode, also back up the identity registry and all member directories as described above.

## Updates

Create an application backup and download it off the server before each update. Record the currently deployed version too.

After obtaining the new repository version, build the image while the existing application remains available. Stop the single application server before replacing it:

```sh
docker compose --env-file deploy/.env build --pull app
docker compose --env-file deploy/.env stop app
docker compose --env-file deploy/.env up -d --no-deps app
docker compose --env-file deploy/.env ps
```

Expect a short interruption. Migrations run when the database opens. Use one `app` container: no replicas and no two versions running on the same SQLite volume. Rolling back may require restoring the corresponding backup. Check compatibility before opening a migrated database with older code.

After changing gateway access variables or the Caddyfile, recreate Caddy:

```sh
docker compose --env-file deploy/.env up -d --no-deps --force-recreate caddy
```

If `APP_PROXY_SECRET`, `APP_HOST` or `APP_ACCESS_MODE` changes, also recreate `app`, stopping it first as above. Keep gateway and application values synchronized. For an access-mode change, stop `app` before recreating Caddy, then start `app` with the matching mode to avoid serving requests while their modes differ. On Coolify, stop the resource before redeploying a changed access mode so both services receive the same runtime values before serving requests.

## Several projects on one server

Only one proxy should publish ports 80 and 443. If Caddy already serves several projects, do not start the supplied `caddy` service. Add this application's site block and access snippets from [Caddyfile](Caddyfile) to the shared configuration, using a distinct hostname and application-specific variables and snippet names. Retain the other site blocks.

Connect `app` and the shared Caddy instance to a common Docker network. Give this application a unique network alias and replace `reverse_proxy app:3000` with that alias. Keep the application's `APP_ORIGIN`, `APP_PROXY_SECRET`, personal volume and lack of a public port. Shared Caddy must use the same proxy secret and access mode, replace the proxy header as supplied, and enforce Basic Auth for the whole site when the mode is `private`. In `accounts` mode, leave course pages public and let the application enforce personal sessions.

Other projects retain their own volumes and hostnames. Adding this subdomain does not require changes to the site at the domain root.

## References

- [Docker Compose applications in Coolify](https://coolify.io/docs/applications/builds/docker-compose)
- [Runtime variables and literal values in Coolify](https://coolify.io/docs/applications/configuration/environment-variables)
- [Persistent storage in Coolify](https://coolify.io/docs/applications/configuration/persistent-storage)
- [Container replacement and Docker Compose in Coolify](https://coolify.io/docs/applications/deployments/rolling-updates)
- [Embedded Docker Compose configs](https://docs.docker.com/reference/compose-file/configs/)
- [Caddy HTTP authentication](https://caddyserver.com/docs/caddyfile/directives/basic_auth)
- [HTTP proxying and headers](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)
- [Docker Compose variables and interpolation](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/)
- [Docker volume persistence](https://docs.docker.com/engine/storage/volumes/)
