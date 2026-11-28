// typed API client. the types come from apps/api/src/app.ts, so if someone changes
// an endpoint the pages using it stop compiling instead of breaking at runtime
//
//   const data = await call(api.shops[':shopId'].customers.$get({ param: { shopId }, query: {} }));
import type { AppType } from '@dokankhata/api';
import { hc, type ClientResponse } from 'hono/client';

// the github pages build is just the frontend, there's no API behind it.
// in that build every call fails straight away with a clear message instead of hitting github's 404
export const STATIC_PREVIEW = import.meta.env.VITE_STATIC_PREVIEW === 'true';
const STATIC_MESSAGE =
  'This is the static preview on GitHub Pages, so there is no server to log in to. Run DokanKhata on your own computer to use it (see the README).';

export const api = hc<AppType>('/', {
  init: { credentials: 'include' },
  ...(STATIC_PREVIEW ? { fetch: () => Promise.reject(new Error('static preview')) } : {}),
}).api;

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRes = ClientResponse<any, any, any>;
type JsonOf<R> = R extends ClientResponse<infer T, infer _S, infer _F> ? T : never;
// whatever the endpoint returns, minus the { error } shape
type OkJson<R> = Exclude<JsonOf<R>, { error: unknown }>;

// wrap every api call in this. gives you the data, or throws ApiError with the server's message
export async function call<R extends AnyRes>(request: Promise<R>): Promise<OkJson<R>> {
  let res: R;
  try {
    res = await request;
  } catch {
    if (STATIC_PREVIEW) throw new ApiError(0, 'STATIC_PREVIEW', STATIC_MESSAGE);
    throw new ApiError(0, 'NETWORK', 'Cannot reach the server. Is `npm run dev` running?');
  }
  if (res.ok) return (await res.json()) as OkJson<R>;
  let body: { error?: { code?: string; message?: string; details?: unknown } } | undefined;
  try {
    body = (await res.json()) as typeof body;
  } catch {
    /* not JSON */
  }
  throw new ApiError(
    res.status,
    body?.error?.code ?? 'HTTP',
    body?.error?.message ?? `Request failed (${res.status})`,
    body?.error?.details,
  );
}

export const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : 'Something went wrong. Please try again.';
