export const URI_PREFIX = import.meta.env.PROD ? "dist" : "dev";

type Method = "POST" | "PUT" | "GET" | "DELETE";

const token = { iat: 0, exp: 0, token: "" };

export default async function request(method: Method, path: string, post: any = {}): Promise<any> {
  if (token.iat + token.exp - 10 < Date.now() / 1000) {
    const res = await fetch(`/api/token`, {
      method: "GET",
      credentials: "include"
    });
    if (!res.ok) {
      location.href = `/${URI_PREFIX}#/login`;
      return;
    }
    const json = await res.json();
    token.token = json.token;
    token.iat = Math.floor(Date.now() / 1000);
    token.exp = json.ttl;
  }
  const res = await fetch(`/api${path}`, {
    method: method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token.token}` },
    ...(method !== "GET" ? { body: JSON.stringify(post) } : {})
  });
  if (!res.ok) {
    if (res.status === 401) {
      location.href = `/${URI_PREFIX}#/login`;
      return;
    }
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? `HTTP ${res.status}`);
  }
  const json = await res.json();
  return json;
}
