import { describe, expect, it, vi } from "vitest";
import { HostCommand, HostMessage, MapRaw, User } from "../../src/common/Schema";
import HostMessageDispatcher from "../../src/main/HostMessageDispatcher";
import UserStore from "../../src/main/UserStore";
import { NotificationPort } from "../../src/main/notifications";

function makeUser(overrides: Partial<User> & Pick<User, "h" | "name">): User {
  return {
    h: overrides.h,
    name: overrides.name,
    year: 2,
    groups: ["dtm"],
    avatar: "avatar.png",
    x: 0,
    y: 0,
    mute: false,
    ...overrides
  };
}

function makeMap(red: string = "10,01"): MapRaw {
  return {
    red,
    black: "00,00",
    top: "top.png",
    bottom: "bottom.png"
  };
}

function createDispatcher() {
  const userStore = new UserStore();
  const controller = {
    newMap: vi.fn().mockResolvedValue(undefined),
    setUsers: vi.fn(),
    jumpTo: vi.fn()
  };
  const notifications: NotificationPort = {
    alert: vi.fn(),
    joined: vi.fn(),
    left: vi.fn()
  };
  const fetchUser = vi.fn();
  const onUpdateMap = vi.fn();

  const dispatcher = new HostMessageDispatcher({
    controller,
    userStore,
    notifications,
    fetchUser,
    getPlayerId: () => "player",
    onUpdateMap
  });

  return { dispatcher, userStore, controller, notifications, fetchUser, onUpdateMap };
}

describe("HostMessageDispatcher", () => {
  it("JOINED で UserStore と通知を更新する", async () => {
    const { dispatcher, userStore, controller, notifications } = createDispatcher();
    const message: HostMessage = { command: HostCommand.JOINED, user: makeUser({ h: "joined", name: "Alice" }) };

    await dispatcher.handle(message);

    expect(userStore.get("joined")).toEqual(makeUser({ h: "joined", name: "Alice" }));
    expect(controller.setUsers).toHaveBeenCalledWith({ joined: makeUser({ h: "joined", name: "Alice" }) }, undefined);
    expect(notifications.joined).toHaveBeenCalledWith("Alice");
  });

  it("MOVED で未知ユーザーを取得して座標を反映し、自分の位置なら jumpTo する", async () => {
    const { dispatcher, userStore, controller, fetchUser } = createDispatcher();
    fetchUser.mockResolvedValue(makeUser({ h: "player", name: "Player", x: 4, y: 4 }));

    await dispatcher.handle({
      command: HostCommand.MOVED,
      moves: [{ h: "player", x: 5, y: 6 }]
    });

    expect(fetchUser).toHaveBeenCalledWith("player");
    expect(userStore.get("player")).toEqual(makeUser({ h: "player", name: "Player", x: 5, y: 6 }));
    expect(controller.jumpTo).toHaveBeenCalledWith(5, 6);
  });

  it("INIT で全ユーザーとマップを同期する", async () => {
    const { dispatcher, userStore, controller, onUpdateMap } = createDispatcher();
    const map = makeMap("10,01");

    await dispatcher.handle({
      command: HostCommand.INIT,
      users: [makeUser({ h: "player", name: "Player" })],
      map
    });

    expect(userStore.snapshot()).toEqual({
      player: makeUser({ h: "player", name: "Player" })
    });
    expect(controller.newMap).toHaveBeenCalledWith(map);
    expect(controller.setUsers).toHaveBeenCalledWith({ player: makeUser({ h: "player", name: "Player" }) }, "player");
    expect(onUpdateMap).toHaveBeenCalledWith([
      [true, false],
      [false, true]
    ]);
  });

  it("ALERT で通知ポートへ委譲する", async () => {
    const { dispatcher, notifications } = createDispatcher();

    await dispatcher.handle({ command: HostCommand.ALERT, text: "reload", reload: true });

    expect(notifications.alert).toHaveBeenCalledWith("reload", true);
  });
});
