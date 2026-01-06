import { CSS_PATH, JS_PATH, S3_BUCKET, SESSION_PASSWORD, TOKEN_EXPIRATION } from "./const";
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { createJsonResponse, HTTPError } from "./utils";
import { AuthSession, AuthToken } from "./auth";
import { readFromS3, users } from "./s3";
import { discord } from "./discord";

const session = new AuthSession(SESSION_PASSWORD);
const token = new AuthToken(SESSION_PASSWORD, TOKEN_EXPIRATION);

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  const method = event.requestContext.http.method;
  const rawPath = event.rawPath;
  const body = JSON.parse(event.body ?? "{}");

  try {
    // API routes...
    if (method === "POST" && rawPath === "/api/discord") {
      if (!body.code || !body.redirect) {
        return createJsonResponse(400, { status: "error", message: "code and redirect are required" });
      }
      const [allUsers, info] = await Promise.all([users.get(), discord(body.code, body.redirect)]);
      const { hash, ...rest } = info;
      allUsers.users[hash] = rest;
      await users.put(allUsers);
      const sessionCookie = session.issue({ h: hash });
      return createJsonResponse(200, { ...info, status: "ok" }, { cookies: [sessionCookie] });
    }

    if (method === "GET" && rawPath === "/api/auth") {
      const h = session.verify("h", event.cookies ?? []);
      const issuedToken = token.issue({ h });
      return createJsonResponse(200, { token: issuedToken, exp: TOKEN_EXPIRATION });
    }

    if (method === "GET" && rawPath === "/api/users") {
      token.verify("h", event.headers.authorization ?? "");
      const allUsers = await users.get();
      return createJsonResponse(200, { users: allUsers });
    }

    if (method === "POST" && rawPath === "/api/users") {
      const h: string = token.verify("h", event.headers.authorization ?? "");
      const allUsers = await users.get();
      allUsers[h] = body;
      await users.put(allUsers);
      return createJsonResponse(200, { status: "ok" });
    }

    // GET / (index.html)
    if (method === "GET" && rawPath === "/") {
      return {
        statusCode: 200,
        headers: { "Content-Type": "text/html" },
        body: `<!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <title>itcobkai</title>
          <script type="module" crossorigin src="./${JS_PATH}"></script>
          <link rel="stylesheet" crossorigin href="./${CSS_PATH}">
        </head>
        <body>
          <div id="root"></div>
        </body>
      </html>`
      };
    }

    // GET /assets/{key}
    if (method === "GET" && rawPath.startsWith("/assets/")) {
      const safePath = rawPath.replace(/^\/+/, "");
      const res = await readFromS3(S3_BUCKET, safePath, true);
      return res;
    }

    if (method === "GET" && rawPath.startsWith("/data/")) {
      const safePath = rawPath.replace(/^\/+/, "");
      const res = await readFromS3(S3_BUCKET, safePath, true);
      return res;
    }

    return createJsonResponse(404, { status: "error", message: "Not Found" });
  } catch (error: any) {
    console.error(error);
    if (error.code === "ENOENT") {
      return createJsonResponse(404, { status: "error", message: "File Not Found" });
    }
    if (error instanceof HTTPError) {
      return createJsonResponse(error.statusCode, { status: "error", message: error.message });
    }
    return createJsonResponse(500, { status: "error", message: error.stack || "Internal Server Error" });
  }
};
