export const URI_PREFIX = import.meta.env.PROD ? "dist" : "dev";
export const IMAGE_URL = "/dist/images";

interface Storage {
  outer: number;
  inner: number;
}

const defaultStorage: Storage = {
  outer: 15,
  inner: 5
};

export const storage = new Proxy(JSON.parse(localStorage.getItem("storage") ?? JSON.stringify(defaultStorage)), {
  set: (obj: { [x: string]: any }, prop: string, value: any) => {
    obj[prop] = value;
    localStorage.setItem("storage", JSON.stringify(obj));
    return true;
  }
}) as Storage;

type Method = "POST" | "PUT" | "GET" | "DELETE";

const token = { iat: 0, exp: 0, token: "" };

export default async function request(method: Method, path: string, post: any = {}): Promise<any> {
  if (token.iat + token.exp < Date.now() / 1000 - 10) {
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

export function createFallbackImage(width = 64, height = 64): string {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  const scale = width / 256;
  const cx = width / 2;

  // 背景: 薄いグレー
  ctx.fillStyle = "#dcdcdc";
  ctx.fillRect(0, 0, width, height);

  // アイコン: 暗めのグレー
  ctx.fillStyle = "#646464";

  // 顔の円: 中央やや上 (256基準で center=(cx, 90), radius=45)
  ctx.beginPath();
  ctx.arc(cx, 90 * scale, 45 * scale, 0, Math.PI * 2);
  ctx.fill();

  // 体の円: 下側 (256基準で center=(cx, 210), radius=70)
  ctx.beginPath();
  ctx.arc(cx, 210 * scale, 70 * scale, 0, Math.PI * 2);
  ctx.fill();

  return canvas.toDataURL();
}

export function loadImage(src: string, img: HTMLImageElement) {
  return new Promise<HTMLImageElement>(resolve => {
    if (!src) {
      img.src = createFallbackImage();
      img.onload = () => resolve(img);
      return;
    }
    img.onload = () => resolve(img);
    img.onerror = () => {
      console.warn(`[loadImage] Failed to load: ${src} — using fallback image`);
      img.src = createFallbackImage();
      img.onload = () => resolve(img);
    };
    img.src = src;
  });
}

const tickerFuncs: { [key: string]: () => void } = {};
setInterval(() => Object.values(tickerFuncs).forEach(f => f()), 1000);

export const ticker = new Proxy(tickerFuncs, {
  set(target, key: string, value: () => void) {
    target[key] = value;
    return true;
  },
  deleteProperty(target, key: string) {
    delete target[key];
    return true;
  }
});
