import { Show } from "solid-js";
import { User } from "../common/Schema";
import ProfileForm from "./ProfileForm";
import { VoicePanel } from "./VoicePanel";

export type Tab = "map" | "edit";

interface MainViewProps {
  users: { [key: string]: User };
  connected: boolean;
  playerId: string;
  area: boolean[][];
  tab: Tab;
  canvasSize: number;
  onTabChange: (tab: Tab) => void;
  connectButton: () => Promise<void>;
  leaveButton: () => Promise<void>;
  muteButton: () => void;
  onCanvasKeyDown: (e: KeyboardEvent) => void;
  setCanvasRef: (element: HTMLCanvasElement) => void;
  setAudioRef: (element: HTMLAudioElement) => void;
}

export default function MainView(props: MainViewProps) {
  return (
    <div class="bg-gray-800 text-gray-200 min-h-screen flex landscape:items-center justify-center p-4 portrait:p-2">
      <div class="flex flex-row portrait:flex-col bg-gray-900 rounded-xl shadow-2xl overflow-hidden border border-gray-700 max-w-full portrait:w-full">
        <div class="p-6 flex flex-col items-center">
          <div class="w-full">
            <HeaderBar
              tab={props.tab}
              onTabChange={props.onTabChange}
            />
          </div>

          <div
            class="relative bg-gray-950 rounded border border-gray-700 overflow-hidden"
            style={{ display: props.tab === "map" ? "block" : "none" }}
          >
            <canvas
              ref={element => props.setCanvasRef(element)}
              onKeyDown={props.onCanvasKeyDown}
              class="block touch-none"
              tabIndex="0"
            ></canvas>
            <audio ref={element => props.setAudioRef(element)}></audio>
          </div>

          <Show when={props.tab === "edit"}>
            <div class="relative bg-gray-950 rounded border border-gray-700 overflow-auto text-gray-200 p-2">
              <ProfileForm
                initialUser={props.users[props.playerId]}
                onSaved={() => props.onTabChange("map")}
                canvasSize={props.canvasSize}
              />
            </div>
          </Show>
        </div>

        <VoicePanel
          connected={props.connected}
          connectButton={props.connectButton}
          leaveButton={props.leaveButton}
          muteButton={props.muteButton}
          users={props.users}
          playerId={props.playerId}
          area={props.area}
          canvasSize={props.canvasSize}
        />
      </div>
    </div>
  );
}

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
