import { S3_BUCKET, SESSION_PASSWORD, TOKEN_EXPIRATION } from "./const";
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { AuthSession, AuthToken } from "./auth";
import { discord } from "./discord";
import { createJsonResponse, HTTPError } from "./utils";
import { readFromS3, users } from "./s3";

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
      const info = await discord(body.code, body.redirect);
      const sessionCookie = session.issue({ h: info.hash });
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
      const res = await readFromS3(S3_BUCKET, "dist/index.html");
      return res;
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
    return createJsonResponse(500, { status: "error", message: error.message || "Internal Server Error" });
  }
};
