type Method = "POST" | "PUT" | "GET" | "DELETE";

const token = { iat: 0, exp: 0, token: "" };

export default async function request(method: Method, path: string, post: any = {}): Promise<any> {
  if (token.iat + token.exp < Date.now() / 1000 - 10) {
    const res = await fetch("/api/auth", {
      method: "GET",
      credentials: "include"
    });
    const json = await res.json();
    if (json.error === "無効なトークンです") {
      location.href = "/login";
    }
  }
  const res = await fetch(`/api${path}`, {
    method: method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token.token}` },
    body: JSON.stringify(post)
  });
  const json = await res.json();
  return json;
}
