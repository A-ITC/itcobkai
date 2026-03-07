// AWS関連
export const APP_NAME = process.env.VITE_APP_NAME ?? "";
export const S3_BUCKET = process.env.VITE_S3_BUCKET ?? "";
export const DATA_JSON = process.env.DATA_JSON ?? "";

// Discord OAuth2関連
export const DISCORD_CLIENT_ID = process.env.VITE_DISCORD_CLIENT_ID ?? "";
export const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET ?? "";
export const DISCORD_ALLOWED_SERVERS = process.env.DISCORD_ALLOWED_SERVERS ?? "";

// Skyway
export const SKYWAY_ID = process.env.VITE_SKYWAY_ID ?? "";
export const SKYWAY_SECRET = process.env.SKYWAY_SECRET ?? "";

// 認証関連
export const SESSION_PASSWORD = process.env.SESSION_PASSWORD ?? "";
export const TOKEN_PASSWORD = process.env.TOKEN_PASSWORD ?? "";
export const TOKEN_EXPIRATION = Number(process.env.TOKEN_EXPIRATION);
export const MASTER_USERS = process.env.MASTER_USERS ?? "";

// その他
export const PRESENTATION_ID = process.env.PRESENTATION_ID ?? "";
export const JS_PATH = process.env.JS_PATH ?? "";
export const CSS_PATH = process.env.CSS_PATH ?? "";
