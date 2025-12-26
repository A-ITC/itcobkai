import { APIGatewayProxyResultV2 } from "aws-lambda";
import { createHash } from "crypto";

export class HTTPError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
    this.name = "HTTPError";
  }
}

const CHARS: string[] = [];
for (let i = 48; i <= 57; i++) CHARS.push(String.fromCharCode(i)); // 0-9
for (let i = 65; i <= 90; i++) CHARS.push(String.fromCharCode(i)); // A-Z
for (let i = 97; i <= 122; i++) CHARS.push(String.fromCharCode(i)); // a-z

export function id7(text: string): string {
  const hash = createHash("sha256").update(text, "utf8");
  let num = parseInt(hash.digest().subarray(0, 5).toString("hex"), 16);
  let uid = "";
  while (num > 0) {
    uid = CHARS[num % 62] + uid;
    num = Math.floor(num / 62);
  }
  return uid.padStart(7, "0");
}

export function createJsonResponse(
  statusCode: number,
  body: object,
  options: { cookies?: string[] } = {}
): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    cookies: options.cookies,
    body: JSON.stringify(body)
  };
}
