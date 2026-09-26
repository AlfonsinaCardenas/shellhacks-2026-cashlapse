import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// Server-only: who is making this request.
// Signed-in user's id for user_id columns, or null if there's no session (routes return 401).
// Every statement route and page goes through this function.
export async function getSessionUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  return session?.user?.id ?? null;
}
