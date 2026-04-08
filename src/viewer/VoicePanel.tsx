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

    const distFrom = (u: User) => {
      if (!player) return 0;
      return Math.sqrt((u.x - player.x) ** 2 + (u.y - player.y) ** 2);
    };

    const playerIslandId = (() => {
      if (!player || !ids.length) return 0;
      const { y, x } = player;
      if (y < 0 || y >= ids.length || x < 0 || x >= ids[0].length) return 0;
      return ids[y][x];
    })();

    if (playerIslandId === 0) {
      return { connected: [], online: allUsers.sort((a, b) => distFrom(a) - distFrom(b)) };
    }

    const connected: User[] = [];
    const online: User[] = [];
    for (const user of allUsers) {
      const { y, x } = user;
      const userIsland = ids.length > 0 && y >= 0 && y < ids.length && x >= 0 && x < ids[0].length ? ids[y][x] : 0;
      if (userIsland !== 0 && userIsland === playerIslandId) {
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
