import { DISCORD_ALLOWED_SERVERS, DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET } from "./const";
import { id7 } from "./utils";

export interface DiscordInfo {
  id: string;
  hash: string;
  name: string | null;
  avatar: string | null;
  guild: string[];
}

class HTTPError extends Error {
  status: number;
  body: any;
  constructor(status: number, body: any) {
    super(typeof body === "string" ? body : JSON.stringify(body));
    this.status = status;
    this.body = body;
  }
}

export async function discord(code: string, redirect: string): Promise<DiscordInfo> {
  try {
    const accessToken = await _auth_discord(code, redirect);
    const guilds = await _check_joined(accessToken);
    const info = await _get_avatar(accessToken);
    info.guild = guilds;
    return info;
  } catch (err) {
    throw new HTTPError(401, err instanceof Error ? err.stack ?? err.message : String(err));
  }
}

async function _auth_discord(code: string, redirect: string): Promise<string> {
  const url = "https://discord.com/api/oauth2/token";
  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    client_secret: DISCORD_CLIENT_SECRET,
    grant_type: "authorization_code",
    code: code,
    redirect_uri: redirect,
    scope: "identify"
  });

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString()
  });

  let body: any;
  try {
    body = await res.json();
  } catch {
    throw new HTTPError(401, "invalid response from token endpoint");
  }

  if (!body || typeof body.access_token !== "string") {
    throw new HTTPError(401, body ?? "no access_token");
  }
  return body.access_token;
}

async function _get_avatar(accessToken: string): Promise<DiscordInfo> {
  const url = "https://discordapp.com/api/users/@me";
  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const body = await res.json();
  return {
    id: String(body.id),
    hash: id7(String(body.id)),
    name: body.global_name ?? body.username ?? null,
    avatar: body.avatar ?? null,
    guild: []
  };
}

async function _check_joined(accessToken: string): Promise<string[]> {
  const url = "https://discordapp.com/api/users/@me/guilds";
  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const body = await res.json();
  const serverNames: string[] = [];

  const allowed_servers: { [key: string]: string } = Object.fromEntries(
    DISCORD_ALLOWED_SERVERS.split(",").map(item => {
      const [label, id] = item.split(":");
      return [id, label];
    })
  );

  if (Array.isArray(body)) {
    for (const guild of body) {
      if (guild && typeof guild.id === "string" && Object.prototype.hasOwnProperty.call(allowed_servers, guild.id)) {
        serverNames.push(allowed_servers[guild.id]);
      }
    }
  }
  if (serverNames.length > 0) return serverNames;
  throw new HTTPError(401, "server not allowed");
}
