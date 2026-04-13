import { describe, it, expect } from "vitest";
import { User } from "../../src/common/Schema";
import { labelIslands, isOnArea, islandIdOf, buildAdjacency, getPlayerConnections } from "../../src/main/Connections";

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

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

/** 文字列リストから bool グリッドを作る（"1" → true, "0" → false） */
const makeArea = (rows: string[]): boolean[][] => rows.map(row => [...row].map(ch => ch === "1"));

// ---------------------------------------------------------------------------
// labelIslands
// ---------------------------------------------------------------------------

describe("labelIslands", () => {
  it("空グリッドは空を返す", () => {
    expect(labelIslands([])).toEqual([]);
  });

  it("全セルが island の場合は 1 つの島として ID=1 が付く", () => {
    const area = makeArea(["111", "111"]);
    const ids = labelIslands(area);
    expect(ids[0][0]).toBe(1);
    expect(ids[1][2]).toBe(1);
  });

  it("島以外のセルは ID=0", () => {
    const area = makeArea(["100", "000"]);
    const ids = labelIslands(area);
    expect(ids[0][0]).toBe(1);
    expect(ids[0][1]).toBe(0);
    expect(ids[1][0]).toBe(0);
  });

  it("分離した 2 つの島に異なる ID が付く", () => {
    // 左の島と右の島
    const area = makeArea(["10001", "10001"]);
    const ids = labelIslands(area);
    expect(ids[0][0]).toBeGreaterThan(0);
    expect(ids[0][4]).toBeGreaterThan(0);
    expect(ids[0][0]).not.toBe(ids[0][4]);
    expect(ids[0][2]).toBe(0);
  });

  it("4 方向で連結されている島は同じ ID", () => {
    const area = makeArea(["010", "111", "010"]);
    const ids = labelIslands(area);
    const id = ids[1][1];
    expect(ids[0][1]).toBe(id);
    expect(ids[2][1]).toBe(id);
    expect(ids[1][0]).toBe(id);
    expect(ids[1][2]).toBe(id);
    // 対角は別連結のはず（4方向BFS のみ）
  });
});

// ---------------------------------------------------------------------------
// isOnArea / islandIdOf
// ---------------------------------------------------------------------------

describe("isOnArea", () => {
  it("島上のユーザーは true", () => {
    const area = makeArea(["11", "11"]);
    expect(isOnArea(makeUser("u", 0, 0), area)).toBe(true);
  });

  it("島外のユーザーは false", () => {
    const area = makeArea(["10", "00"]);
    expect(isOnArea(makeUser("u", 1, 0), area)).toBe(false);
  });

  it("境界外座標（マイナス等）は false", () => {
    const area = makeArea(["11"]);
    expect(isOnArea(makeUser("u", -1, 0), area)).toBe(false);
    expect(isOnArea(makeUser("u", 0, 5), area)).toBe(false);
  });
});

describe("islandIdOf", () => {
  it("島上のユーザーに正の ID が返る", () => {
    const area = makeArea(["11"]);
    const ids = labelIslands(area);
    expect(islandIdOf(makeUser("u", 0, 0), ids)).toBeGreaterThan(0);
  });

  it("島外のユーザーは 0", () => {
    const area = makeArea(["10"]);
    const ids = labelIslands(area);
    expect(islandIdOf(makeUser("u", 1, 0), ids)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// buildAdjacency — ルール検証
// ---------------------------------------------------------------------------

describe("buildAdjacency / 接続ルール", () => {
  // ルール 1: 同じ島にいる → 距離不問で接続
  it("ルール1: 同じ島の 2 ユーザーは距離に関わらず接続される", () => {
    const area = makeArea(["111", "111", "111"]);
    const ids = labelIslands(area);
    const users = [makeUser("A", 0, 0), makeUser("B", 2, 2)];
    const adj = buildAdjacency(users, ids, area);
    expect(adj.get("A")!.has("B")).toBe(true);
  });

  it("ルール1: 異なる島のユーザーは接続されない", () => {
    const area = makeArea(["10001"]);
    const ids = labelIslands(area);
    const users = [makeUser("A", 0, 0), makeUser("B", 4, 0)];
    const adj = buildAdjacency(users, ids, area);
    expect(adj.get("A")!.has("B")).toBe(false);
  });

  // ルール 2: 両方が島の外 → チェビシェフ距離 1 で接続
  it("ルール2: 両方が島外で隣接 → 接続", () => {
    const area = makeArea(["000"]);
    const ids = labelIslands(area);
    const users = [makeUser("A", 0, 0), makeUser("B", 1, 0)];
    const adj = buildAdjacency(users, ids, area);
    expect(adj.get("A")!.has("B")).toBe(true);
  });

  it("ルール2: 両方が島外で対角（チェビシェフ 1） → 接続", () => {
    const area = makeArea(["000", "000"]);
    const ids = labelIslands(area);
    const users = [makeUser("A", 0, 0), makeUser("B", 1, 1)];
    const adj = buildAdjacency(users, ids, area);
    expect(adj.get("A")!.has("B")).toBe(true);
  });

  it("ルール2: 両方が島外で距離 2 以上 → 接続されない", () => {
    const area = makeArea(["000"]);
    const ids = labelIslands(area);
    const users = [makeUser("A", 0, 0), makeUser("B", 2, 0)];
    const adj = buildAdjacency(users, ids, area);
    expect(adj.get("A")!.has("B")).toBe(false);
  });

  // ルール 3: 片方が島の中、片方が島の外 → 接続しない
  it("ルール3: 島内ユーザーと島外ユーザーが隣接しても接続されない", () => {
    const area = makeArea(["110", "110"]);
    const ids = labelIslands(area);
    // A=(1,0) 島内, B=(2,0) 島外
    const users = [makeUser("A", 1, 0), makeUser("B", 2, 0)];
    const adj = buildAdjacency(users, ids, area);
    expect(adj.get("A")!.has("B")).toBe(false);
    expect(adj.get("B")!.has("A")).toBe(false);
  });

  it("ルール3: 島外ユーザーは島内ユーザーのブリッジになれない", () => {
    // 左島(0) | 島外(1) | 島外 ... | 右島(4)
    const area = makeArea(["10001"]);
    const ids = labelIslands(area);
    const users = [makeUser("islandA", 0, 0), makeUser("C", 1, 0), makeUser("islandB", 4, 0)];
    const adj = buildAdjacency(users, ids, area);
    // 島内↔島外 は接続しない
    expect(adj.get("islandA")!.has("C")).toBe(false);
    expect(adj.get("islandB")!.has("C")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getPlayerConnections — 推移的閉包と分類
// ---------------------------------------------------------------------------

describe("getPlayerConnections", () => {
  const emptyArea = makeArea(["000000"]);
  const emptyIds = labelIslands(emptyArea);

  const toMap = (users: User[]): { [key: string]: User } => Object.fromEntries(users.map(u => [u.h, u]));

  it("プレイヤー未登録のとき connected=[], online=全ユーザー", () => {
    const users = [makeUser("A", 0, 0), makeUser("B", 1, 0)];
    const result = getPlayerConnections(toMap(users), "nonexistent", emptyIds, emptyArea);
    expect(result.connected).toHaveLength(0);
    expect(result.online).toHaveLength(2);
  });

  it("隣接する島外ユーザーは connected に入る", () => {
    const users = [makeUser("player", 0, 0), makeUser("other", 1, 0)];
    const result = getPlayerConnections(toMap(users), "player", emptyIds, emptyArea);
    expect(result.connected.map(u => u.h)).toContain("other");
    expect(result.online.map(u => u.h)).not.toContain("other");
  });

  it("A-B-C チェーン（島外）の A から見て C も connected に入る（推移的閉包）", () => {
    const area = makeArea(["000000"]);
    const ids = labelIslands(area);
    const users = [makeUser("A", 0, 0), makeUser("B", 1, 0), makeUser("C", 2, 0)];
    const result = getPlayerConnections(toMap(users), "A", ids, area);
    expect(result.connected.map(u => u.h)).toContain("B");
    expect(result.connected.map(u => u.h)).toContain("C");
  });

  it("離れた島外ユーザーは online に残る", () => {
    const users = [makeUser("player", 0, 0), makeUser("far", 5, 0)];
    const result = getPlayerConnections(toMap(users), "player", emptyIds, emptyArea);
    expect(result.online.map(u => u.h)).toContain("far");
    expect(result.connected.map(u => u.h)).not.toContain("far");
  });

  it("ルール3: 島内プレイヤーと島外ユーザーが隣接しても online に分類される", () => {
    const area = makeArea(["110", "110"]);
    const ids = labelIslands(area);
    // player=(1,0) 島内, outside=(2,0) 島外
    const users = [makeUser("player", 1, 0), makeUser("outside", 2, 0)];
    const result = getPlayerConnections(toMap(users), "player", ids, area);
    expect(result.online.map(u => u.h)).toContain("outside");
    expect(result.connected.map(u => u.h)).not.toContain("outside");
  });

  it("同じ島にいるユーザーは距離に関わらず connected に入る", () => {
    const area = makeArea(["111", "111", "111"]);
    const ids = labelIslands(area);
    const users = [makeUser("player", 0, 0), makeUser("other", 2, 2)];
    const result = getPlayerConnections(toMap(users), "player", ids, area);
    expect(result.connected.map(u => u.h)).toContain("other");
  });
});
