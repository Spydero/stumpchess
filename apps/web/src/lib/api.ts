const SERVER = process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:4000";

export async function apiFetch(path: string, opts: RequestInit & { userId?: string } = {}) {
  const { userId, headers, ...rest } = opts;
  const res = await fetch(`${SERVER}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(userId ? { "x-user-id": userId } : {}),
      ...headers,
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Request failed");
  }
  return res.json();
}

export { SERVER };
