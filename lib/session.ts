// Server-only: who is making this request.
//
// TODO(auth): Auth.js isn't wired up yet (see the TODO in app/(app)/layout.tsx).
// Once it is, replace the body with:
//   const session = await auth();
//   return session?.user?.id ?? null;
// Every statement route and page already goes through this function.
export async function getSessionUserId(): Promise<string | null> {
  // Local development only, so the upload pipeline can be exercised before
  // sign-in exists. Production always gets null (401) until auth lands.
  if (process.env.NODE_ENV === "development") return process.env.DEV_USER_ID || "dev-user";
  return null;
}
