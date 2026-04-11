import { createSignal, onCleanup, onMount } from "solid-js";
import { VoicePanel } from "./VoicePanel";
import { User } from "../common/Schema";
import request from "../common/Common";
import Manager from "./Manager";

export default function Main() {
  const [users, setUsers] = createSignal<{ [key: string]: User }>({});
  const [connected, setConnected] = createSignal(false);
  const [playerId, setPlayerId] = createSignal<string>("");
  const [area, setArea] = createSignal<boolean[][]>([]);
  const manager = new Manager();
  let canvasRef: HTMLCanvasElement | undefined;
  let audioRef: HTMLAudioElement | undefined;

  onMount(() => {
    console.log("App mounted");
    const handleResize = () => manager.onResize();
    window.addEventListener("resize", handleResize);
    onCleanup(() => window.removeEventListener("resize", handleResize));
  });

  async function connectButton() {
    const res = await request("POST", "/init");
    if (res.error) {
      window.alert(`接続に失敗しました: ${res.error}`);
      return;
    }
    manager.init(res.h);
    setPlayerId(res.h);
    await manager.start(canvasRef!, audioRef!, res.token);
    setConnected(true);
    canvasRef?.focus();
  }

  function leaveButton() {
    manager.end();
    setConnected(false);
    location.reload();
  }

  function muteButton() {
    manager.mute();
  }

  manager.onUpdate = users => {
    setUsers({ ...users });
  };

  manager.onUpdateMap = a => setArea(a);

  manager.onDisconnect = () => {
    setConnected(false);
  };

  return (
    <div class="bg-gray-800 text-gray-200 min-h-screen flex items-center justify-center p-4">
      {/* メインコンテナ: モバイルは縦並び、md以上は横並び */}
      <div class="flex flex-col md:flex-row bg-gray-900 rounded-xl shadow-2xl overflow-hidden border border-gray-700 max-w-full">
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
              class="block touch-none"
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
          playerId={playerId()}
          area={area()}
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
