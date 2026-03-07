import { PRESENTATION_ID } from "./const";
import { OAuth2Client } from "google-auth-library";
import { readFile } from "node:fs/promises";
import { slides } from "@googleapis/slides";

const presentationId = PRESENTATION_ID;

export async function fetchSlide(pageNum: number) {
  const tokenData = JSON.parse(await readFile("token.json", "utf-8"));
  const auth = new OAuth2Client(tokenData.client_id, tokenData.client_secret);
  auth.setCredentials(tokenData);
  const api = slides({ version: "v1", auth });
  const result = await api.presentations.get({ presentationId });
  const pageObjectId = result.data.slides![pageNum].objectId!;
  const thumbnail = await api.presentations.pages.getThumbnail({ presentationId, pageObjectId });
  const response = await fetch(thumbnail.data.contentUrl!);
  return Buffer.from(await response.arrayBuffer());
}
