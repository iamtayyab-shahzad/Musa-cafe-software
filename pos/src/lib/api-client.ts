import type { ApiResponse } from "@/types";
import { TOKEN_KEY } from "@/lib/utils";
import {
  apiTimeoutMs,
  isOnline,
  markReachable,
  markUnreachable,
} from "@/lib/network";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api/v1";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export type ApiFetchOptions = {
  /** Ignore circuit-breaker / navigator gate — always attempt the request. */
  bypassCircuitBreaker?: boolean;
  /** Override default interactive timeout (ms). */
  timeoutMs?: number;
  /** On failure, do not escalate the long POS cooldown (login retries). */
  softFail?: boolean;
};

function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function clearSessionEverywhere() {
  setToken(null);
  try {
    const { clearSession } = await import("@/lib/offline-db");
    await clearSession();
  } catch {
    /* ignore */
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  auth = true,
  fetchOpts?: ApiFetchOptions,
): Promise<T> {
  // Circuit breaker: skip network entirely while API is known dead.
  // Login / critical auth must bypass — shop Wi‑Fi falsely reports offline often.
  if (!fetchOpts?.bypassCircuitBreaker && !isOnline()) {
    throw new ApiError("Network unavailable", 0);
  }

  const headers = new Headers(options.headers || {});
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }
  if (auth) {
    const token = getToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  const url = `${API_URL}${path}`;
  const controller = new AbortController();
  const timeoutMs = fetchOpts?.timeoutMs ?? apiTimeoutMs();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal,
    });
  } catch (err) {
    if (!fetchOpts?.softFail) {
      markUnreachable();
    }
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiError("Request timed out", 0);
    }
    throw new ApiError("Network unavailable", 0);
  } finally {
    clearTimeout(timeout);
  }

  const json = (await res.json().catch(() => null)) as ApiResponse<T> | null;

  if (!res.ok || !json?.success) {
    if (res.status === 401 && typeof window !== "undefined") {
      await clearSessionEverywhere();
      if (!window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
    }
    // Server errors that usually mean the host is sick — cool down.
    if (
      !fetchOpts?.softFail &&
      [408, 429, 502, 503, 504].includes(res.status)
    ) {
      markUnreachable();
    }
    throw new ApiError(
      json?.message || `Request failed (${res.status})`,
      res.status,
    );
  }

  markReachable();
  return json.data;
}

export { API_URL };
