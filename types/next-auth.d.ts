import type { DefaultSession } from "next-auth";

// Adds the user id (set in the session callback in lib/auth.ts) to session.user.
declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
  }
}
