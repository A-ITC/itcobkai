import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { User } from "../common/Schema";
import request from "../common/Common";
import MapCreator from "../map/MapCreator";
import Manager from "../main/Manager";
import ProfileForm from "../views/ProfileForm";
import { VoicePanel } from "../views/VoicePanel";
import { HeaderBar, Tab } from "../views/Header";

function directionFromKey(key: string): [number, number] | undefined {
  if (key === "a" || key === "ArrowLeft") return [-1, 0];
  if (key === "w" || key === "ArrowUp") return [0, -1];
  if (key === "s" || key === "ArrowDown") return [0, 1];
  if (key === "d" || key === "ArrowRight") return [1, 0];
  return undefined;
}

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

  function handleCanvasKeyDown(e: KeyboardEvent) {
    const direction = directionFromKey(e.key);
    if (!direction) return;
    manager.moveBy(direction[0], direction[1]);
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
      <div class="flex flex-row portrait:flex-col bg-gray-900 rounded-xl shadow-2xl overflow-hidden border border-gray-700 max-w-full portrait:w-full">
        <div class="p-6 flex flex-col items-center">
          <div class="w-full">
            <HeaderBar
              tab={tab()}
              onTabChange={setTab}
            />
          </div>

          <div
            class="relative bg-gray-950 rounded border border-gray-700 overflow-hidden"
            style={{ display: tab() === "map" ? "block" : "none" }}
          >
            <canvas
              ref={element => {
                canvasRef = element;
              }}
              onKeyDown={handleCanvasKeyDown}
              class="block touch-none"
              tabIndex="0"
            ></canvas>
            <audio
              ref={element => {
                audioRef = element;
              }}
            ></audio>
          </div>

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
