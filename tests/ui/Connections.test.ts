import { describe, it, expect } from "vitest";
import { User } from "../../src/common/Schema";
import { labelIslands, getPlayerConnections } from "../../src/main/Connections";

const makeUser = (h: string, x: number, y: number, overrides?: Partial<User>): User => ({
  name: h,
  year: 1,
  groups: [],
  avatar: "",
  mute: false,
  ...overrides,
  h,
  x,
  y
});

const makeArea = (rows: string[]): boolean[][] => rows.map(row => [...row].map(ch => ch === "1"));

const toMap = (users: User[]): { [key: string]: User } => Object.fromEntries(users.map(user => [user.h, user]));

describe("Connections", () => {
  it("分離した島には別の island ID が付く", () => {
    const ids = labelIslands(makeArea(["10001", "10001"]));

    expect(ids[0][0]).toBeGreaterThan(0);
    expect(ids[0][4]).toBeGreaterThan(0);
    expect(ids[0][0]).not.toBe(ids[0][4]);
  });

  it("同じ島にいるユーザーは距離に関わらず connected に入る", () => {
    const area = makeArea(["111", "111", "111"]);
    const ids = labelIslands(area);
    const users = [makeUser("player", 0, 0), makeUser("other", 2, 2)];

    const result = getPlayerConnections(toMap(users), "player", ids, area);

    expect(result.connected.map(user => user.h)).toEqual(["player", "other"]);
    expect(result.online).toHaveLength(0);
  });

  it("島外ユーザーのチェーンは推移的に connected へまとまる", () => {
    const area = makeArea(["000000"]);
    const ids = labelIslands(area);
    const users = [makeUser("A", 0, 0), makeUser("B", 1, 0), makeUser("C", 2, 0), makeUser("D", 5, 0)];

    const result = getPlayerConnections(toMap(users), "A", ids, area);

    expect(result.connected.map(user => user.h)).toEqual(["A", "B", "C"]);
    expect(result.online.map(user => user.h)).toEqual(["D"]);
  });

  it("島内プレイヤーに隣接する島外ユーザーは online に残る", () => {
    const area = makeArea(["110", "110"]);
    const ids = labelIslands(area);
    const users = [makeUser("player", 1, 0), makeUser("outside", 2, 0)];

    const result = getPlayerConnections(toMap(users), "player", ids, area);

    expect(result.connected.map(user => user.h)).toEqual(["player"]);
    expect(result.online.map(user => user.h)).toEqual(["outside"]);
  });

  it("プレイヤーが未登録なら全員 online として扱う", () => {
    const area = makeArea(["000"]);
    const ids = labelIslands(area);
    const users = [makeUser("A", 0, 0), makeUser("B", 1, 0)];

    const result = getPlayerConnections(toMap(users), "missing", ids, area);

    expect(result.connected).toHaveLength(0);
    expect(result.online.map(user => user.h)).toEqual(["A", "B"]);
  });
});
