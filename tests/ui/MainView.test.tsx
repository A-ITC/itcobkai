import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { User } from "../../src/common/Schema";
import MainView from "../../src/main/MainView";

vi.mock("../../src/common/Common", () => ({
  default: vi.fn(),
  IMAGE_URL: "/dist/images",
  storage: { outer: 13, inner: 2 },
  beep: vi.fn(),
  ticker: { move: vi.fn() },
  createFallbackImage: vi.fn().mockReturnValue("data:fallback")
}));

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

function renderMainView(overrides: Partial<Parameters<typeof MainView>[0]> = {}) {
  const props = {
    users: {},
    connected: false,
    playerId: "",
    area: [],
    tab: "map" as const,
    canvasSize: 320,
    onTabChange: vi.fn(),
    connectButton: vi.fn().mockResolvedValue(undefined),
    leaveButton: vi.fn().mockResolvedValue(undefined),
    muteButton: vi.fn(),
    onCanvasKeyDown: vi.fn(),
    setCanvasRef: vi.fn(),
    setAudioRef: vi.fn(),
    ...overrides
  };

  render(() => <MainView {...props} />);
  return props;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("MainView", () => {
  it("未接続状態の表示を描画する", () => {
    renderMainView();

    expect(screen.getByText("ITCOBKAI")).toBeInTheDocument();
    expect(screen.getByText("接続")).toBeInTheDocument();
    expect(screen.getByText("未接続")).toBeInTheDocument();
    expect(screen.getByText("0人")).toBeInTheDocument();
    expect(screen.queryByText("退席")).not.toBeInTheDocument();
    expect(screen.queryByText("消音")).not.toBeInTheDocument();
  });

  it("接続済み状態では退席と消音を表示する", () => {
    renderMainView({ connected: true });

    expect(screen.getByText("退席")).toBeInTheDocument();
    expect(screen.getByText("消音")).toBeInTheDocument();
    expect(screen.getByText("通話中")).toBeInTheDocument();
    expect(screen.queryByText("接続")).not.toBeInTheDocument();
  });

  it("ユーザー一覧とグループ名を表示する", async () => {
    renderMainView({
      users: {
        u1: makeUser({ h: "u1", name: "田中太郎", groups: ["dtm", "cg"], mute: false }),
        u2: makeUser({ h: "u2", name: "山田花子", groups: ["prog"], mute: true })
      }
    });

    await screen.findByText("田中太郎");
    expect(screen.getByText("山田花子")).toBeInTheDocument();
    expect(screen.getByText("dtm, cg")).toBeInTheDocument();
    expect(screen.getByText("prog")).toBeInTheDocument();
    expect(screen.getByText("2人")).toBeInTheDocument();
  });

  it("ミュート状態に応じてインジケーターの色を切り替える", async () => {
    renderMainView({
      users: {
        u1: makeUser({ h: "u1", name: "Alice", mute: false }),
        u2: makeUser({ h: "u2", name: "Bob", mute: true })
      }
    });

    await screen.findByText("Alice");
    const dots = Array.from(document.querySelectorAll(".status-dot"));

    expect(dots[0]).toHaveClass("bg-green-500");
    expect(dots[1]).toHaveClass("bg-red-500");
  });

  it("接続ボタンの押下を props に委譲する", async () => {
    const props = renderMainView();
    const user = userEvent.setup();

    await user.click(screen.getByText("接続"));

    expect(props.connectButton).toHaveBeenCalledTimes(1);
  });
});
