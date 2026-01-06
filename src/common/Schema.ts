export interface User {
  x: number;
  y: number;
  id: string;
  name: string;
  info: string;
  avatar: HTMLImageElement;
  statusColor: string;
  mute: boolean;
}

export interface UserRaw {
  readonly id: string;
  readonly name: string;
  readonly avatar: string;
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

export enum Action {
  ALERT,
  JOIN,
  MOVE,
  MUTE,
  LEAVE,
  INIT
}
