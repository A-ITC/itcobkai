export interface User {
  x: number;
  y: number;
  name: string;
  info: string;
  avatar: string;
  status: string;
  mute: boolean;
  slide: string;
  readonly hash: string;
}

export interface UserRaw {
  readonly id: string;
  readonly name: string;
  readonly avatar: string;
  readonly guild: string[];
  readonly slide?: string;
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
}

export enum HostCommand {
  ALERT,
  MESSAGE,
  JOIN,
  MOVE,
  UPDATE,
  LEAVE,
  INIT,
  NEWMAP
}

export enum GuestCommand {
  MUTE,
  MOVE,
  UPDATE
}

export type HostMessage =
  | { command: HostCommand.ALERT; text: string; reload?: boolean }
  | { command: HostCommand.MESSAGE; text: string }
  | { command: HostCommand.JOIN; user: User }
  | { command: HostCommand.MOVE; moves: Move[] }
  | { command: HostCommand.UPDATE; h: string; user: User }
  | { command: HostCommand.LEAVE; h: string }
  | { command: HostCommand.INIT; users: { [key: string]: User }; map: MapRaw }
  | { command: HostCommand.NEWMAP; moves: Move[]; map: MapRaw };

export type GuestMessage =
  | { command: GuestCommand.MUTE; mute: boolean }
  | { command: GuestCommand.MOVE; h: string; x: number; y: number }
  | { command: GuestCommand.UPDATE; h: string; user: User };
