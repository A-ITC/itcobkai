import { S3_BUCKET, SESSION_PASSWORD, TOKEN_EXPIRATION } from "./const";
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { AuthSession, AuthToken } from "./auth";
import { discord } from "./discord";
import { createJsonResponse, HTTPError } from "./utils";
import { S3, users } from "./s3";

const session = new AuthSession(SESSION_PASSWORD);
const token = new AuthToken(SESSION_PASSWORD, TOKEN_EXPIRATION);

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  const method = event.requestContext.http.method;
  const path = event.rawPath;
  const body = JSON.parse(event.body ?? "{}");
  try {
    // POST /discord
    if (method === "POST" && path === "/api/discord") {
      if (!body.code || !body.redirect) {
        return createJsonResponse(400, { status: "error", message: "code and redirect are required" });
      }
      const info = await discord(body.code, body.redirect);
      const sessionCookie = session.issue({ h: info.hash });
      return createJsonResponse(200, { ...info, status: "ok" }, { cookies: [sessionCookie] });
    }

    // GET /auth
    if (method === "GET" && path === "/api/auth") {
      const h = session.verify("h", event.cookies ?? []);
      const issuedToken = token.issue({ h });
      return createJsonResponse(200, { token: issuedToken, exp: TOKEN_EXPIRATION });
    }

    // GET /users
    if (method === "GET" && path === "/api/users") {
      token.verify("h", event.headers.authorization ?? "");
      const allUsers = await users.get();
      return createJsonResponse(200, { users: allUsers });
    }

    // POST /users
    if (method === "POST" && path === "/api/users") {
      const h: string = token.verify("h", event.headers.authorization ?? "");
      const allUsers = await users.get();
      allUsers[h] = body;
      await users.put(allUsers);
      return createJsonResponse(200, { status: "ok" });
    }

    // GET /
    if (method === "GET" && path === "/") {
      const htmlBody = await S3.getText(S3_BUCKET, "dist/index.html");
      return {
        statusCode: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
        body: htmlBody
      };
    }

    // GET /test
    if (method === "GET" && path === "/api/test") {
      return {
        statusCode: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
        body: S3_BUCKET
      };
    }

    // GET /assets/{key}
    if (method === "GET" && path.startsWith("/assets/")) {
      const key = path.substring(1); // 先頭のスラッシュを除去
      const content = await S3.getText(S3_BUCKET, key);
      let contentType = "text/plain; charset=utf-8";
      if (key.endsWith(".js")) contentType = "application/javascript; charset=utf-8";
      else if (key.endsWith(".css")) contentType = "text/css; charset=utf-8";
      else if (key.endsWith(".html")) contentType = "text/html; charset=utf-8";
      else if (key.endsWith(".png")) contentType = "image/png";
      else if (key.endsWith(".jpg") || key.endsWith(".jpeg")) contentType = "image/jpeg";
      return {
        statusCode: 200,
        headers: { "Content-Type": contentType },
        body: content
      };
    }

    // どのルートにも一致しない場合
    return createJsonResponse(404, { status: "error", message: "Not Found" });
  } catch (error: any) {
    console.error(error);
    if (error instanceof HTTPError) {
      return createJsonResponse(error.statusCode, { status: "error", message: error.message });
    } else {
      return createJsonResponse(500, { status: "error", message: error.message });
      return createJsonResponse(500, { status: "error", message: "Internal Server Error" });
    }
  }
};
