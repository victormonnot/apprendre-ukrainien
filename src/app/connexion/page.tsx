import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthenticationForm } from "@/components/account-forms";
export const metadata: Metadata = { title: "Connexion" };
export default function LoginPage() {
  return (
    <main id="main-content" className="page account-page" tabIndex={-1}>
      <Suspense fallback={<p role="status">Ouverture de la connexion…</p>}>
        <AuthenticationForm mode="login" />
      </Suspense>
    </main>
  );
}
