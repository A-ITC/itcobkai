import { createSignal, onCleanup, For, Show } from "solid-js";
import { Room, RoomEvent, createLocalAudioTrack, RemoteTrack, RemoteTrackPublication } from "livekit-client";
import { beep } from "./common/Common";

const url = "wss://webrtc.eulious.com";
const token =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3NzI5NjI3MjIsImlkZW50aXR5IjoidXNlci0wMSIsImlzcyI6ImRldmtleSIsIm5hbWUiOiJ1c2VyLTAxIiwibmJmIjoxNzcyODc2MzIyLCJzdWIiOiJ1c2VyLTAxIiwidmlkZW8iOnsicm9vbSI6Im15LWZpcnN0LXJvb20iLCJyb29tSm9pbiI6dHJ1ZX19.6KnOqUYTZprOJjb_eSuvfDL7xADxJaqODJmnSbMnhrc";

const App = () => {
  console.log(import.meta.env);
  const [messages, setMessages] = createSignal<string[]>([]);
  const [inputText, setInputText] = createSignal("");
  const [isConnected, setIsConnected] = createSignal(false);
  const [isConnecting, setIsConnecting] = createSignal(false);

  let room: Room;

  const connectToRoom = async () => {
    setIsConnecting(true);
    try {
      // 1. ユーザー操作の中で beep を鳴らして AudioContext を有効化
      await beep();

      room = new Room();

      // Pythonからのテキストデータ受信
      room.on(RoomEvent.DataReceived, payload => {
        const str = new TextDecoder().decode(payload);
        setMessages(prev => [...prev, `Python: ${str}`]);
      });

      // Pythonからの音声エコー受信
      room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        if (track.kind === "audio") {
          const element = track.attach();
          // attachした要素をDOMに追加（見えない状態でも再生されます）
          document.body.appendChild(element);
        }
      });

      // 2. 接続設定
      // ※トークンは livekit-cli 等で生成したものに置き換えてください
      await room.connect(url, token);
      // 3. マイクを有効化してPythonに声を送る
      await room.localParticipant.setMicrophoneEnabled(true);

      setIsConnected(true);
      setMessages(prev => [...prev, "Connected to LiveKit Server!"]);
    } catch (e) {
      console.error("Connection failed", e);
      alert("接続に失敗しました。URLとトークンを確認してください。");
    } finally {
      setIsConnecting(false);
    }
  };

  const sendText = () => {
    if (!inputText() || !room) return;
    const data = new TextEncoder().encode(inputText());
    room.localParticipant.publishData(data, { reliable: true });
    setMessages(prev => [...prev, `You: ${inputText()}`]);
    setInputText("");
  };

  onCleanup(() => {
    if (room) room.disconnect();
  });

  return (
    <div class="p-8 bg-gray-900 min-h-screen text-white flex flex-col items-center justify-center">
      {/* 接続前：スタートボタンのみ表示 */}
      <Show when={!isConnected()}>
        <div class="text-center">
          <h1 class="text-3xl font-bold mb-6">LiveKit Echo Bot</h1>
          <button
            class={`bg-blue-600 px-10 py-4 rounded-full text-xl font-bold hover:bg-blue-500 transition-all shadow-lg ${isConnecting() ? "opacity-50 cursor-not-allowed" : ""}`}
            onClick={connectToRoom}
            disabled={isConnecting()}
          >
            {isConnecting() ? "Connecting..." : "Start & Connect"}
          </button>
          <p class="mt-4 text-gray-400 text-sm">マイクの使用許可が必要です</p>
        </div>
      </Show>

      {/* 接続後：チャット画面を表示 */}
      <Show when={isConnected()}>
        <div class="w-full max-w-2xl flex flex-col h-[80vh] bg-gray-800 rounded-xl shadow-2xl overflow-hidden border border-gray-700">
          <div class="p-4 bg-gray-700 font-bold border-b border-gray-600 flex justify-between">
            <span>Room: Connected</span>
            <span class="text-green-400">● Live</span>
          </div>

          <div class="flex-1 overflow-y-auto p-4 space-y-3">
            <For each={messages()}>
              {msg => (
                <div
                  class={`p-3 rounded-lg max-w-[80%] ${msg.startsWith("You:") ? "bg-blue-600 ml-auto" : "bg-gray-700"}`}
                >
                  {msg}
                </div>
              )}
            </For>
          </div>

          <div class="p-4 bg-gray-900 flex gap-2">
            <input
              class="flex-1 p-3 rounded bg-gray-800 border border-gray-700 focus:outline-none focus:border-blue-500 text-white"
              placeholder="Type message..."
              value={inputText()}
              onInput={e => setInputText(e.currentTarget.value)}
              onKeyPress={e => e.key === "Enter" && sendText()}
            />
            <button
              class="bg-blue-600 px-6 py-2 rounded font-bold hover:bg-blue-500 transition"
              onClick={sendText}
            >
              Send
            </button>
          </div>
        </div>
      </Show>
    </div>
  );
};

export default App;
