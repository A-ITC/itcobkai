import { APIGatewayProxyResultV2 } from "aws-lambda";
import fs from "fs/promises";
import path from "path";

const getContentType = (filename: string): string => {
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case ".js":
      return "application/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".html":
      return "text/html; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".svg":
      return "image/svg+xml";
    default:
      return "text/plain; charset=utf-8";
  }
};

export const readFromDisk = async (pathFromRoot: string, cache?: boolean): Promise<APIGatewayProxyResultV2> => {
  const filePath = path.join(__dirname, pathFromRoot);
  const contentType = getContentType(filePath);
  const isBinary = contentType.startsWith("image/") || contentType === "application/octet-stream";

  const headers = { "Content-Type": contentType } as Record<string, string>;
  if (cache) {
    headers["Cache-Control"] = "public, max-age=3600";
  }

  if (isBinary) {
    const buf = await fs.readFile(filePath);
    return {
      statusCode: 200,
      headers: headers,
      body: buf.toString("base64"),
      isBase64Encoded: true
    };
  } else {
    const txt = await fs.readFile(filePath, "utf-8");
    return {
      statusCode: 200,
      headers: headers,
      body: txt
    };
  }
};
