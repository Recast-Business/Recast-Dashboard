import { supabase } from "./supabase";

/**
 * Wrapper around fetch() that attaches the current user's Supabase
 * access token as Bearer auth. Use for every call to /api/* so the
 * Python serverless functions can authenticate the caller.
 */
export async function apiFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);

  return fetch(input, { ...init, headers });
}
