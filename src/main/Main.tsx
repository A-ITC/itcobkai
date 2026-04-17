import { createSignal, onCleanup, onMount } from "solid-js";
import { User } from "../common/Schema";
import request from "../common/Common";
import MainView, { Tab } from "./MainView";
import MapCreator from "./MapCreator";
import { createManager } from "./createManager";

export default function Main() {
  const [users, setUsers] = createSignal<{ [key: string]: User }>({});
  const [connected, setConnected] = createSignal(false);
  const [playerId, setPlayerId] = createSignal<string>("");
  const [area, setArea] = createSignal<boolean[][]>([]);
  const [tab, setTab] = createSignal<Tab>("map");
  const [canvasSize, setCanvasSize] = createSignal(0);
  const mq = window.matchMedia("(orientation: portrait)");
  const manager = createManager();
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

  manager.onUpdate = users => {
    setUsers({ ...users });
  };

  manager.onUpdateMap = a => setArea(a);

  manager.onDisconnect = () => {
    setConnected(false);
  };

  return (
    <MainView
      users={users()}
      connected={connected()}
      playerId={playerId()}
      area={area()}
      tab={tab()}
      canvasSize={canvasSize()}
      onTabChange={setTab}
      connectButton={connectButton}
      leaveButton={leaveButton}
      muteButton={muteButton}
      onCanvasKeyDown={e => manager.onKeyDown(e)}
      setCanvasRef={element => {
        canvasRef = element;
      }}
      setAudioRef={element => {
        audioRef = element;
      }}
    />
  );
}
