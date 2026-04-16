import { labelIslands, getPlayerConnections } from "./Connections";
import { IMAGE_URL, createFallbackImage } from "../common/Common";
import { createMemo, createSignal, For, Show } from "solid-js";
import { User } from "../common/Schema";

interface VoicePanelProps {
  connected: boolean;
  connectButton?: () => Promise<void>;
  leaveButton?: () => Promise<void>;
  muteButton?: () => void;
  users: { [key: string]: User };
  playerId: string;
  area: boolean[][];
  canvasSize?: number;
}

export function VoicePanel(props: VoicePanelProps) {
  const [transitioning, setTransitioning] = createSignal(false);

  const handleConnect = async () => {
    if (transitioning()) return;
    setTransitioning(true);
    try {
      await props.connectButton?.();
    } finally {
      setTransitioning(false);
    }
  };

  const handleLeave = async () => {
    if (transitioning()) return;
    setTransitioning(true);
    try {
      await props.leaveButton?.();
    } finally {
      setTransitioning(false);
    }
  };

  const islandIds = createMemo(() => labelIslands(props.area));

  const sections = createMemo(() => getPlayerConnections(props.users, props.playerId, islandIds(), props.area));

  return (
    <div
      class="w-72 portrait:w-full bg-gray-800/50 p-5 border-l border-t-0 portrait:border-t portrait:border-l-0 border-gray-700 flex flex-col shrink-0"
      style={{
        "max-height":
          props.canvasSize && window.matchMedia("(orientation: landscape)").matches
            ? `${props.canvasSize + 100}px`
            : undefined
      }}
    >
      {/* 操作ボタン */}
      <div class="flex gap-2 mb-5">
        <Show
          when={props.connected}
          fallback={
            <button
              class="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:cursor-not-allowed text-white py-2 portrait:py-3 rounded-lg text-sm portrait:text-base font-bold transition-colors shadow-lg shadow-blue-900/20"
              onClick={handleConnect}
              disabled={transitioning()}
            >
              接続
            </button>
          }
        >
          <button
            class="flex-1 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:cursor-not-allowed text-white py-2 portrait:py-3 rounded-lg text-sm portrait:text-base font-medium transition-colors"
            onClick={handleLeave}
            disabled={transitioning()}
          >
            退席
          </button>
          <button
            class="px-4 bg-gray-700 hover:bg-gray-600 text-white py-2 portrait:py-3 rounded-lg text-sm portrait:text-base transition-colors"
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
          <span class="text-xs portrait:text-sm font-bold text-gray-300 uppercase tracking-wider">
            {props.connected ? "通話中" : "未接続"}
          </span>
        </div>
        <div class="text-xs portrait:text-sm text-gray-500 font-mono">{Object.keys(props.users).length}人</div>
      </div>

      {/* スクロール可能なユーザーリスト */}
      <div class="flex-1 min-h-0 overflow-y-auto pr-1 custom-scrollbar max-h-none portrait:max-h-36">
        <Show when={sections().connected.length > 0}>
          <div class="text-[10px] portrait:text-xs font-bold text-green-400 uppercase tracking-wider px-2 mb-1">
            接続中
          </div>
          <div class="space-y-1 mb-3">
            <For each={sections().connected}>{user => <UserItem user={user} />}</For>
          </div>
        </Show>
        <Show when={sections().online.length > 0}>
          <div class="text-[10px] portrait:text-xs font-bold text-gray-500 uppercase tracking-wider px-2 mb-1">
            オンライン
          </div>
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
    <div class="flex items-center gap-3 py-3 portrait:py-4 border-b border-gray-700/50 last:border-0 hover:bg-gray-700/30 px-2 transition-colors">
      <div class="relative shrink-0">
        <img
          src={props.user.avatar ? `${IMAGE_URL}/${props.user.avatar}` : createFallbackImage(40, 40)}
          onError={e => {
            (e.currentTarget as HTMLImageElement).src = createFallbackImage(40, 40);
          }}
          alt="avatar"
          class="w-10 h-10 portrait:w-12 portrait:h-12 rounded-full border-2 border-gray-600 object-cover"
        />
        <span
          class={`status-dot absolute right-0 bottom-0 ring-2 ring-gray-800 w-3 h-3 portrait:w-4 portrait:h-4 rounded-full ${
            props.user.mute ? "bg-red-500" : "bg-green-500"
          }`}
        ></span>
      </div>
      <div class="flex-1 min-w-0">
        <div class="text-sm portrait:text-base font-semibold truncate text-gray-100">{props.user.name}</div>
        <div class="text-[10px] portrait:text-xs text-gray-500 truncate">
          {props.user.groups?.join(", ") || "No Group"}
        </div>
      </div>
    </div>
  );
}
