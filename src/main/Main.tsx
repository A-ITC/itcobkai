import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { VoicePanel } from "./VoicePanel";
import MapCreator from "./MapCreator";
import ProfileForm from "./ProfileForm";
import { User } from "../common/Schema";
import request from "../common/Common";
import Manager from "./Manager";

type Tab = "map" | "edit";

export default function Main() {
  const [users, setUsers] = createSignal<{ [key: string]: User }>({});
  const [connected, setConnected] = createSignal(false);
  const [playerId, setPlayerId] = createSignal<string>("");
  const [area, setArea] = createSignal<boolean[][]>([]);
  const [tab, setTab] = createSignal<Tab>("map");
  const [canvasSize, setCanvasSize] = createSignal(0);
  const mq = window.matchMedia("(orientation: portrait)");
  const manager = new Manager();
  let canvasRef: HTMLCanvasElement | undefined;
  let audioRef: HTMLAudioElement | undefined;

  onMount(() => {
    console.log("App mounted");
    // DOM に canvas がある状態で初期サイズを確定させる
    const applySize = () => {
      const size = MapCreator.updateStorage();
      if (canvasRef) {
        canvasRef.width = size;
        canvasRef.height = size;
      }
      setCanvasSize(size);
      manager.onResize();
    };
    const handleOrientation = (e: MediaQueryListEvent) => {
      applySize();
    };
    mq.addEventListener("change", handleOrientation);
    applySize();
    window.addEventListener("resize", applySize);

    onCleanup(() => {
      mq.removeEventListener("change", handleOrientation);
      window.removeEventListener("resize", applySize);
      manager.end();
    });
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

  async function leaveButton() {
    await manager.end();
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
    <div class="bg-gray-800 text-gray-200 min-h-screen flex landscape:items-center justify-center p-4 portrait:p-2">
      {/* メインコンテナ: portrait=縦並び landscape=横並び */}
      <div class="flex flex-row portrait:flex-col bg-gray-900 rounded-xl shadow-2xl overflow-hidden border border-gray-700 max-w-full portrait:w-full">
        {/* 左側: メインエリア (Header + Canvas) */}
        <div class="p-6 flex flex-col items-center">
          <div class="w-full">
            <HeaderBar
              tab={tab()}
              onTabChange={setTab}
            />
          </div>

          {/* Canvas Container: tab が map のときのみ表示、接続維持のため常時マウント */}
          <div
            class="relative bg-gray-950 rounded border border-gray-700 overflow-hidden"
            style={{ display: tab() === "map" ? "block" : "none" }}
          >
            <canvas
              ref={canvasRef}
              onKeyDown={e => manager.onKeyDown(e)}
              class="block touch-none"
              tabIndex="0" // キーボード操作を受け付けるために必要
            ></canvas>
            <audio ref={audioRef}></audio>
          </div>

          {/* EDIT タブ: canvas と同じ位置にプロフィール設定フォームを表示 */}
          <Show when={tab() === "edit"}>
            <div class="relative bg-gray-950 rounded border border-gray-700 overflow-auto text-gray-200 p-2">
              <ProfileForm
                initialUser={users()[playerId()]}
                onSaved={() => setTab("map")}
                canvasSize={canvasSize()}
              />
            </div>
          </Show>
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
          canvasSize={canvasSize()}
        />
      </div>
    </div>
  );
}

// HeaderBar: タイトル部分
function HeaderBar(props: { tab: Tab; onTabChange: (t: Tab) => void }) {
  return (
    <div class="flex items-center justify-between mb-4 w-full">
      <div class="flex items-center gap-3">
        <div class="text-2xl portrait:text-4xl font-bold text-white tracking-tight">ITCOBKAI</div>
        <div class="flex rounded overflow-hidden border border-gray-600 text-sm portrait:text-base">
          <button
            class={`px-2 portrait:px-3 transition-colors ${
              props.tab === "map" ? "bg-gray-700 text-white" : "bg-gray-900 text-gray-300 hover:bg-gray-700"
            }`}
            onClick={() => props.onTabChange("map")}
          >
            MAP
          </button>
          <button
            class={`px-2 portrait:px-3 transition-colors ${
              props.tab === "edit" ? "bg-gray-700 text-white" : "bg-gray-900 text-gray-300 hover:bg-gray-700"
            }`}
            onClick={() => props.onTabChange("edit")}
          >
            EDIT
          </button>
        </div>
      </div>
    </div>
  );
}
