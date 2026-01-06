// Auth関連
export const SESSION_PASSWORD = process.env.SESSION_PASSWORD ?? "";
export const TOKEN_PASSWORD = process.env.TOKEN_PASSWORD ?? "";
export const TOKEN_EXPIRATION = Number(process.env.TOKEN_EXPIRATION);

// Discord OAuth2
export const DISCORD_CLIENT_ID = process.env.VITE_DISCORD_CLIENT_ID ?? "";
export const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET ?? "";
export const DISCORD_ALLOWED_SERVERS = process.env.DISCORD_ALLOWED_SERVERS ?? "";

// Skyway
export const SKYWAY_ID = process.env.VITE_SKYWAY_ID ?? "";
export const SKYWAY_SECRET = process.env.SKYWAY_SECRET ?? "";

// その他
export const S3_BUCKET = process.env.VITE_S3_BUCKET ?? "";
export const DATA_JSON = process.env.DATA_JSON ?? "";
export const JS_PATH = process.env.JS_PATH ?? "";
export const CSS_PATH = process.env.CSS_PATH ?? "";
