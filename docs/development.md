# Development guide

This guide covers local development and the current pre-V1 implementation.
The interface and learning material are in French. For the learner workflow,
see the [usage guide](usage.md); for hosting, see the
[deployment guide](../deploy/README.md).

## Requirements and local setup

- Node.js **24.21.0** is the reference version in [`.nvmrc`](../.nvmrc).
  The accepted engine range is `^24.21.0 || ^26.4.0`.
- npm **11.17.0** is required by `packageManager`, `engines` and `devEngines`
  in [`package.json`](../package.json). [`.npmrc`](../.npmrc) enables
  `engine-strict=true`.

With nvm installed, select Node and install the required npm version if needed:

```sh
nvm install
nvm use
npm install --global npm@11.17.0
```

Then install the locked dependencies and start the application:

```sh
npm ci
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). Both `dev` and `start`
bind to `127.0.0.1`. No environment file, account or external database service
is needed for the default local, single-profile mode. Courses, exercises,
personal tracking, local search and spaced reviews work without AI calls.

## Commands and checks

| Command                              | Purpose                                                                                                          |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `npm run dev`                        | Start the local development server.                                                                              |
| `npm run check`                      | Run formatting, lint and type checks.                                                                            |
| `npm run format:check`               | Check formatting with Prettier.                                                                                  |
| `npm run format`                     | Apply Prettier formatting.                                                                                       |
| `npm run lint`                       | Run ESLint with zero warnings allowed.                                                                           |
| `npm run typecheck`                  | Generate Next.js route types and run `tsc --noEmit`.                                                             |
| `npm test`                           | Run the TypeScript unit tests with Node's test runner.                                                           |
| `npm run build`                      | Create a production build.                                                                                       |
| `npm start`                          | Serve an existing production build locally.                                                                      |
| `npm run test:e2e`                   | Build the application and run Playwright browser tests.                                                          |
| `npm run test:hosting`               | Test an isolated Docker installation over HTTPS.                                                                 |
| `npm run account -- provision-owner` | Provision the owner from JSON on standard input; see the deployment guide for private input and output handling. |

Before proposing a change, run:

```sh
npm run check
npm test
npm run build
```

For browser coverage, install Chromium once, then run Playwright:

```sh
npx playwright install chromium
npm run test:e2e
```

[`playwright.config.ts`](../playwright.config.ts) builds and starts a production
server at `http://127.0.0.1:3101`. Keep that port free. Desktop Chrome and Pixel 7
projects exercise navigation, stable anchors, print views, persistence,
exercises, reviews, conflicts between tabs and request validation. The server
uses a new temporary data directory by default, blanks the OpenAI key and model
variables, and disables local speech generation. It does not reuse an existing
server. If setting `PLAYWRIGHT_DATA_DIR` explicitly, use a disposable directory.

The account tests are skipped in the default run. Run their dedicated suite to
check authentication, sessions and separation of personal spaces:

```sh
APP_AUTH_ENABLED=1 npx playwright test tests/accounts.spec.ts
```

This suite requires its data directory to be inside the system temporary
directory and provisions its own test owner. It does not require a real account
or provider key. Unit tests cover storage, migration history, grading,
scheduling, backup and restore, request boundaries, content and audio behavior.
Provider tests use injected fixtures rather than paid API calls.

`npm run test:hosting` requires Docker, Docker Compose and Chromium, with port
3143 free. It creates a temporary Compose project, credentials, data volumes and
local certificate. It checks private HTTPS access, browser access and data
survival after container replacement, then removes its temporary resources.

The [GitHub Actions workflow](../.github/workflows/ci.yml) runs formatting,
lint, types, unit tests, the browser suite with its build, and the dedicated
account suite. A separate job runs the Docker hosting test. The workflow runs
on pushes to `main`, pull requests and manual dispatch; it does not deploy.

## Configuration

The tracked [`.env.example`](../.env.example) documents local settings;
[`deploy/.env.example`](../deploy/.env.example) documents Docker hosting.
For local changes, put only the needed settings in an ignored `.env.local`,
then restart the server. Keep keys on the server and never place them in a
`NEXT_PUBLIC_*` variable. Local environment files and personal data are excluded
from Git.

| Setting            | Default or role                                                                                                                                |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `APP_DATA_DIR`     | Persistent data root; defaults to `.data` in the project directory. Use an absolute path, required in account mode.                            |
| `APP_AUTH_ENABLED` | Set to `1` to enable accounts locally; otherwise local mode uses one profile. Use disposable data for account development.                     |
| `APP_ACCESS_MODE`  | Docker access mode: `private` or `accounts`. The value `accounts` also enables account handling in the application. See the deployment guide.  |
| `APP_ORIGIN`       | Hosted HTTPS origin. Leave unset locally; configure together with `APP_PROXY_SECRET` for hosting.                                              |
| `APP_PROXY_SECRET` | Shared proxy secret of 64 hexadecimal characters. Leave unset locally; required with `APP_ORIGIN`.                                             |
| `OPENAI_API_KEY`   | Optional server-side key for generated written assistance and speech. No key is required for courses, exercises or reviews.                    |
| `OPENAI_MODEL`     | Optional text model identifier. The current code default is `gpt-6-luna`; this records the implementation default. It does not control speech. |

Text generation currently sends Responses requests with structured JSON output,
`reasoning.effort` set to `medium`, and `store: false`. This describes the
implemented request format; provider availability is separate. The speech
model is fixed in the provider code as `gpt-4o-mini-tts-2025-12-15`. The interface
offers Cedar and Nova; old saved audio remains readable.

Generation happens on an explicit request and can incur provider charges.
Text requests include the selected text, context and source information;
exercise rereading includes submitted instructions and answers. Audio requests
send the text to synthesize. Saved results and audio are kept in the personal
SQLite database. Successful repeated requests can reuse stored results or clips.
In account mode, new text and audio generation are reserved for the owner.
Members can access their own saved or imported results and audio.

`BUILD_STANDALONE=1` enables Next.js standalone output for the Docker build.
`PLAYWRIGHT_DATA_DIR` and `AUDIO_DISABLE_LOCAL` support test isolation; they are
not needed to run the default local application.

## Architecture and storage

The application uses Next.js App Router, React and strict TypeScript, with
ESLint and Prettier. Direct dependency versions and the npm lockfile are
committed.

```text
src/app/             Pages, route handlers, styles and metadata
src/components/      Document rendering and interactive learning tools
src/content/         Catalog, Markdown documents and reference definitions
src/lib/             Shared types, Markdown preparation and browser clients
src/lib/server/      Account boundaries, storage, grading and provider calls
migrations/          Numbered learning-database SQL migrations
scripts/             Owner account provisioning
tests/               Unit, browser and isolated hosting tests
.github/workflows/   Automated checks
deploy/              Hosting instructions and proxy configuration
```

The server reads course Markdown from `src/content/modules/` and prepares it
for rendering. Browser clients call route handlers under `src/app/api/`.
Grading and the spaced-review scheduler run on the server. Review answers are
sent when revealed; the browser does not choose due dates or scheduler settings.
The scheduler uses the pinned `ts-fsrs` dependency, with its configuration
recorded alongside review history.

Storage uses Node's built-in `node:sqlite`. Opening personal storage creates
`learning.sqlite3` and its SQLite companion files in the selected data
directory. SQLite uses WAL mode and foreign-key constraints. Preserve the
whole private data directory across application updates.

| Mode or data                                           | Location under `APP_DATA_DIR`            |
| ------------------------------------------------------ | ---------------------------------------- |
| Local profile or account owner                         | `learning.sqlite3`                       |
| Member learning data                                   | `accounts/<account-id>/learning.sqlite3` |
| Account identities, sessions and authentication limits | `accounts.sqlite3`                       |
| Owner backups                                          | `backups/`                               |
| Member backups                                         | `accounts/<account-id>/backups/`         |

In account mode, authentication establishes the data directory before opening
learning stores. The owner retains the original profile directory; registering
a member does not grant ownership. Request-scoped stores are closed when the
authenticated operation finishes. The account schema is initialized separately
in `auth-store.ts`; the numbered migrations apply to learning databases.

[`database.ts`](../src/lib/server/database.ts) applies SQL migrations
transactionally and checks each recorded filename and SHA-256 checksum on
opening a learning database. Preserve applied migrations and add a new numbered
file such as `010_description.sql` for a schema change. Rewriting an applied
migration causes opening the database to fail its history check.

Personal notes and drafts carry revisions to detect conflicting edits.
Submitted exercise answers and corrections remain immutable, with a snapshot
of their definition. Content files do not hold personal data. Generated text
and audio, learning history and backups stay in private storage.

The **Mes données** backup flow exports the learning database of the current
space. It excludes account credentials and sessions. Restore checks integrity
and requires the installed schema and migration history, creates a safety copy,
then replaces that space's learning state without merging histories. It does
not replace `accounts.sqlite3`. See the usage and deployment guides for backup
handling; a learning export alone is not a backup of all hosted accounts.

## Editing learning content

The [catalog](../src/content/catalog.ts) defines stable module identifiers and
their three document views: `cours`, `vocabulaire` and `exercices`. Their Markdown
files live under `src/content/modules/<module-id>/`. The lessons are written for French-speaking learners. Keep the language of
explanations consistent across each module.

Each document starts with exactly one level-one heading. Level-two headings
populate the table of contents and carry explicit, stable identifiers:

```markdown
## Comprendre l’écriture {#ecriture}
```

Keep an identifier when renaming or moving its heading. Resume points and links
depend on it; notes are associated with the module identifier and document
view. Identifiers must be unique within a document. The Markdown renderer skips
raw HTML.

Exercise headings use stable anchors such as `{#exercice-1}`. Keep shared
exercise numbers and instructions consistent between the course and exercise
sheet. The form definitions are in [`exercises.ts`](../src/content/exercises.ts)
and [`module02-exercises.ts`](../src/content/module02-exercises.ts); expected
answers remain in the server graders, `exercise-grading.ts` and
`module02-grading.ts`.

Preserve exercise, item and field identifiers. Increase the exercise definition
version when questions or their meaning change. Attempts retain their original
definition, and an old draft cannot be submitted against a new version. Plan
how existing drafts will be recovered when making such a content change.

Review elements and card definitions live in `src/content/reviews.ts`. Preserve
their identifiers and account for stored definition versions when changing
card meaning. Adding a module does not activate its cards or reset existing
review schedules. `src/content/scenes.ts` keeps published scene versions as
snapshots: add a version for changed content so old attempts and audio sources
remain identifiable. `audio.ts` and `resources.ts` define listening material
and external-resource references.

Links between documents use routes such as `/parcours/01/cours`,
`/parcours/01/vocabulaire` and `/parcours/01/exercices`, optionally with a stable
anchor. Cite external sources in the material. Check related content tests and
browser coverage when changing anchors, shared exercises or source mappings.
