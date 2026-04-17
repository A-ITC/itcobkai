import { HostCommand, HostMessage, MapRaw, User } from "../common/Schema";
import UserStore from "./UserStore";
import { NotificationPort } from "./notifications";

type ControllerPort = {
  newMap(map: MapRaw): Promise<void>;
  setUsers(users: Record<string, User>, playerId?: string): void;
  jumpTo(x: number, y: number): void;
};

type DispatcherDependencies = {
  controller: ControllerPort;
  userStore: UserStore;
  notifications: NotificationPort;
  fetchUser: (h: string) => Promise<User | undefined>;
  getPlayerId: () => string;
  onUpdateMap: (area: boolean[][]) => void;
};

function parseArea(map: MapRaw): boolean[][] {
  return map.red.split(",").map(row => row.split("").map(cell => cell === "1"));
}

export default class HostMessageDispatcher {
  private controller: ControllerPort;
  private userStore: UserStore;
  private notifications: NotificationPort;
  private fetchUser: (h: string) => Promise<User | undefined>;
  private getPlayerId: () => string;
  private onUpdateMap: (area: boolean[][]) => void;

  public constructor(deps: DispatcherDependencies) {
    this.controller = deps.controller;
    this.userStore = deps.userStore;
    this.notifications = deps.notifications;
    this.fetchUser = deps.fetchUser;
    this.getPlayerId = deps.getPlayerId;
    this.onUpdateMap = deps.onUpdateMap;
  }

  public async handle(data: HostMessage): Promise<void> {
    switch (data.command) {
      case HostCommand.ALERT:
        this.notifications.alert(data.text, data.reload);
        break;
      case HostCommand.JOINED:
        this.userStore.upsert(data.user);
        this.syncUsers();
        this.notifications.joined(data.user.name);
        break;
      case HostCommand.MOVED:
        await this.userStore.batch(async () => {
          for (const move of data.moves) {
            if (!this.userStore.has(move.h)) {
              const user = await this.fetchUser(move.h);
              if (user) {
                this.userStore.upsert(user);
              }
            }
            if (move.h === this.getPlayerId()) {
              this.controller.jumpTo(move.x, move.y);
            }
          }
          this.userStore.applyMoves(data.moves);
        });
        this.syncUsers();
        break;
      case HostCommand.UPDATED:
        this.userStore.upsert(data.user);
        this.syncUsers();
        break;
      case HostCommand.LEFT: {
        const leftName = this.userStore.remove(data.h)?.name ?? data.h;
        this.syncUsers();
        this.notifications.left(leftName);
        break;
      }
      case HostCommand.MUTED:
        await this.userStore.batch(async () => {
          if (!this.userStore.has(data.h)) {
            const user = await this.fetchUser(data.h);
            if (user) {
              this.userStore.upsert(user);
            }
          }
          this.userStore.setMuted(data.h, data.mute);
        });
        this.syncUsers();
        break;
      case HostCommand.INIT:
        this.userStore.replaceAll(data.users);
        await this.controller.newMap(data.map);
        this.syncUsers(true);
        this.onUpdateMap(parseArea(data.map));
        break;
      case HostCommand.NEWMAP:
        await this.controller.newMap(data.map);
        this.syncUsers(true);
        this.onUpdateMap(parseArea(data.map));
        break;
    }
  }

  private syncUsers(includePlayerId: boolean = false): void {
    this.controller.setUsers(this.userStore.snapshot(), includePlayerId ? this.getPlayerId() : undefined);
  }
}
