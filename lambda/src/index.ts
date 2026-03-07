import { APP_NAME, CSS_PATH, JS_PATH, MASTER_USERS, SESSION_PASSWORD, TOKEN_EXPIRATION } from "./const";
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { readFromS3, getData, putData, uploadToS3, deleteFromS3 } from "./s3";
import { createJsonResponse, HTTPError } from "./utils";
import { viewerToken, masterToken } from "./skyway";
import { AuthSession, AuthToken } from "./auth";
import { createHash } from "node:crypto";
import { fetchSlide } from "./slides";
import { discord } from "./discord";

const session = new AuthSession(SESSION_PASSWORD);
const token = new AuthToken(SESSION_PASSWORD, TOKEN_EXPIRATION);

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  const method = event.requestContext.http.method;
  const rawPath = event.rawPath;
  const body = JSON.parse(event.body ?? "{}");

  try {
    // ================ 認証関連 =================
    // POST /api/discord
    if (method === "POST" && rawPath === "/api/discord") {
      const [data, info] = await Promise.all([getData(), discord(body.code, body.redirect)]);
      const { hash, ...rest } = info;
      data.users[hash] = rest;
      await putData(data);
      const sessionCookie = session.issue({ h: hash });
      return createJsonResponse(200, { ...info, status: "ok" }, { cookies: [sessionCookie] });
    }

    // GET /api/auth
    if (method === "GET" && rawPath === "/api/auth") {
      const h = session.verify("h", event.cookies ?? []);
      const issuedToken = token.issue({ h });
      return createJsonResponse(200, { token: issuedToken, exp: TOKEN_EXPIRATION });
    }

    // ================ その他のAPI =================
    // GET /api/viewer
    if (method === "GET" && rawPath === "/api/viewer") {
      const h = token.verify("h", event.headers.authorization ?? "");
      return createJsonResponse(200, { ...(await getData()), h, skyway: viewerToken() });
    }

    // POST /api/users
    if (method === "POST" && rawPath === "/api/users") {
      const h: string = token.verify("h", event.headers.authorization ?? "");
      const data = await getData();
      data.users[h] = body;
      await putData(data);
      return createJsonResponse(200, { status: "ok" });
    }

    // POST /api/slides
    if (method === "POST" && rawPath === "/api/slides") {
      const pageNum = Number(body.pageNum);
      if (isNaN(pageNum) || pageNum < 0) throw new HTTPError(400, "Invalid pageNum");
      const h: string = token.verify("h", event.headers.authorization ?? "");
      const [data, buffer] = await Promise.all([getData(), fetchSlide(pageNum)]);
      const sha = createHash("sha256").update(buffer).digest("hex");
      const oldSha = data.users[h].slide;
      if (sha !== oldSha) {
        data.users[h].slide = sha;
        await Promise.all([
          putData(data),
          uploadToS3(`data/slides/${sha}.png`, buffer, "image/png"),
          deleteFromS3(`data/slides/${oldSha}.png`)
        ]);
      }
      return createJsonResponse(200, { sha });
    }

    // GET /api/master
    if (method === "GET" && rawPath === "/api/master") {
      const h: string = token.verify("h", event.headers.authorization ?? "");
      return createJsonResponse(200, MASTER_USERS.match(h) ? { ...(await getData()), h, skyway: masterToken() } : {});
    }

    // ================ 静的データ配信 =================
    // GET / (index.html)
    if (method === "GET" && rawPath === "/") {
      return {
        statusCode: 200,
        headers: { "Content-Type": "text/html" },
        body: `<!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <title>${APP_NAME}</title>
          <script type="module" crossorigin src="./${JS_PATH}"></script>
          <link rel="stylesheet" crossorigin href="./${CSS_PATH}">
        </head>
        <body>
          <div id="root"></div>
        </body>
      </html>`
      };
    }

    // GET /assets/{path}
    if (method === "GET" && rawPath.startsWith("/assets/")) {
      const safePath = rawPath.replace(/^\/+/, "");
      const res = await readFromS3(safePath, true);
      return res;
    }

    // GET /data/{path}
    if (method === "GET" && rawPath.startsWith("/data/")) {
      const safePath = rawPath.replace(/^\/+/, "");
      const res = await readFromS3(safePath, true);
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
