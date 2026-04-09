import { createMemo, For, Show } from "solid-js";
import { User } from "../common/Schema";

interface VoicePanelProps {
  connected: boolean;
  connectButton?: () => void;
  leaveButton?: () => void;
  muteButton?: () => void;
  users: { [key: string]: User };
  playerId: string;
  area: boolean[][];
}

function computeIslandIds(area: boolean[][]): number[][] {
  const height = area.length;
  const width = height > 0 ? area[0].length : 0;
  const ids: number[][] = Array.from({ length: height }, () => new Array(width).fill(0));
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
          ids[cy][cx] = islandCount;
          for (const [dx, dy] of [
            [0, 1],
            [0, -1],
            [1, 0],
            [-1, 0]
          ] as [number, number][]) {
            const nx = cx + dx,
              ny = cy + dy;
            if (nx >= 0 && nx < width && ny >= 0 && ny < height && area[ny][nx] && !visited[ny][nx]) {
              visited[ny][nx] = true;
              stack.push([nx, ny]);
            }
          }
        }
      }
    }
  }
  return ids;
}

export function VoicePanel(props: VoicePanelProps) {
  const islandIds = createMemo(() => computeIslandIds(props.area));

  const sections = createMemo(() => {
    const player = props.users[props.playerId];
    const allUsers = Object.values(props.users);
    const ids = islandIds();
    const area = props.area;

    const distFrom = (u: User) => {
      if (!player) return 0;
      return Math.sqrt((u.x - player.x) ** 2 + (u.y - player.y) ** 2);
    };

    if (!player || allUsers.length === 0) {
      return { connected: [], online: allUsers.sort((a, b) => distFrom(a) - distFrom(b)) };
    }

    // サーバ側 _calculate_current_connections と同じロジックで隣接リストを構築
    const getIslandId = (u: User): number => {
      if (!ids.length || u.y < 0 || u.y >= ids.length || u.x < 0 || u.x >= ids[0].length) return 0;
      return ids[u.y][u.x];
    };

    const onArea = (u: User): boolean => {
      if (!area.length || u.y < 0 || u.y >= area.length || u.x < 0 || u.x >= area[0].length) return false;
      return area[u.y][u.x];
    };

    const adj = new Map<string, Set<string>>();
    for (const u of allUsers) adj.set(u.h, new Set());

    for (let i = 0; i < allUsers.length; i++) {
      for (let j = i + 1; j < allUsers.length; j++) {
        const u1 = allUsers[i];
        const u2 = allUsers[j];
        const island1 = getIslandId(u1);
        const island2 = getIslandId(u2);

        let isConnected = false;
        if (island1 > 0 && island1 === island2) {
          // 1. 同じ島にいる → 距離不問で接続
          isConnected = true;
        } else if (!onArea(u1) || !onArea(u2)) {
          // 2. どちらかが島の外 → 1マス以内なら接続（手繋ぎは連結成分で解決）
          if (Math.abs(u1.x - u2.x) <= 1 && Math.abs(u1.y - u2.y) <= 1) {
            isConnected = true;
          }
        }

        if (isConnected) {
          adj.get(u1.h)!.add(u2.h);
          adj.get(u2.h)!.add(u1.h);
        }
      }
    }

    // BFS でプレイヤーの連結成分を求める（手繋ぎを含む）
    const inPlayerComponent = new Set<string>();
    const queue: string[] = [props.playerId];
    inPlayerComponent.add(props.playerId);
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
  });

  return (
    <div class="w-64 md:w-72 bg-gray-800/50 p-5 border-l border-gray-700 flex flex-col shrink-0">
      {/* 操作ボタン */}
      <div class="flex gap-2 mb-5">
        <Show
          when={props.connected}
          fallback={
            <button
              class="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-2 rounded-lg text-sm font-bold transition-colors shadow-lg shadow-blue-900/20"
              onClick={props.connectButton}
            >
              接続
            </button>
          }
        >
          <button
            class="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-lg text-sm font-medium transition-colors"
            onClick={props.leaveButton}
          >
            退席
          </button>
          <button
            class="px-4 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-lg text-sm transition-colors"
            onClick={props.muteButton}
          >
            消音
          </button>
        </Show>
      </div>

      {/* ステータス表示 */}
      <div class="flex items-center justify-between mb-4 px-1">
        <div class="flex items-center gap-2">
          <div class={`w-2 h-2 rounded-full ${props.connected ? "bg-green-500 animate-pulse" : "bg-gray-500"}`}></div>
          <span class="text-xs font-bold text-gray-300 uppercase tracking-wider">
            {props.connected ? "通話中" : "未接続"}
          </span>
        </div>
        <div class="text-xs text-gray-500 font-mono">{Object.keys(props.users).length}人</div>
      </div>

      {/* スクロール可能なユーザーリスト */}
      <div class="flex-1 overflow-y-auto pr-1 custom-scrollbar">
        <Show when={sections().connected.length > 0}>
          <div class="text-[10px] font-bold text-green-400 uppercase tracking-wider px-2 mb-1">接続中</div>
          <div class="space-y-1 mb-3">
            <For each={sections().connected}>{user => <UserItem user={user} />}</For>
          </div>
        </Show>
        <Show when={sections().online.length > 0}>
          <div class="text-[10px] font-bold text-gray-500 uppercase tracking-wider px-2 mb-1">オンライン</div>
          <div class="space-y-1">
            <For each={sections().online}>{user => <UserItem user={user} />}</For>
          </div>
        </Show>
      </div>
    </div>
  );
}

// UserItem: ユーザーリストの各行
function UserItem(props: { user: User }) {
  return (
    <div class="flex items-center gap-3 py-3 border-b border-gray-700/50 last:border-0 hover:bg-gray-700/30 px-2 transition-colors">
      <div class="relative flex-shrink-0">
        <img
          src={`/dist/images/${props.user.avatar}`}
          alt="avatar"
          class="w-10 h-10 rounded-full border-2 border-gray-600 object-cover"
        />
        <span
          class={`status-dot absolute right-0 bottom-0 ring-2 ring-gray-800 w-3 h-3 rounded-full ${
            props.user.mute ? "bg-red-500" : "bg-green-500"
          }`}
        ></span>
      </div>
      <div class="flex-1 min-w-0">
        <div class="text-sm font-semibold truncate text-gray-100">{props.user.name}</div>
        <div class="text-[10px] text-gray-500 truncate">{props.user.groups?.join(", ") || "No Group"}</div>
      </div>
    </div>
  );
}
