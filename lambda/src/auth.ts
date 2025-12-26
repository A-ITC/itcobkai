import { createHash } from "crypto";
import { Buffer } from "buffer";
import { HTTPError } from "./utils";

export class JWT {
  public encode(payload: object, secret: string): string {
    const b64 = Buffer.from(JSON.stringify(payload)).toString("base64");
    const signature = this.createHash(b64 + secret);
    return encodeURIComponent(`${b64}.${signature}`);
  }

  public decode<T extends object>(token: string, secret: string): T {
    const [b64, signature] = decodeURIComponent(token).split(".");
    if (this.createHash(b64 + secret) !== signature) {
      throw new Error("Invalid signature");
    }
    return JSON.parse(Buffer.from(b64, "base64").toString("utf8")) as T;
  }

  private createHash(text: string): string {
    return createHash("sha256").update(text).digest("base64");
  }
}

export class AuthSession {
  private jwt: JWT;
  private sessionPassword: string;
  private decodedPayload: Record<string, any> | null = null;

  constructor(sessionPassword: string) {
    this.sessionPassword = sessionPassword;
    this.jwt = new JWT();
  }

  public issue(payload: Record<string, any>): string {
    const token = this.jwt.encode(payload, this.sessionPassword);
    return `token=${token}; Max-Age=315360000; Path=/; SameSite=None; Secure; HttpOnly`;
  }

  public verify<T>(key: string, cookies: string[]): T {
    if (this.decodedPayload === null) {
      try {
        let token: string | undefined;
        for (const cookie of cookies) {
          const match = cookie.match(/(?<=^token=)[^;]+(?=(;|$))/);
          if (match) {
            token = match[0];
            break;
          }
        }

        if (!token) {
          throw new Error("Session token not found");
        }

        this.decodedPayload = this.jwt.decode(token, this.sessionPassword);
      } catch (error: any) {
        console.error(error);
        throw new HTTPError(401, `無効なセッションです: ${error.message}`);
      }
    }
    return this.decodedPayload[key] as T;
  }
}

export class AuthToken {
  private jwt: JWT;
  private tokenPassword: string;
  private expiration: number; // 秒
  private decodedPayload: Record<string, any> | null = null;

  constructor(tokenPassword: string, expiration: number = 30 * 60) {
    this.tokenPassword = tokenPassword;
    this.expiration = expiration;
    this.jwt = new JWT();
  }

  public issue(payload: Record<string, any>): string {
    const newPayload = { ...payload, iat: Math.floor(Date.now() / 1000) };
    return this.jwt.encode(newPayload, this.tokenPassword);
  }

  public verify<T>(key: string, authorization: string): T {
    if (this.decodedPayload === null) {
      let tokenValue: string | undefined;
      try {
        const parts = authorization.split(" ");
        if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") {
          throw new Error("Invalid Authorization header format");
        }
        tokenValue = parts[1];

        this.decodedPayload = this.jwt.decode(tokenValue, this.tokenPassword);

        // 有効期限の確認
        if (this.decodedPayload.iat && this.decodedPayload.iat + this.expiration < Math.floor(Date.now() / 1000)) {
          throw new Error("Token expired");
        }
      } catch (error: any) {
        console.error(error);
        throw new HTTPError(401, `無効なトークンです: ${tokenValue || ""}. ${error.message}`);
      }
    }
    return this.decodedPayload[key] as T;
  }
}
