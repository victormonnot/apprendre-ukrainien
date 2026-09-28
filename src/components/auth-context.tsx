"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { AuthState, Authentication } from "@/lib/auth-types";
import {
  AUTH_STORAGE_KEY,
  announceAuthChange,
  loadAuth,
} from "@/lib/auth-client";
import {
  adoptLegacyWorkspaceDrafts,
  configureWorkspaceIdentity,
  suspendWorkspace,
} from "@/lib/workspace-client";
import "./account.css";

type AuthContextValue = AuthState & {
  refresh: () => Promise<void>;
  authenticated: (result: Authentication) => void;
  signedOut: () => void;
};
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const [recovery, setRecovery] = useState<{
    accountId: string;
    code: string;
  } | null>(null);
  const [savedCode, setSavedCode] = useState(false);
  const sequence = useRef({ value: 0 });
  const router = useRouter();
  const recoveryHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!checking && recovery) recoveryHeading.current?.focus();
  }, [checking, recovery]);
  const refresh = useCallback(async () => {
    const request = ++sequence.current.value;
    suspendWorkspace();
    setChecking(true);
    setError("");
    try {
      const result = await loadAuth();
      if (request !== sequence.current.value) return;
      if (result.enabled && result.account)
        adoptLegacyWorkspaceDrafts(result.account);
      configureWorkspaceIdentity(result.enabled, result.account?.id ?? null);
      setState(result);
      setRecovery((previous) =>
        previous?.accountId === result.account?.id ? previous : null,
      );
      setChecking(false);
    } catch (failure) {
      if (request === sequence.current.value)
        setError(
          failure instanceof Error
            ? failure.message
            : "Ton espace est indisponible.",
        );
    }
  }, []);
  useEffect(() => {
    const lifecycle = sequence.current;
    let active = true;
    void Promise.resolve().then(() => {
      if (active) return refresh();
    });
    const revalidate = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const storage = (event: StorageEvent) => {
      if (event.key === AUTH_STORAGE_KEY || event.key === null) void refresh();
    };
    window.addEventListener("focus", revalidate);
    window.addEventListener("storage", storage);
    window.addEventListener("account-changed", revalidate);
    document.addEventListener("visibilitychange", revalidate);
    return () => {
      active = false;
      lifecycle.value++;
      window.removeEventListener("focus", revalidate);
      window.removeEventListener("storage", storage);
      window.removeEventListener("account-changed", revalidate);
      document.removeEventListener("visibilitychange", revalidate);
    };
  }, [refresh]);
  const authenticated = (result: Authentication) => {
    sequence.current.value++;
    adoptLegacyWorkspaceDrafts(result.account);
    configureWorkspaceIdentity(true, result.account.id);
    setState({ enabled: true, account: result.account });
    setChecking(false);
    setError("");
    if (result.recoveryCode) {
      setRecovery({ accountId: result.account.id, code: result.recoveryCode });
      setSavedCode(false);
    }
    announceAuthChange();
  };
  const signedOut = () => {
    sequence.current.value++;
    configureWorkspaceIdentity(true, null);
    setState({ enabled: true, account: null });
    setChecking(false);
    setRecovery(null);
    announceAuthChange();
  };
  return (
    <>
      {checking && (
        <div className="auth-loading" role={error ? "alert" : "status"}>
          <p>{error || "Ouverture de l’application…"}</p>
          {error && (
            <button
              type="button"
              className="button button-primary"
              onClick={() => void refresh()}
            >
              Réessayer
            </button>
          )}
        </div>
      )}
      {state && !recovery && (
        <AuthContext.Provider
          value={{ ...state, refresh, authenticated, signedOut }}
        >
          <div
            className="authenticated-app"
            hidden={checking}
            inert={checking}
            key={state.enabled ? (state.account?.id ?? "guest") : "local"}
          >
            {children}
          </div>
        </AuthContext.Provider>
      )}
      {!checking && recovery && state?.account?.id === recovery.accountId && (
        <main id="main-content" className="recovery-page">
          <section className="account-card" aria-labelledby="recovery-title">
            <p className="eyebrow">À conserver une seule fois</p>
            <h1 id="recovery-title" tabIndex={-1} ref={recoveryHeading}>
              Ton code de récupération
            </h1>
            <p>
              Conserve ce code dans ton gestionnaire de mots de passe ou un
              endroit privé. Il permet de retrouver ton compte si tu oublies ton
              mot de passe. Aucun e-mail n’est nécessaire.
            </p>
            <code className="recovery-code" data-recovery-code>
              {recovery.code}
            </code>
            <p>
              Il ne sera plus affiché après cette étape. Un nouveau code
              remplace celui que tu viens d’utiliser en cas de récupération.
            </p>
            <label className="account-checkbox">
              <input
                type="checkbox"
                checked={savedCode}
                onChange={(event) => setSavedCode(event.target.checked)}
              />{" "}
              J’ai conservé mon code de récupération
            </label>
            <button
              className="button button-primary"
              type="button"
              disabled={!savedCode}
              onClick={() => {
                setRecovery(null);
                setSavedCode(false);
                router.push("/compte");
              }}
            >
              Continuer
            </button>
          </section>
        </main>
      )}
    </>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("AuthProvider is required");
  return context;
}

export function PersonalGate({
  children,
  compact = false,
  title = "Ton espace personnel",
  silent = false,
}: {
  children: ReactNode;
  compact?: boolean;
  title?: string;
  silent?: boolean;
}) {
  const { enabled, account } = useAuth();
  const pathname = usePathname();
  if (!enabled || account) return children;
  if (silent) return null;
  const href = `/connexion?next=${encodeURIComponent(pathname)}`;
  if (compact)
    return (
      <Link
        className="personal-inline-link"
        href={href}
        title="Connecte-toi pour écouter"
        aria-label="Se connecter pour écouter"
      >
        ♫
      </Link>
    );
  return (
    <section className="personal-gate">
      <div>
        <h2>{title}</h2>
        <p>
          Connecte-toi pour garder tes notes, tes réponses et ta progression
          dans ton propre espace.
        </p>
      </div>
      <div className="account-actions">
        <Link className="button button-primary" href={href}>
          Se connecter
        </Link>
        <Link href="/inscription">Créer un compte</Link>
      </div>
    </section>
  );
}
