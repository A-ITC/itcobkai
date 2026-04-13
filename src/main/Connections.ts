import { User } from "../common/Schema";

/**
 * フラッドフィルで area グリッドの連結成分（島）に ID を付与する。
 * Python 側 label_islands() と同じロジック（4方向 BFS）。
 *
 * @returns islandIds[y][x] — 島 ID（1 始まり）、島外は 0
 */
export function labelIslands(area: boolean[][]): number[][] {
  const height = area.length;
  const width = height > 0 ? area[0].length : 0;
  const islandIds: number[][] = Array.from({ length: height }, () => new Array(width).fill(0));
  const visited: boolean[][] = Array.from({ length: height }, () => new Array(width).fill(false));
  let islandCount = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (area[y][x] && !visited[y][x]) {
        islandCount++;
        const stack: [number, number][] = [[x, y]];
        visited[y][x] = true;
        while (stack.length > 0) {
          const [cx, cy] = stack.pop()!;
          islandIds[cy][cx] = islandCount;
          for (const [dx, dy] of [
            [0, 1],
            [0, -1],
            [1, 0],
            [-1, 0]
          ] as [number, number][]) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx >= 0 && nx < width && ny >= 0 && ny < height && area[ny][nx] && !visited[ny][nx]) {
              visited[ny][nx] = true;
              stack.push([nx, ny]);
            }
          }
        }
      }
    }
  }
  return islandIds;
}

/** ユーザーの座標が area（島エリア）上かどうかを返す */
export function isOnArea(user: User, area: boolean[][]): boolean {
  if (!area.length || user.y < 0 || user.y >= area.length || user.x < 0 || user.x >= area[0].length) return false;
  return area[user.y][user.x];
}

/** ユーザーの座標の島 ID を返す（島外は 0）*/
export function islandIdOf(user: User, islandIds: number[][]): number {
  if (!islandIds.length || user.y < 0 || user.y >= islandIds.length || user.x < 0 || user.x >= islandIds[0].length)
    return 0;
  return islandIds[user.y][user.x];
}

/**
 * ユーザーリストと島情報から隣接リストを構築する。
 * Python 側 calculate_connections() の step 1 と同じロジック。
 *
 * 接続ルール:
 *   1. 同じ島にいる → 距離不問で接続
 *   2. 両方が島の外 → チェビシェフ距離 1 で接続
 *   3. 片方が島の中、片方が島の外 → 接続しない
 */
export function buildAdjacency(users: User[], islandIds: number[][], area: boolean[][]): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  for (const u of users) adj.set(u.h, new Set());

  for (let i = 0; i < users.length; i++) {
    for (let j = i + 1; j < users.length; j++) {
      const u1 = users[i];
      const u2 = users[j];
      const island1 = islandIdOf(u1, islandIds);
      const island2 = islandIdOf(u2, islandIds);

      let isConnected = false;
      if (island1 > 0 && island1 === island2) {
        // 1. 同じ島にいる → 距離不問で接続
        isConnected = true;
      } else if (!isOnArea(u1, area) && !isOnArea(u2, area)) {
        // 2. 両方が島の外 → チェビシェフ距離 1 で接続
        if (Math.abs(u1.x - u2.x) <= 1 && Math.abs(u1.y - u2.y) <= 1) {
          isConnected = true;
        }
      }
      // 3. 片方が島の中、片方が島の外 → 接続しない

      if (isConnected) {
        adj.get(u1.h)!.add(u2.h);
        adj.get(u2.h)!.add(u1.h);
      }
    }
  }
  return adj;
}

/**
 * プレイヤーの連結成分（接続中）とそれ以外（オンライン）のユーザーリストを返す。
 * 連結成分の探索は BFS（推移的閉包 — A-B, B-C なら A-C も接続）。
 * どちらのリストもプレイヤーからのユークリッド距離の昇順でソートされる。
 */
export function getPlayerConnections(
  users: { [key: string]: User },
  playerId: string,
  islandIds: number[][],
  area: boolean[][]
): { connected: User[]; online: User[] } {
  const player = users[playerId];
  const allUsers = Object.values(users);

  const distFrom = (u: User) => {
    if (!player) return 0;
    return Math.sqrt((u.x - player.x) ** 2 + (u.y - player.y) ** 2);
  };

  if (!player || allUsers.length === 0) {
    return { connected: [], online: allUsers.sort((a, b) => distFrom(a) - distFrom(b)) };
  }

  const adj = buildAdjacency(allUsers, islandIds, area);

  // BFS でプレイヤーの連結成分を求める（推移的閉包）
  const inPlayerComponent = new Set<string>();
  const queue: string[] = [playerId];
  inPlayerComponent.add(playerId);
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const neighbor of adj.get(cur) ?? []) {
      if (!inPlayerComponent.has(neighbor)) {
        inPlayerComponent.add(neighbor);
        queue.push(neighbor);
      }
    }
  }

  const connected: User[] = [];
  const online: User[] = [];
  for (const user of allUsers) {
    if (inPlayerComponent.has(user.h)) {
      connected.push(user);
    } else {
      online.push(user);
    }
  }
  connected.sort((a, b) => distFrom(a) - distFrom(b));
  online.sort((a, b) => distFrom(a) - distFrom(b));
  return { connected, online };
}
