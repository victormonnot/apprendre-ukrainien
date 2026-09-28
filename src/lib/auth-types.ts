export type Account = {
  id: string;
  username: string;
  displayName: string;
  role: "owner" | "member";
  aiEnabled: boolean;
};

export type AuthState = { enabled: boolean; account: Account | null };
export type Authentication = { account: Account; recoveryCode?: string };
