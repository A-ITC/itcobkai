import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { User } from "../../src/common/Schema";
import Viewer from "../../src/main/Main";

// ──────────────────────────────────────────────────────────
// モック定義
// vi.hoisted() を使って vi.mock の巻き上げより前に変数を初期化
// ──────────────────────────────────────────────────────────

const { mockRequest, mockManager, mockCreateManager } = vi.hoisted(() => {
  const mockManager = {
    init: vi.fn(),
    start: vi.fn().mockResolvedValue(undefined),
    end: vi.fn().mockResolvedValue(undefined),
    mute: vi.fn(),
    onKeyDown: vi.fn(),
    onResize: vi.fn(),
    onUpdate: undefined as ((users: { [key: string]: User }) => void) | undefined,
    onUpdateMap: undefined as ((area: boolean[][]) => void) | undefined,
    onDisconnect: undefined as (() => void) | undefined
  };
  const mockRequest = vi.fn();
  const mockCreateManager = vi.fn(() => mockManager);
  return { mockRequest, mockManager, mockCreateManager };
});

vi.mock("../../src/main/createManager", () => ({
  createManager: mockCreateManager
}));

// Common モジュールを丸ごとモック（livekit-client などの巨大な依存を回避）
vi.mock("../../src/common/Common", () => ({
  default: mockRequest,
  IMAGE_URL: "/dist/images",
  storage: { outer: 13, inner: 2 },
  beep: vi.fn(),
  ticker: { move: vi.fn() },
  createFallbackImage: vi.fn().mockReturnValue("data:fallback")
}));

// ──────────────────────────────────────────────────────────
// クリーンアップ
// ──────────────────────────────────────────────────────────
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  mockManager.onUpdate = undefined;
  mockManager.onUpdateMap = undefined;
  mockManager.onDisconnect = undefined;
});

describe("Viewer / Container wiring", () => {
  beforeEach(() => {
    mockRequest.mockResolvedValue({ h: "player-hash", token: "lk-token" });
  });

  it("/init 成功時に manager を初期化して接続済み状態へ遷移する", async () => {
    render(() => <Viewer />);

    const user = userEvent.setup();
    await user.click(screen.getByText("接続"));

    await screen.findByText("退席");
    expect(mockRequest).toHaveBeenCalledWith("POST", "/init");
    expect(mockCreateManager).toHaveBeenCalledTimes(1);
    expect(mockManager.init).toHaveBeenCalledWith("player-hash");
    expect(mockManager.start).toHaveBeenCalledTimes(1);
  });

  it("退席時に manager.end を呼んで未接続に戻す", async () => {
    render(() => <Viewer />);

    const user = userEvent.setup();
    await user.click(screen.getByText("接続"));
    await screen.findByText("退席");
    await user.click(screen.getByText("退席"));

    await screen.findByText("接続");
    expect(mockManager.end).toHaveBeenCalled();
  });

  it("接続失敗時はアラートを表示して接続状態を維持しない", async () => {
    mockRequest.mockResolvedValue({ error: "session expired" });
    vi.stubGlobal("alert", vi.fn());
    const alertMock = window.alert as ReturnType<typeof vi.fn>;

    render(() => <Viewer />);
    const user = userEvent.setup();
    await user.click(screen.getByText("接続"));

    await vi.waitFor(() => {
      expect(alertMock).toHaveBeenCalledWith(expect.stringContaining("接続に失敗しました"));
    });
    expect(screen.getByText("接続")).toBeInTheDocument();
  });

  it("manager.onDisconnect で接続状態を解除する", async () => {
    render(() => <Viewer />);

    const user = userEvent.setup();
    await user.click(screen.getByText("接続"));
    await screen.findByText("退席");
    mockManager.onDisconnect?.();

    await screen.findByText("接続");
  });

  it("manager.onUpdate からの状態を View に橋渡しする", async () => {
    render(() => <Viewer />);

    mockManager.onUpdate?.({
      u1: {
        h: "u1",
        name: "Alice",
        year: 2,
        groups: ["dtm"],
        avatar: "avatar.png",
        x: 0,
        y: 0,
        mute: false
      }
    });

    await screen.findByText("Alice");
  });
});
