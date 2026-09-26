import type { NextAuthOptions } from "next-auth";
import type { Adapter } from "next-auth/adapters";
import GoogleProvider from "next-auth/providers/google";
import PostgresAdapter from "@auth/pg-adapter";
import { pool } from "@/lib/tigerdata";

// Server-only. Lives here, not in the route file: exporting it from route.ts breaks the build.
export const authOptions: NextAuthOptions = {
  // cast: @auth/pg-adapter's types target Auth.js v5, runtime works with next-auth v4
  adapter: PostgresAdapter(pool) as Adapter,
  session: { strategy: "database" },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    session({ session, user }) {
      session.user.id = String(user.id); // pg-adapter ids are integers
      return session;
    },
  },
};
