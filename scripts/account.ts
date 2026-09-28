/** Provision the existing private workspace's owner. Credentials enter via stdin only. */
import { openAuthStore } from "../src/lib/server/auth-store.ts";

if (process.argv[2] !== "provision-owner" || process.argv.length !== 3) {
  console.error(
    "Usage: npm run account -- provision-owner < private-account.json",
  );
  process.exitCode = 1;
} else {
  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk;
    if (Buffer.byteLength(input) > 4096)
      throw new Error("Account input is too large.");
  }
  const store = openAuthStore();
  try {
    const value: unknown = JSON.parse(input);
    if (
      !value ||
      typeof value !== "object" ||
      !("username" in value) ||
      !("password" in value) ||
      !("displayName" in value)
    )
      throw new Error("Expected username, displayName and password.");
    const result = await store.provisionOwner(
      value as { username: unknown; password: unknown; displayName: unknown },
    );
    // Output contains a one-time recovery code. Redirect to a private 0600 file.
    store.logout(result.token);
    process.stdout.write(
      JSON.stringify({
        account: result.account,
        recoveryCode: result.recoveryCode,
      }) + "\n",
    );
  } catch {
    console.error(
      "Owner provisioning failed; credentials and private details withheld.",
    );
    process.exitCode = 1;
  } finally {
    store.close();
  }
}
