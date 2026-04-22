import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GuestCommand, User } from "../../src/common/Schema";

const {
  mockController,
  mockControllerConstructor,
  mockRtcSession,
  mockRtcSessionConstructor,
  mockUserStore,
  mockUserStoreConstructor,
  mockDispatcher,
  mockDispatcherConstructor
} = vi.hoisted(() => {
  const mockController = {
    init: vi.fn(),
    destroy: vi.fn(),
    refresh: vi.fn(),
    onResize: vi.fn(),
    moveBy: vi.fn(),
    setUsers: vi.fn(),
    jumpTo: vi.fn(),
    newMap: vi.fn().mockResolvedValue(undefined)
  };
  const mockRtcSession = {
    onHostMessage: undefined as ((data: unknown) => Promise<void>) | undefined,
    onDisconnect: undefined as (() => void) | undefined,
    connect: vi.fn().mockResolvedValue(undefined),
    send: vi.fn(),
    setMuted: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined)
  };
  const mockUserStore = {
    subscribe: vi.fn(),
    get: vi.fn(),
    has: vi.fn(),
    upsert: vi.fn(),
    setMuted: vi.fn(),
    setVolume: vi.fn(),
    snapshot: vi.fn(() => ({}))
  };
  const mockDispatcher = {
    handle: vi.fn().mockResolvedValue(undefined)
  };
  return {
    mockController,
    mockControllerConstructor: vi.fn(function MockController() {
      return mockController;
    }),
    mockRtcSession,
    mockRtcSessionConstructor: vi.fn(function MockRtcSession() {
      return mockRtcSession;
    }),
    mockUserStore,
    mockUserStoreConstructor: vi.fn(function MockUserStore() {
      return mockUserStore;
    }),
    mockDispatcher,
    mockDispatcherConstructor: vi.fn(function MockDispatcher() {
      return mockDispatcher;
    })
  };
});

vi.mock("../../src/map/Controller", () => ({
  default: mockControllerConstructor
}));

vi.mock("../../src/main/RtcSession", () => ({
  default: mockRtcSessionConstructor
}));

vi.mock("../../src/main/UserStore", () => ({
  default: mockUserStoreConstructor
}));

vi.mock("../../src/main/HostMessageDispatcher", () => ({
  default: mockDispatcherConstructor
}));

import Manager from "../../src/main/Manager";

function makeUser(overrides: Partial<User> & Pick<User, "h" | "name">): User {
  return {
    year: 2,
    groups: ["dtm"],
    avatar: "avatar.png",
    x: 0,
    y: 0,
    mute: false,
    ...overrides
  };
}

describe("Manager", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockUserStore.subscribe.mockReturnValue(() => undefined);
    mockUserStore.get.mockReturnValue(makeUser({ h: "player-hash", name: "Player" }));
    mockUserStore.has.mockReturnValue(true);
    mockUserStore.setMuted.mockReturnValue(true);
    mockUserStore.setVolume.mockReturnValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("rapid volume updates are coalesced into one VOLUME message", () => {
    const manager = new Manager();
    manager.init("player-hash");

    manager.setUserVolume("near", 70);
    manager.setUserVolume("near", 42);
    manager.setUserVolume("near", 25);

    expect(mockUserStore.setVolume).toHaveBeenCalledTimes(3);
    expect(mockRtcSession.send).not.toHaveBeenCalled();

    vi.advanceTimersByTime(120);

    expect(mockRtcSession.send).toHaveBeenCalledTimes(1);
    expect(mockRtcSession.send).toHaveBeenCalledWith({
      command: GuestCommand.VOLUME,
      target_h: "near",
      volume: 25
    });
  });

  it("flushes pending volume updates before disconnecting", async () => {
    const manager = new Manager();
    manager.init("player-hash");

    manager.setUserVolume("near", 33);
    await manager.end();

    expect(mockRtcSession.send).toHaveBeenCalledWith({
      command: GuestCommand.VOLUME,
      target_h: "near",
      volume: 33
    });
    expect(mockController.destroy).toHaveBeenCalledTimes(1);
    expect(mockRtcSession.disconnect).toHaveBeenCalledTimes(1);
  });
});
