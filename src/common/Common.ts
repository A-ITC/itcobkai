const APP = import.meta.env.VITE_APP_NAME;

interface Storage {
  outer: number;
  inner: number;
}

const defaultStorage: Storage = {
  outer: 13,
  inner: 2
};

export const storage = new Proxy(JSON.parse(localStorage.getItem(APP) ?? JSON.stringify(defaultStorage)), {
  set: (obj: { [x: string]: any }, prop: string, value: any) => {
    obj[prop] = value;
    localStorage.setItem(APP, JSON.stringify(obj));
    return true;
  }
}) as Storage;

type Method = "POST" | "PUT" | "GET" | "DELETE";

const token = { iat: 0, exp: 0, token: "" };

export async function request(method: Method, path: string, post?: any): Promise<any> {
  if (token.iat + token.exp < Date.now() / 1000 - 10) {
    const res = await fetch("/api/auth", {
      method: "GET",
      credentials: "include"
    });
    const json = await res.json();
    if (json.error === "無効なトークンです") {
      location.href = "/login";
    } else {
      token.iat = Math.floor(Date.now() / 1000);
      token.exp = json.exp;
      token.token = json.token;
    }
  }
  const res = await fetch(`/api${path}`, {
    method: method,
    credentials: "omit",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token.token}` },
    body: post ? JSON.stringify(post) : undefined
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

export function loadImage(src: string, img: HTMLImageElement) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

const tickerFuncs: { [key: string]: () => void } = {};
setInterval(() => Object.values(tickerFuncs).forEach(f => f()), 1000);

export const ticker = new Proxy(tickerFuncs, {
  set(target, key: string, value: () => void) {
    target[key] = value;
    return true;
  }
});
