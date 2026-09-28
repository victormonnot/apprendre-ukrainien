import type { Metadata } from "next";
import { AccountSettings } from "@/components/account-forms";
export const metadata: Metadata = { title: "Mon compte" };
export default function AccountPage() {
  return (
    <main id="main-content" className="page account-page" tabIndex={-1}>
      <AccountSettings />
    </main>
  );
}
