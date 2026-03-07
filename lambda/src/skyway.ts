import { SkyWayAuthToken, nowInSec } from "@skyway-sdk/token";
import { SKYWAY_ID, SKYWAY_SECRET } from "./const";
import { randomUUID } from "crypto";

export function viewerToken() {
  return createToken();
}

export function masterToken() {
  return createToken();
}

function createToken(): string {
  return new SkyWayAuthToken({
    jti: randomUUID(),
    iat: nowInSec(),
    exp: nowInSec() + 60 * 60 * 24,
    version: 3,
    scope: {
      appId: SKYWAY_ID,
      rooms: [
        {
          name: "test",
          methods: ["create", "close", "updateMetadata"],
          member: {
            name: "*",
            methods: ["publish", "subscribe", "updateMetadata"]
          }
        }
      ]
    }
  }).encode(SKYWAY_SECRET);
}
