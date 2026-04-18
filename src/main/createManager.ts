import { User } from "../common/Schema";
import Manager from "./Manager";

export interface ManagerPort {
  init(playerId: string): void;
  start(canvas: HTMLCanvasElement, audio: HTMLAudioElement, lkToken: string): Promise<void>;
  end(): Promise<void>;
  mute(): void;
  moveBy(dx: number, dy: number): void;
  onResize(): void;
  onUpdate: (users: { [key: string]: User }) => void;
  onUpdateMap: (area: boolean[][]) => void;
  onDisconnect: () => void;
}

export function createManager(): ManagerPort {
  return new Manager();
}
