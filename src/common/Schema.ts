export interface User {
  x: number;
  y: number;
  id: number;
  name: string;
  info: string;
  avatar: HTMLImageElement;
  statusColor: string;
  mute: boolean;
}

export interface Map {
  readonly noentry: boolean[][];
  readonly area: boolean[][];
  readonly topImage: HTMLImageElement;
  readonly bottomImage: HTMLImageElement;
  readonly width: number;
  readonly height: number;
}

export enum Action {
  ALERT,
  JOIN,
  MOVE,
  MUTE,
  LEAVE,
  USERS
}
