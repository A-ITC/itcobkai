import type { Component } from "solid-js";
import { For } from "solid-js";

type User = {
  id: number;
  name: string;
  info: string;
  avatar: string;
  statusColor: string;
};

const users: User[] = [
  {
    id: 1,
    name: "AAAA",
    info: "DDDD",
    avatar: "https://via.placeholder.com/40/9CA3AF/FFFFFF",
    statusColor: "bg-green-400"
  },
  {
    id: 2,
    name: "BBBB",
    info: "DDDD",
    avatar: "https://via.placeholder.com/40/9CA3AF/FFFFFF",
    statusColor: "bg-yellow-400"
  },
  {
    id: 3,
    name: "CCCC",
    info: "DDDD",
    avatar: "https://via.placeholder.com/40/9CA3AF/FFFFFF",
    statusColor: "bg-green-400"
  }
];

export default function Main() {
  return (
    <div class="bg-gray-800 text-gray-200 min-h-screen flex items-center justify-center p-8">
      <div class="w-full max-w-4xl md:w-[980px] bg-gray-900 rounded shadow-lg overflow-hidden flex flex-col md:flex-row">
        <div class="flex-1 p-6">
          <HeaderBar />
          <MapGrid />
        </div>

        <VoicePanel />
      </div>
    </div>
  );
}

// HeaderBar: title and small tag badges
const HeaderBar: Component = () => {
  return (
    <div class="flex items-center justify-between mb-3">
      <div class="flex items-center gap-3">
        <div class="text-2xl font-semibold text-white">ITCOBKAI</div>
        <div class="flex gap-2 text-xs">
          <span class="bg-slate-700 px-2 py-1 rounded">RTC</span>
          <span class="bg-slate-700 px-2 py-1 rounded">NOTE</span>
        </div>
      </div>
      <div class="text-sm text-gray-300">マップ UI</div>
    </div>
  );
};

// MapGrid: the left map display area
const MapGrid: Component = () => {
  return <div class="map-grid rounded bg-gray-800 h-64 sm:h-80 md:h-[520px]">マップのグリッド表示エリア</div>;
};

// ActionButtons: connect / leave / mute buttons
const ActionButtons: Component = () => {
  return (
    <div class="flex gap-2 mb-3">
      <button class="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-2 rounded text-sm">接続</button>
      <button class="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded text-sm">退席</button>
      <button class="px-3 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded text-sm">消音</button>
    </div>
  );
};

// Tabs: small tab-like UI
const Tabs: Component = () => {
  return (
    <div class="flex items-center justify-between text-xs text-gray-300 mb-3">
      <div class="flex gap-3">
        <span class="px-2 py-1 bg-gray-700 rounded">通話中</span>
        <span class="px-2 py-1 text-gray-400">オンライン</span>
      </div>
      <div class="text-gray-400">—</div>
    </div>
  );
};

// UserItem: represents a single user in the list
const UserItem: Component<{ user: User }> = props => {
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
};

// Footer: small explanatory text at the bottom of the voice panel
const Footer: Component = () => {
  return (
    <div class="mt-auto text-xs text-gray-500 pt-3">
      <div>接続: ボイスチャットに接続</div>
      <div>退席: リロード（切断）</div>
      <div>消音: ミュート</div>
    </div>
  );
};

// VoicePanel: right column which composes the above components
const VoicePanel: Component = () => {
  return (
    <div class="w-full md:w-[300px] bg-gray-800 p-4 md:border-l border-t md:border-gray-700 border-gray-700 flex flex-col">
      <ActionButtons />
      <Tabs />
      <div class="users-scroll overflow-y-auto max-h-60 md:max-h-[360px]">
        <For each={users}>{user => <UserItem user={user} />}</For>
        <div class="py-6"></div>
      </div>
      {/* <Footer /> */}
    </div>
  );
};
