import { S3_BUCKET } from "./const";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const s3Client = new S3Client({});
const ACCOUNTS_JSON = "discord-accounts.json";

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
  get: () => S3.getJson(S3_BUCKET, ACCOUNTS_JSON),
  put: (data: any) => S3.putJson(S3_BUCKET, ACCOUNTS_JSON, data)
};
