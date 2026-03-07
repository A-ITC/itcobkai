import { createSignal, For, onMount } from "solid-js";
import { request } from "../common/Common";
import Manager from "./ViewerManager";
import { User } from "../common/Schema";

export default function Main() {
  const [users, setUsers] = createSignal<{ [key: string]: User }>({});
  const [initFlag, setInitFlag] = createSignal(false);
  const manager = new Manager();
  let canvasRef: HTMLCanvasElement | undefined;
  let audioRef: HTMLAudioElement | undefined;

  onMount(async () => {
    const res = await request("GET", "/viewer");
    setInitFlag(true);
    manager.init(res.h, res.users);
    console.log(res);
  });

  function connectButton() {
    console.log("Connect button clicked");
    manager.start(canvasRef!, audioRef!);
  }

  function leaveButton() {
    console.log("Leave button clicked");
    manager.end();
  }

  manager.onUpdate = users => {
    setUsers({ ...users });
  };

  return (
    <div class="bg-gray-800 text-gray-200 min-h-screen flex items-center justify-center p-8">
      <div class="w-full max-w-4xl md:w-[980px] bg-gray-900 rounded shadow-lg overflow-hidden flex flex-col md:flex-row">
        <div class="flex-1 p-6">
          <HeaderBar />
          <canvas
            ref={canvasRef}
            onKeyDown={e => manager.onKeyDown(e)}
            onResize={e => manager.onResize(e)}
            class="map-grid rounded bg-gray-800 h-64 sm:h-80 md:h-[520px]"
          ></canvas>
          <audio ref={audioRef}></audio>
        </div>
        <VoicePanel
          connectButton={connectButton}
          leaveButton={leaveButton}
          users={users}
        />
      </div>
    </div>
  );
}

// HeaderBar: title and small tag badges
function HeaderBar() {
  return (
    <div class="flex items-center justify-between mb-3">
      <div class="flex items-center gap-3">
        <div class="text-2xl font-semibold text-white">ITCOBKAI</div>
        <div class="flex gap-2 text-xs">
          <span class="bg-slate-700 px-2 py-1 rounded cursor-pointer">RTC</span>
          <span class="bg-slate-700 px-2 py-1 rounded cursor-pointer">NOTE</span>
        </div>
      </div>
      <div class="text-sm text-gray-300">マップ UI</div>
    </div>
  );
}

// UserItem: represents a single user in the list
function UserItem(props: { user: User }) {
  return (
    <div class="flex items-center gap-3 py-2 border-b border-gray-700">
      <div class="relative">
        <img
          src={props.user.avatar}
          alt="avatar"
          class="w-10 h-10 rounded-full border-2 border-gray-700"
        />
        <span class={`status-dot absolute right-0 bottom-0 ring-2 ring-gray-800 ${props.user.statusColor}`}></span>
      </div>
      <div class="flex-1">
        <div class="text-sm font-medium">{props.user.name}</div>
        <div class="text-xs text-gray-400">{props.user.info}</div>
      </div>
    </div>
  );
}

interface VoicePanelProps {
  connectButton?: () => void;
  leaveButton?: () => void;
}
function VoicePanel(props: VoicePanelProps) {
  return (
    <div class="w-full md:w-[300px] bg-gray-800 p-4 md:border-l border-t md:border-gray-700 border-gray-700 flex flex-col">
      <div class="flex gap-2 mb-3">
        <div
          class="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-2 rounded text-sm cursor-pointer"
          onClick={props.connectButton}
        >
          接続
        </div>
        <div
          class="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded text-sm cursor-pointer"
          onClick={props.leaveButton}
        >
          退席
        </div>
        <div class="px-3 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded text-sm cursor-pointer">消音</div>
      </div>
      <div class="flex items-center justify-between text-xs text-gray-300 mb-3">
        <div class="flex gap-3">
          <span class="px-2 py-1 bg-gray-700 rounded">通話中</span>
          <span class="px-2 py-1 text-gray-400">オンライン</span>
        </div>
        <div class="text-gray-400">—</div>
      </div>
      <div class="users-scroll overflow-y-auto max-h-60 md:max-h-[360px]">
        {/* <For each={users}>{user => <UserItem user={user} />}</For> */}
        <div class="py-6"></div>
      </div>
    </div>
  );
}
