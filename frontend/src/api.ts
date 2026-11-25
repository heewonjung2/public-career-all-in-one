export async function api<T = any>(path: string, opts: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = opts
  const res = await fetch(`/api${path}`, {
    ...rest,
    headers: json !== undefined ? { 'Content-Type': 'application/json', ...(rest.headers || {}) } : rest.headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  })
  if (!res.ok) {
    let msg = `요청 실패 (${res.status})`
    try {
      const j = await res.json()
      if (j.detail) msg = typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail)
    } catch { /* ignore */ }
    throw new Error(msg)
  }
  return res.json()
}

