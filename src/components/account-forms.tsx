"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
  changePassword,
  login,
  logout,
  recover,
  register,
} from "@/lib/auth-client";
import { useAuth } from "./auth-context";

function message(error: unknown) {
  return error instanceof Error
    ? error.message
    : "La demande n’a pas abouti. Réessaie.";
}
function safeDestination(value: string | null) {
  return value &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\") &&
    !/^\/(connexion|inscription)(?:[/?#]|$)/.test(value)
    ? value
    : "/parcours";
}

export function AuthenticationForm({ mode }: { mode: "login" | "register" }) {
  const auth = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [recovery, setRecovery] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const creating = mode === "register";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if ((creating || recovery) && password !== confirmation) {
      setError("Les deux mots de passe doivent être identiques.");
      return;
    }
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const username = String(data.get("username")).trim().toLowerCase();
      const result = creating
        ? await register(
            username,
            String(data.get("displayName")).trim(),
            password,
          )
        : recovery
          ? await recover(
              username,
              String(data.get("recoveryCode")).trim(),
              password,
            )
          : await login(username, password);
      auth.authenticated(result);
      if (!result.recoveryCode)
        router.replace(safeDestination(params.get("next")));
    } catch (failure) {
      setError(message(failure));
    } finally {
      setBusy(false);
    }
  }
  if (!auth.enabled)
    return (
      <section className="account-card">
        <h1>Ton espace local</h1>
        <p>
          Cette installation fonctionne sans compte. Tes données restent dans
          cet espace.
        </p>
        <Link href="/parcours">Ouvrir le parcours</Link>
      </section>
    );
  if (auth.account)
    return (
      <section className="account-card">
        <h1>Tu es connecté</h1>
        <p>Tu utilises le compte de {auth.account.displayName}.</p>
        <Link className="button button-primary" href="/compte">
          Mon compte
        </Link>
      </section>
    );
  return (
    <section className="account-card">
      <p className="eyebrow">Ton parcours, à ton rythme</p>
      <h1>
        {creating
          ? "Créer mon compte"
          : recovery
            ? "Retrouver mon compte"
            : "Se connecter"}
      </h1>
      <p>
        {creating
          ? "Un compte pour conserver tes notes, tes exercices et tes révisions. Les cours se lisent aussi sans inscription."
          : recovery
            ? "Utilise le code reçu à la création de ton compte pour choisir un nouveau mot de passe."
            : "Retrouve ton espace personnel et reprends là où tu en étais."}
      </p>
      <form className="account-form" onSubmit={submit}>
        <label htmlFor="account-username">Identifiant</label>
        <input
          id="account-username"
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          minLength={3}
          maxLength={32}
          pattern="[a-zA-Z0-9][a-zA-Z0-9._\-]{2,31}"
          aria-describedby={creating ? "username-help" : undefined}
        />
        {creating && (
          <>
            <small id="username-help">
              3 à 32 caractères : lettres, chiffres, point, tiret ou tiret bas.
            </small>
            <label htmlFor="account-display-name">Prénom ou pseudo</label>
            <input
              id="account-display-name"
              name="displayName"
              autoComplete="nickname"
              required
              minLength={1}
              maxLength={60}
            />
          </>
        )}
        {recovery && (
          <>
            <label htmlFor="account-recovery-code">Code de récupération</label>
            <input
              id="account-recovery-code"
              name="recoveryCode"
              required
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
            />
          </>
        )}
        <label htmlFor="account-password">
          {recovery ? "Nouveau mot de passe" : "Mot de passe"}
        </label>
        <input
          id="account-password"
          name="password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          minLength={12}
          maxLength={128}
          autoComplete={
            creating || recovery ? "new-password" : "current-password"
          }
          aria-describedby={creating || recovery ? "password-help" : undefined}
        />
        {(creating || recovery) && (
          <>
            <small id="password-help">
              Au moins 12 caractères. Tu peux utiliser une phrase de passe.
            </small>
            <label htmlFor="account-confirm-password">
              Confirmer le mot de passe
            </label>
            <input
              id="account-confirm-password"
              type="password"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              required
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
            />
          </>
        )}
        {error && (
          <p className="account-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="button button-primary" disabled={busy}>
          {busy
            ? "Un instant…"
            : creating
              ? "Créer mon compte"
              : recovery
                ? "Réinitialiser mon mot de passe"
                : "Se connecter"}
        </button>
      </form>
      {!creating && (
        <button
          className="account-text-button"
          type="button"
          onClick={() => {
            setRecovery((value) => !value);
            setError("");
            setPassword("");
            setConfirmation("");
          }}
        >
          {recovery ? "Revenir à la connexion" : "Mot de passe oublié ?"}
        </button>
      )}
      <p className="account-footer">
        {creating ? (
          <>
            Déjà un compte ? <Link href="/connexion">Se connecter</Link>
          </>
        ) : (
          <>
            Première visite ? <Link href="/inscription">Créer un compte</Link>
          </>
        )}
      </p>
      <Link href="/parcours">Parcourir les cours librement →</Link>
    </section>
  );
}

export function AccountSettings() {
  const auth = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError("");
    setNotice("");
    if (password !== confirmation) {
      setError("Les deux nouveaux mots de passe doivent être identiques.");
      return;
    }
    setBusy(true);
    try {
      await changePassword(currentPassword, password);
      setCurrentPassword("");
      setPassword("");
      setConfirmation("");
      setNotice(
        "Mot de passe modifié. Tes autres sessions ont été déconnectées.",
      );
    } catch (failure) {
      setError(message(failure));
    } finally {
      setBusy(false);
    }
  }
  async function signOut() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await logout();
      auth.signedOut();
      router.replace("/connexion");
    } catch (failure) {
      setError(message(failure));
    } finally {
      setBusy(false);
    }
  }
  if (!auth.enabled)
    return (
      <section className="account-card">
        <h1>Espace local</h1>
        <p>Cette installation fonctionne sans compte.</p>
        <Link href="/parcours">Ouvrir le parcours</Link>
      </section>
    );
  if (!auth.account)
    return (
      <section className="account-card">
        <h1>Mon compte</h1>
        <p>Connecte-toi pour retrouver ton espace personnel.</p>
        <Link className="button button-primary" href="/connexion">
          Se connecter
        </Link>
      </section>
    );
  return (
    <div className="account-settings">
      <header className="page-heading">
        <p className="eyebrow">Mon espace personnel</p>
        <h1>Bonjour {auth.account.displayName}</h1>
        <p className="page-description">
          Identifiant : <strong>{auth.account.username}</strong>
        </p>
      </header>
      <section className="account-card">
        <h2>Ton espace</h2>
        <p>
          Tes notes, tes réponses et ta progression sont liées à ce compte.
          Elles ne sont pas partagées avec les autres comptes.
        </p>
        <p>
          {auth.account.aiEnabled
            ? "L’assistance écrite et la création de voix sont activées pour ton compte."
            : "L’apprentissage et les révisions sont accessibles. La création de contenus avec l’IA n’est pas activée pour ce compte ; les audios déjà conservés restent disponibles."}
        </p>
        <div className="account-actions">
          <Link href="/donnees">Mes données</Link>
          <button
            className="button"
            type="button"
            disabled={busy}
            onClick={() => void signOut()}
          >
            Se déconnecter
          </button>
        </div>
      </section>
      <section className="account-card">
        <h2>Changer mon mot de passe</h2>
        <form className="account-form" onSubmit={submit}>
          <label htmlFor="current-password">Mot de passe actuel</label>
          <input
            id="current-password"
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            required
            maxLength={128}
            autoComplete="current-password"
          />
          <label htmlFor="new-password">Nouveau mot de passe</label>
          <input
            id="new-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
          />
          <small>Au moins 12 caractères.</small>
          <label htmlFor="confirm-password">
            Confirmer le nouveau mot de passe
          </label>
          <input
            id="confirm-password"
            type="password"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            required
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
          />
          <button
            className="button button-primary"
            type="submit"
            disabled={busy}
          >
            Modifier le mot de passe
          </button>
        </form>
      </section>
      {error && (
        <p className="account-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="account-notice" role="status">
          {notice}
        </p>
      )}
    </div>
  );
}
