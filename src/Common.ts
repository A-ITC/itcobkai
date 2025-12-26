const APP = import.meta.env.VITE_APP_NAME;

export const storage = new Proxy(JSON.parse(localStorage[APP] ?? "{}"), {
  set: (obj: { [x: string]: any }, prop: string, value: any) => {
    obj[prop] = value;
    localStorage[APP] = JSON.stringify(obj);
    return true;
  }
}) as {
  interval: number;
  apikey: string;
  difficulty: string;
};

type Method = "POST" | "PUT" | "GET" | "DELETE";

const token = { iat: 0, exp: 0, token: "" };

export async function request(method: Method, path: string, post: any = {}): Promise<any> {
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
  if (res.status === 500) {
    console.error(json.error);
  }
  return json;
}

export function beep() {
  // 動作確認用の音を鳴らす
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  gain.gain.value = 0.1;
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  setTimeout(() => osc.stop(), 200);
}
