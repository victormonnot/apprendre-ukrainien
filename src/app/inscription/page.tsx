import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthenticationForm } from "@/components/account-forms";
export const metadata: Metadata = { title: "Inscription" };
export default function RegisterPage() {
  return (
    <main id="main-content" className="page account-page" tabIndex={-1}>
      <Suspense fallback={<p role="status">Ouverture de l’inscription…</p>}>
        <AuthenticationForm mode="register" />
      </Suspense>
    </main>
  );
}
