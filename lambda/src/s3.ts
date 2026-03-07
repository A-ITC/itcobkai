import { GetObjectCommand, DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
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

export async function readFromS3(key: string, cache = false): Promise<APIGatewayProxyResultV2> {
  const ext = key.slice(key.lastIndexOf(".")).toLowerCase();
  const contentType = MIME_TYPES[ext] || "text/plain; charset=utf-8";
  const isBinary = contentType.startsWith("image/") || contentType === "application/octet-stream";
  const { Body } = await s3Client.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }));
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
}

export async function uploadToS3(key: string, body: any, contentType?: string) {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType
    })
  );
}

export async function deleteFromS3(key: string) {
  await s3Client.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key }));
}

export async function getData() {
  const command = new GetObjectCommand({ Bucket: S3_BUCKET, Key: DATA_JSON });
  const response = await s3Client.send(command);
  return JSON.parse(await response.Body!.transformToString());
}

export async function putData(data: any) {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: DATA_JSON,
      Body: JSON.stringify(data, null, 2),
      ContentType: "application/json"
    })
  );
}
