import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import Main from "../../src/pages/Main";
import { User } from "../../src/common/Schema";

const { mockRequest, mockManager, mockManagerConstructor, mockMatchMedia } = vi.hoisted(() => {
  const mockManager = {
    init: vi.fn(),
    start: vi.fn().mockResolvedValue(undefined),
    end: vi.fn().mockResolvedValue(undefined),
    mute: vi.fn(),
    moveBy: vi.fn(),
    onResize: vi.fn(),
    onUpdate: undefined as ((users: { [key: string]: User }) => void) | undefined,
    onUpdateMap: undefined as ((area: boolean[][]) => void) | undefined,
    onDisconnect: undefined as (() => void) | undefined
  };
  const mockRequest = vi.fn();
  const mockManagerConstructor = vi.fn(function MockManager() {
    return mockManager;
  });
  const mockMatchMedia = vi.fn().mockImplementation(() => ({
    matches: false,
    media: "(orientation: portrait)",
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  }));
  return { mockRequest, mockManager, mockManagerConstructor, mockMatchMedia };
});

vi.mock("../../src/main/Manager", () => ({
  default: mockManagerConstructor
}));

vi.mock("../../src/common/Common", () => ({
  default: mockRequest,
  storage: { outer: 13, inner: 2 },
  beep: vi.fn(),
  ticker: { move: vi.fn() }
}));

vi.mock("../../src/common/ImageLoader", () => ({
  loadImage: vi.fn((category: string, hash: string, image: HTMLImageElement) => {
    image.src = hash ? `/dist/image/${category}/${hash}` : "data:fallback";
    return Promise.resolve(image);
  })
}));

vi.mock("../../src/map/MapCreator", () => ({
  default: {
    updateStorage: vi.fn(() => 320)
  }
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  mockManager.onUpdate = undefined;
  mockManager.onUpdateMap = undefined;
  mockManager.onDisconnect = undefined;
});

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

describe("Main", () => {
  beforeEach(() => {
    mockRequest.mockResolvedValue({ h: "player-hash", token: "lk-token" });
    vi.stubGlobal("matchMedia", mockMatchMedia);
  });

  it("未接続状態の表示を描画する", () => {
    render(() => <Main />);

    expect(screen.getByText("ITCOBKAI")).toBeInTheDocument();
    expect(screen.getByText("接続")).toBeInTheDocument();
    expect(screen.getByText("未接続")).toBeInTheDocument();
    expect(screen.getByText("0人")).toBeInTheDocument();
    expect(screen.queryByText("退席")).not.toBeInTheDocument();
    expect(screen.queryByText("消音")).not.toBeInTheDocument();
    expect(mockManagerConstructor).toHaveBeenCalledTimes(1);
  });

  it("接続済み状態では退席と消音を表示する", async () => {
    render(() => <Main />);

    const user = userEvent.setup();
    await user.click(screen.getByText("接続"));

    await screen.findByText("退席");
    expect(screen.getByText("消音")).toBeInTheDocument();
    expect(screen.getByText("通話中")).toBeInTheDocument();
    expect(screen.queryByText("接続")).not.toBeInTheDocument();
  });

  it("ユーザー一覧とグループ名を表示する", async () => {
    render(() => <Main />);

    mockManager.onUpdate?.({
      u1: makeUser({ h: "u1", name: "田中太郎", groups: ["dtm", "cg"], mute: false }),
      u2: makeUser({ h: "u2", name: "山田花子", groups: ["prog"], mute: true })
    });

    await screen.findByText("田中太郎");
    expect(screen.getByText("山田花子")).toBeInTheDocument();
    expect(screen.getByText("dtm, cg")).toBeInTheDocument();
    expect(screen.getByText("prog")).toBeInTheDocument();
    expect(screen.getByText("2人")).toBeInTheDocument();
  });

  it("ミュート状態に応じてインジケーターの色を切り替える", async () => {
    render(() => <Main />);

    mockManager.onUpdate?.({
      u1: makeUser({ h: "u1", name: "Alice", mute: false }),
      u2: makeUser({ h: "u2", name: "Bob", mute: true })
    });

    await screen.findByText("Alice");
    const dots = Array.from(document.querySelectorAll(".status-dot"));

    expect(dots[0]).toHaveClass("bg-green-500");
    expect(dots[1]).toHaveClass("bg-red-500");
  });

  it("EDIT タブでプロフィールフォームを表示する", async () => {
    render(() => <Main />);

    const user = userEvent.setup();
    await user.click(screen.getByText("EDIT"));

    await screen.findByText("プロフィール設定");
    expect(screen.getByRole("button", { name: "登録する" })).toBeInTheDocument();
  });

  it("/init 成功時に manager を初期化して接続済み状態へ遷移する", async () => {
    render(() => <Main />);

    const user = userEvent.setup();
    await user.click(screen.getByText("接続"));

    await screen.findByText("退席");
    expect(mockRequest).toHaveBeenCalledWith("POST", "/init");
    expect(mockManager.init).toHaveBeenCalledWith("player-hash");
    expect(mockManager.start).toHaveBeenCalledTimes(1);
  });

  it("退席時に manager.end を呼んで未接続に戻す", async () => {
    vi.stubGlobal("location", { reload: vi.fn() });
    render(() => <Main />);

    const user = userEvent.setup();
    await user.click(screen.getByText("接続"));
    await screen.findByText("退席");
    await user.click(screen.getByText("退席"));

    await screen.findByText("接続");
    expect(mockManager.end).toHaveBeenCalled();
    expect(window.location.reload).toHaveBeenCalledTimes(1);
  });

  it("接続失敗時はアラートを表示して接続状態を維持しない", async () => {
    mockRequest.mockResolvedValue({ error: "session expired" });
    vi.stubGlobal("alert", vi.fn());
    const alertMock = window.alert as ReturnType<typeof vi.fn>;

    render(() => <Main />);
    const user = userEvent.setup();
    await user.click(screen.getByText("接続"));

    await vi.waitFor(() => {
      expect(alertMock).toHaveBeenCalledWith(expect.stringContaining("接続に失敗しました"));
    });
    expect(screen.getByText("接続")).toBeInTheDocument();
  });

  it("manager.onDisconnect で接続状態を解除する", async () => {
    render(() => <Main />);

    const user = userEvent.setup();
    await user.click(screen.getByText("接続"));
    await screen.findByText("退席");
    mockManager.onDisconnect?.();

    await screen.findByText("接続");
  });

  it("manager.onUpdate の新しいスナップショットでユーザー一覧を置き換える", async () => {
    render(() => <Main />);

    mockManager.onUpdate?.({
      u1: makeUser({ h: "u1", name: "Alice" })
    });
    await screen.findByText("Alice");

    mockManager.onUpdate?.({
      u2: makeUser({ h: "u2", name: "Bob", groups: ["cg"], x: 1, y: 1 })
    });

    await screen.findByText("Bob");
    expect(screen.queryByText("Alice")).not.toBeInTheDocument();
  });

  it("接続後に map と users の更新を受けると接続中とオンラインの表示が分かれる", async () => {
    render(() => <Main />);

    const user = userEvent.setup();
    await user.click(screen.getByText("接続"));
    await screen.findByText("退席");

    mockManager.onUpdateMap?.([[false, false, false, false, false, false]]);
    mockManager.onUpdate?.({
      "player-hash": makeUser({ h: "player-hash", name: "Player" }),
      near: makeUser({ h: "near", name: "Near User", groups: ["prog"], x: 1 }),
      far: makeUser({ h: "far", name: "Far User", groups: ["cg"], x: 5 })
    });

    await screen.findByText("Near User");
    expect(screen.getByText("接続中")).toBeInTheDocument();
    expect(screen.getByText("オンライン")).toBeInTheDocument();
    expect(screen.getByText("Far User")).toBeInTheDocument();
  });
});
