export interface User {
  h: string;
  name: string;
  year: number;
  groups: string[];
  avatar: string;
  x: number;
  y: number;
  mute?: boolean;
}

export interface Move {
  h: string;
  x: number;
  y: number;
}

export interface Map {
  readonly noentry: boolean[][];
  readonly area: boolean[][];
  readonly topImage: HTMLImageElement;
  readonly bottomImage: HTMLImageElement;
  readonly width: number;
  readonly height: number;
}

export interface MapRaw {
  readonly red: string;
  readonly black: string;
  readonly top: string;
  readonly bottom: string;
  readonly name?: string;
  readonly width?: number;
  readonly height?: number;
}

export enum HostCommand {
  ALERT = "ALERT",
  MESSAGE = "MESSAGE",
  JOINED = "JOINED",
  MOVED = "MOVED",
  UPDATED = "UPDATED",
  LEFT = "LEFT",
  MUTED = "MUTED",
  INIT = "INIT",
  NEWMAP = "NEWMAP"
}

export enum GuestCommand {
  MUTE = "mute",
  MOVE = "move",
  UPDATE = "update"
}

export type HostMessage =
  | { command: HostCommand.ALERT; text: string; reload?: boolean }
  | { command: HostCommand.MESSAGE; text: string }
  | { command: HostCommand.JOINED; user: User }
  | { command: HostCommand.MOVED; moves: Move[] }
  | { command: HostCommand.UPDATED; user: User }
  | { command: HostCommand.LEFT; h: string }
  | { command: HostCommand.MUTED; h: string; mute: boolean }
  | { command: HostCommand.INIT; users: User[]; map: MapRaw }
  | { command: HostCommand.NEWMAP; map: MapRaw };

export type GuestMessage =
  | { command: GuestCommand.MUTE; mute: boolean }
  | { command: GuestCommand.MOVE; x: number; y: number }
  | { command: GuestCommand.UPDATE; user: User };
