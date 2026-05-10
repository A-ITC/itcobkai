import { describe, expect, it, vi } from "vitest";
import { HostCommand, type HostMessage, type MapRaw, type User } from "../../src/common/Schema";
import HostMessageDispatcher from "../../src/main/HostMessageDispatcher";
import UserStore from "../../src/main/UserStore";

function makeUser(overrides: Partial<User> & Pick<User, "h" | "name">): User {
  return {
    year: 2,
    groups: ["dtm"],
    avatar: "avatar.png",
    x: 0,
    y: 0,
    mute: false,
    greeting: "",
    ...overrides
  };
}

function makeMap(): MapRaw {
  return {
    red: "11,11",
    black: "00,00",
    top: "top.png",
    bottom: "bottom.png",
    name: "map1"
  };
}

describe("HostMessageDispatcher", () => {
  it("self を含む MOVED を受けたら playerId 付きで再同期する", async () => {
    const userStore = new UserStore();
    userStore.replaceAll([
      makeUser({ h: "player", name: "Player", x: 1, y: 1 }),
      makeUser({ h: "other", name: "Other", x: 2, y: 2 })
    ]);

    const controller = {
      newMap: vi.fn().mockResolvedValue(undefined),
      setUsers: vi.fn(),
      jumpTo: vi.fn()
    };

    const dispatcher = new HostMessageDispatcher({
      controller,
      userStore,
      notifications: {
        alert: vi.fn(),
        joined: vi.fn(),
        left: vi.fn()
      },
      getPlayerId: () => "player",
      onUpdateMap: vi.fn()
    });

    const moved: HostMessage = {
      command: HostCommand.MOVED,
      moves: [
        { h: "player", x: 5, y: 6 },
        { h: "other", x: 7, y: 8 }
      ]
    };

    await dispatcher.handle({ command: HostCommand.NEWMAP, map: makeMap() });
    await dispatcher.handle(moved);

    expect(controller.setUsers).toHaveBeenLastCalledWith(
      expect.objectContaining({
        player: expect.objectContaining({ x: 5, y: 6 }),
        other: expect.objectContaining({ x: 7, y: 8 })
      }),
      "player"
    );
  });
});
