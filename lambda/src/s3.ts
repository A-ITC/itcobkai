import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { APIGatewayProxyResultV2 } from "aws-lambda";
import { DATA_JSON, S3_BUCKET } from "./const";
import { Buffer } from "buffer";

const s3Client = new S3Client({});

const MIME_TYPES: Record<string, string> = {
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml"
};

export const readFromS3 = async (bucket: string, key: string, cache = false): Promise<APIGatewayProxyResultV2> => {
  const ext = key.slice(key.lastIndexOf(".")).toLowerCase();
  const contentType = MIME_TYPES[ext] || "text/plain; charset=utf-8";
  const isBinary = contentType.startsWith("image/") || contentType === "application/octet-stream";
  const { Body } = await s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!Body) throw new Error("Empty body");
  const headers = {
    "Content-Type": contentType,
    ...(cache && { "Cache-Control": "public, max-age=31536000, immutable" })
  };
  if (isBinary) {
    const byteArray = await Body.transformToByteArray();
    return {
      statusCode: 200,
      headers,
      body: Buffer.from(byteArray).toString("base64"),
      isBase64Encoded: true
    };
  } else {
    return {
      statusCode: 200,
      headers,
      body: await Body.transformToString()
    };
  }
};

export const S3 = {
  getText: async (bucket: string, key: string): Promise<string> => {
    try {
      const command = new GetObjectCommand({ Bucket: bucket, Key: key });
      const response = await s3Client.send(command);
      return (await response.Body?.transformToString()) ?? "";
    } catch (error: any) {
      if (error.name === "NoSuchKey") {
        return ""; // ファイルが存在しない場合は空文字を返す
      }
      throw error;
    }
  },
  getJson: async (bucket: string, key: string): Promise<any> => {
    const textContent = await S3.getText(bucket, key);
    // 空の場合は空のオブジェクトを返す
    return textContent ? JSON.parse(textContent) : {};
  },
  putJson: async (bucket: string, key: string, data: any): Promise<void> => {
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: JSON.stringify(data, null, 2),
      ContentType: "application/json"
    });
    await s3Client.send(command);
  }
};

export const users = {
  get: () => S3.getJson(S3_BUCKET, DATA_JSON),
  put: (data: any) => S3.putJson(S3_BUCKET, DATA_JSON, data)
};
