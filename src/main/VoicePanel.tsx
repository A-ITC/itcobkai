import { createMemo, For, Show } from "solid-js";
import { User } from "../common/Schema";
import { labelIslands, getPlayerConnections } from "./Connections";
import { IMAGE_URL, createFallbackImage } from "../common/Common";

interface VoicePanelProps {
  connected: boolean;
  connectButton?: () => void;
  leaveButton?: () => void;
  muteButton?: () => void;
  users: { [key: string]: User };
  playerId: string;
  area: boolean[][];
}

export function VoicePanel(props: VoicePanelProps) {
  const islandIds = createMemo(() => labelIslands(props.area));

  const sections = createMemo(() => getPlayerConnections(props.users, props.playerId, islandIds(), props.area));

  return (
    <div class="w-full md:w-72 bg-gray-800/50 p-5 border-t md:border-t-0 md:border-l border-gray-700 flex flex-col shrink-0">
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
      <div class="flex-1 overflow-y-auto pr-1 custom-scrollbar max-h-48 md:max-h-none">
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
      <div class="relative shrink-0">
        <img
          src={props.user.avatar ? `${IMAGE_URL}/${props.user.avatar}` : createFallbackImage(40, 40)}
          onError={e => {
            (e.currentTarget as HTMLImageElement).src = createFallbackImage(40, 40);
          }}
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
