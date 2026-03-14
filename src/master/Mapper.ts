import { MapRaw, Move } from "../common/Schema";

/*
noentryは立ち入り禁止エリアを表します
areaはいくつかの島(trueの塊)に分かれています
同じ島内にいるプレイヤーはconnectされます
area外の場合、ユーザーの周囲8マスのプレイヤーはconnectされます
area外のユーザーAとユーザーCの間に別のユーザーBがいる場合、さらにAB間とBC間が周囲8マス判定されてつながっている場合、ABCはconnectされます
connect状態でなくなったユーザ同士はdisconnectされます

export interface Move {
  h: string;
  x: number;
  y: number;
}
*/

export default class Mapper {
  private readonly mapRaw: MapRaw;
  private readonly noentry: boolean[][];
  private readonly area: boolean[][];
  private readonly islandIds: number[][]; // 各座標がどの島に属するか (0は島以外)
  private readonly width: number;
  private readonly height: number;
  private readonly walkableCells: { x: number; y: number }[] = [];

  private userPositions: Map<string, { x: number; y: number }> = new Map();
  private lastConnections: Set<string> = new Set(); // "user1-user2" の形式で保存
  private lastMoves: Map<string, { x: number; y: number }> = new Map();

  constructor(mapRaw: MapRaw) {
    this.mapRaw = mapRaw;
    const parseGrid = (raw: string) => raw.split(",").map(row => row.split("").map(char => char === "1"));
    this.area = parseGrid(mapRaw.red);
    this.noentry = parseGrid(mapRaw.black);
    this.height = this.area.length;
    this.width = this.area[0]?.length || 0;

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (!this.noentry[y][x]) {
          this.walkableCells.push({ x, y });
        }
      }
    }
    this.islandIds = Array.from({ length: this.height }, () => Array(this.width).fill(0));
    this.labelIslands();
  }

  private labelIslands() {
    // 島(area内の1の塊)を事前にラベリングする (4方向連結)
    let islandCount = 0;
    const visited = Array.from({ length: this.height }, () => Array(this.width).fill(false));

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.area[y][x] && !visited[y][x]) {
          islandCount++;
          const stack: [number, number][] = [[x, y]];
          visited[y][x] = true;
          while (stack.length > 0) {
            const [cx, cy] = stack.pop()!;
            this.islandIds[cy][cx] = islandCount;

            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                if (Math.abs(dx) === Math.abs(dy)) continue;
                const nx = cx + dx,
                  ny = cy + dy;
                if (
                  nx >= 0 &&
                  nx < this.width &&
                  ny >= 0 &&
                  ny < this.height &&
                  this.area[ny][nx] &&
                  !visited[ny][nx]
                ) {
                  visited[ny][nx] = true;
                  stack.push([nx, ny]);
                }
              }
            }
          }
        }
      }
    }
  }

  public getRaw(): MapRaw {
    return this.mapRaw;
  }

  public newUser(h: string): Move {
    // 新規ユーザーを空きスペースにランダム配置
    if (this.walkableCells.length === 0) {
      throw new Error("配置可能なエリアがありません。");
    }
    // 事前計算済みのリストからランダムに選択
    const randomIndex = Math.floor(Math.random() * this.walkableCells.length);
    const { x, y } = this.walkableCells[randomIndex];
    this.userPositions.set(h, { x, y });
    this.lastMoves.set(h, { x, y });
    return { h, x, y };
  }

  public move(h: string, x: number, y: number) {
    if (x >= 0 && x < this.width && y >= 0 && y < this.height && !this.noentry[y][x]) {
      this.userPositions.set(h, { x, y });
      this.lastMoves.set(h, { x, y });
    }
  }

  public lastUpdated() {
    // 現在の全コネクションを計算
    const currentConnections = this.calculateCurrentConnections();

    const connects: [string, string][] = [];
    const disconnects: [string, string][] = [];

    // 新規接続の判定
    for (const pair of currentConnections) {
      if (!this.lastConnections.has(pair)) {
        connects.push(pair.split("-") as [string, string]);
      }
    }
    // 切断の判定
    for (const pair of this.lastConnections) {
      if (!currentConnections.has(pair)) {
        disconnects.push(pair.split("-") as [string, string]);
      }
    }
    this.lastConnections = currentConnections;

    const moves: Move[] = Array.from(this.lastMoves.entries()).map(([h, { x, y }]) => ({ h, x, y }));
    this.lastMoves.clear();
    return { moves, connects, disconnects };
  }

  private calculateCurrentConnections(): Set<string> {
    const users = Array.from(this.userPositions.entries());
    const adj = new Map<string, string[]>();
    users.forEach(([id]) => adj.set(id, []));

    // 1. 直接的な接続（エッジ）をリストアップ
    for (let i = 0; i < users.length; i++) {
      for (let j = i + 1; j < users.length; j++) {
        const [u1, p1] = users[i];
        const [u2, p2] = users[j];

        const island1 = this.islandIds[p1.y][p1.x];
        const island2 = this.islandIds[p2.y][p2.x];
        let isConnected = false;
        if (island1 > 0 && island1 === island2) {
          // 条件1: 同じ島内にいる
          isConnected = true;
        } else if (!this.area[p1.y][p1.x] || !this.area[p2.y][p2.x]) {
          if (Math.abs(p1.x - p2.x) <= 1 && Math.abs(p1.y - p2.y) <= 1) {
            // 条件2: area外で周囲8マス以内にいる
            isConnected = true;
          }
        }

        if (isConnected) {
          adj.get(u1)!.push(u2);
          adj.get(u2)!.push(u1);
        }
      }
    }

    // 2. 連結成分を抽出して全ペアを生成（推移律の適用）
    const connections = new Set<string>();
    const visited = new Set<string>();

    for (const [startId] of users) {
      if (visited.has(startId)) continue;

      const component: string[] = [];
      const stack = [startId];
      visited.add(startId);

      while (stack.length > 0) {
        const u = stack.pop()!;
        component.push(u);
        for (const neighbor of adj.get(u)!) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            stack.push(neighbor);
          }
        }
      }

      // 連結成分内の全ユーザーを互いに接続
      for (let i = 0; i < component.length; i++) {
        for (let j = i + 1; j < component.length; j++) {
          const pair = [component[i], component[j]].sort().join("-");
          connections.add(pair);
        }
      }
    }

    return connections;
  }
}
