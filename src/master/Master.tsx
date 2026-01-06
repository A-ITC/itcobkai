import { SkywayMaster, SkywayViewer } from "../common/RTC";
import { createSignal } from "solid-js";

export default function Skyway() {
  const [log, setLog] = createSignal("");
  let audioRef: HTMLAudioElement | undefined;
  let divRef: HTMLDivElement | undefined;
  const viewer = new SkywayViewer();
  const master = new SkywayMaster();

  async function masterInit() {
    audio(master.ctx);
    await master.init();
    setLog(log() + "master initialized\n");
  }

  async function viewerInit() {
    audio(viewer.ctx);
    await viewer.init("viewer1", audioRef!);
    setLog(log() + "viewer initialized\n");
    viewer.dataFrom = data => {
      setLog(log() + `data from master: ${data}\n`);
    };
  }

  function sendDataFromViewer() {
    if (!viewer.dataTo) return;
    viewer.dataTo.write("hello viewer");
    setLog(log() + "data sent to viewer\n");

    // 🔧 音声再生を明示的に開始
    if (audioRef) {
      audioRef.volume = 1.0;
      // ユーザーのクリック操作後なので、play()が成功するはず
      audioRef.play().catch(e => {
        console.error("Viewer audio play failed:", e);
        setLog(log() + "⚠️ 音声再生に失敗しました。もう一度クリックしてください\n");
      });
    }
  }

  master.onAdd = (name: string) => {
    setLog(log() + `connection complete: ${name}\n`);
    const destination = master.dests[name];
    const audioFrom: HTMLAudioElement = master.audioFrom[name];
    audioFrom.autoplay = true;
    audioFrom.volume = 0;
    audioFrom.controls = true;
    console.log("append audioFrom");
    divRef?.appendChild(audioFrom);
    const audioTo: HTMLAudioElement = master.audioTo[name];
    audioTo.autoplay = true;
    audioTo.volume = 0;
    audioTo.controls = true;
    console.log("append audioTo");
    divRef?.appendChild(audioTo);
    const sourceNode = master.sources[name];

    // 音声ルーティング: Viewer の入力 → Viewer の出力
    sourceNode.connect(destination);

    // 明示的に再生を開始
    audioTo.play().catch(e => {
      console.error("Audio autoplay failed:", e);
      setLog(log() + "⚠️ 音声再生に失敗しました。ブラウザでクリックしてください\n");
    });
  };

  function audio(ctx: AudioContext) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0.3;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    setTimeout(() => osc.stop(), 100);
  }

  function audioTest() {
    const osc = viewer.ctx.createOscillator();
    const gain = viewer.ctx.createGain();
    gain.gain.value = 0.1;
    osc.connect(gain);
    gain.connect(viewer.ctx.destination);
    osc.start();
    setTimeout(() => osc.stop(), 100);
  }

  return (
    <div class="bg-white p-2 h-screen">
      <div
        class="border w-48 p-2 m-2"
        onClick={masterInit}
      >
        Master
      </div>
      <div
        class="border w-48 p-2 m-2"
        onClick={viewerInit}
      >
        Viewer
      </div>
      <div
        class="border w-48 p-2 m-2"
        onClick={sendDataFromViewer}
      >
        sendDataFromViewer
      </div>
      <div
        class="border w-48 p-2 m-2"
        onClick={audioTest}
      >
        audioTest
      </div>
      {log()
        .split("\n")
        .map(line => (
          <div>{line}</div>
        ))}
      <audio
        ref={audioRef}
        autoplay
        controls
      ></audio>
      <div>other</div>
      <div ref={divRef} />
    </div>
  );
}
