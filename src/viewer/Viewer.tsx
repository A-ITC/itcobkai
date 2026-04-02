import { createSignal, For, onMount, Show } from "solid-js";
import request from "../common/Common";
import Manager from "./ViewerManager";
import { User } from "../common/Schema";

export default function Main() {
  const [users, setUsers] = createSignal<{ [key: string]: User }>({});
  const [connected, setConnected] = createSignal(false);
  const manager = new Manager();
  let canvasRef: HTMLCanvasElement | undefined;
  let audioRef: HTMLAudioElement | undefined;

  onMount(() => {
    console.log("App mounted");
  });

  async function connectButton() {
    const res = await request("POST", "/init");
    if (res.error) {
      window.alert(`接続に失敗しました: ${res.error}`);
      return;
    }
    manager.init(res.h);
    await manager.start(canvasRef!, audioRef!, res.token);
    setConnected(true);
    canvasRef?.focus();
  }

  function leaveButton() {
    manager.end();
    setConnected(false);
  }

  function muteButton() {
    manager.mute();
  }

  manager.onUpdate = users => {
    setUsers({ ...users });
  };

  manager.onDisconnect = () => {
    setConnected(false);
  };

  return (
    <div class="bg-gray-800 text-gray-200 min-h-screen flex items-center justify-center p-4">
      {/* メインコンテナ: flex-row で横並びを維持 */}
      <div class="flex flex-row bg-gray-900 rounded-xl shadow-2xl overflow-hidden border border-gray-700 max-w-full">
        {/* 左側: メインエリア (Header + Canvas) */}
        <div class="p-6 flex flex-col items-center">
          <div class="w-full">
            <HeaderBar />
          </div>

          {/* Canvas Container: 正方形を維持するための設定 */}
          <div class="relative bg-gray-950 rounded border border-gray-700 overflow-hidden">
            <canvas
              ref={canvasRef}
              onKeyDown={e => manager.onKeyDown(e)}
              onResize={e => manager.onResize(e)}
              /* aspect-square で強制的に正方形にする */
              class="aspect-square w-[300px] sm:w-[450px] md:w-[600px] h-auto block touch-none"
              tabIndex="0" // キーボード操作を受け付けるために必要
            ></canvas>
            <audio ref={audioRef}></audio>
          </div>
        </div>

        {/* 右側: サイドパネル */}
        <VoicePanel
          connected={connected()}
          connectButton={connectButton}
          leaveButton={leaveButton}
          muteButton={muteButton}
          users={users()}
        />
      </div>
    </div>
  );
}

// HeaderBar: タイトル部分
function HeaderBar() {
  return (
    <div class="flex items-center justify-between mb-4 w-full">
      <div class="flex items-center gap-3">
        <div class="text-2xl font-bold text-white tracking-tight">ITCOBKAI</div>
        <span class="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded border border-blue-500/30">OB会</span>
      </div>
      <div class="text-sm text-gray-400 font-medium">Map View</div>
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
          class={`absolute right-0 bottom-0 ring-2 ring-gray-800 w-3 h-3 rounded-full ${
            props.user.mute ? "bg-red-500" : "bg-green-500"
          }`}
        ></span>
      </div>
      <div class="flex-1 min-w-0">
        <div class="text-sm font-semibold truncate text-gray-100">{props.user.name}</div>
        <div class="text-[10px] text-gray-500 truncate">{props.user.groups?.join(" / ") || "No Group"}</div>
      </div>
    </div>
  );
}

interface VoicePanelProps {
  connected: boolean;
  connectButton?: () => void;
  leaveButton?: () => void;
  muteButton?: () => void;
  users: { [key: string]: User };
}

function VoicePanel(props: VoicePanelProps) {
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
              接続する
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
            {props.connected ? "Online" : "Offline"}
          </span>
        </div>
        <div class="text-xs text-gray-500 font-mono">{Object.keys(props.users).length} users</div>
      </div>

      {/* スクロール可能なユーザーリスト */}
      <div class="flex-1 overflow-y-auto pr-1 custom-scrollbar">
        <div class="space-y-1">
          <For each={Object.values(props.users)}>{user => <UserItem user={user} />}</For>
        </div>
      </div>
    </div>
  );
}
