import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { User } from "../../src/common/Schema";
import Viewer from "../../src/main/Main";

// ──────────────────────────────────────────────────────────
// モック定義
// vi.hoisted() を使って vi.mock の巻き上げより前に変数を初期化
// ──────────────────────────────────────────────────────────

const { mockRequest, mockManager } = vi.hoisted(() => {
  const mockManager = {
    init: vi.fn(),
    start: vi.fn().mockResolvedValue(undefined),
    end: vi.fn(),
    mute: vi.fn(),
    onKeyDown: vi.fn(),
    onResize: vi.fn(),
    // Viewer コンポーネントが render 時に上書きする
    onUpdate: undefined as ((users: { [key: string]: User }) => void) | undefined
  };
  const mockRequest = vi.fn();
  return { mockRequest, mockManager };
});

vi.mock("../../src/main/Manager", () => ({
  // 通常関数（arrow function 不可）を使い new Manager() が mockManager を返すようにする
  default: vi.fn().mockImplementation(function () {
    return mockManager;
  })
}));

// Common モジュールを丸ごとモック（livekit-client などの巨大な依存を回避）
vi.mock("../../src/common/Common", () => ({
  default: mockRequest,
  storage: { outer: 13, inner: 2 },
  beep: vi.fn(),
  ticker: { move: vi.fn() }
}));

// ──────────────────────────────────────────────────────────
// クリーンアップ
// ──────────────────────────────────────────────────────────
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  mockManager.onUpdate = undefined;
});

// ──────────────────────────────────────────────────────────
// テスト用ユーザーデータ
// ──────────────────────────────────────────────────────────
const makeUser = (overrides: Partial<User> & Pick<User, "h" | "name">): User => ({
  year: 2,
  groups: ["dtm"],
  avatar: "avatar.png",
  x: 0,
  y: 0,
  mute: false,
  ...overrides
});

// ──────────────────────────────────────────────────────────
// 初期状態（未接続）
// ──────────────────────────────────────────────────────────
describe("Viewer / 初期状態（未接続）", () => {
  beforeEach(() => {
    render(() => <Viewer />);
  });

  it("ヘッダーに「ITCOBKAI」が表示される", () => {
    expect(screen.getByText("ITCOBKAI")).toBeInTheDocument();
  });

  it("「接続」ボタンが表示される", () => {
    expect(screen.getByText("接続")).toBeInTheDocument();
  });

  it("「未接続」ステータスが表示される", () => {
    expect(screen.getByText("未接続")).toBeInTheDocument();
  });

  it("ユーザー数が「0人」と表示される", () => {
    expect(screen.getByText("0人")).toBeInTheDocument();
  });

  it("「退席」「消音」ボタンは表示されない", () => {
    expect(screen.queryByText("退席")).not.toBeInTheDocument();
    expect(screen.queryByText("消音")).not.toBeInTheDocument();
  });
});

// ──────────────────────────────────────────────────────────
// 接続フロー
// ──────────────────────────────────────────────────────────
describe("Viewer / 接続後", () => {
  beforeEach(async () => {
    mockRequest.mockResolvedValue({ h: "player-hash", token: "lk-token" });
    render(() => <Viewer />);

    const user = userEvent.setup();
    await user.click(screen.getByText("接続"));
    // 接続完了まで待機
    await screen.findByText("退席");
  });

  it("「退席」「消音」ボタンが表示される", () => {
    expect(screen.getByText("退席")).toBeInTheDocument();
    expect(screen.getByText("消音")).toBeInTheDocument();
  });

  it("「通話中」ステータスが表示される", () => {
    expect(screen.getByText("通話中")).toBeInTheDocument();
  });

  it("「接続」ボタンが非表示になる", () => {
    expect(screen.queryByText("接続")).not.toBeInTheDocument();
  });

  it("request が /init に POST される", () => {
    expect(mockRequest).toHaveBeenCalledWith("POST", "/init");
  });

  it("manager.init が取得したプレイヤーハッシュで呼ばれる", () => {
    expect(mockManager.init).toHaveBeenCalledWith("player-hash");
  });
});

// ──────────────────────────────────────────────────────────
// 退席フロー
// ──────────────────────────────────────────────────────────
describe("Viewer / 退席後", () => {
  it("「接続」ボタンに戻る", async () => {
    mockRequest.mockResolvedValue({ h: "player-hash", token: "lk-token" });
    render(() => <Viewer />);

    const user = userEvent.setup();
    await user.click(screen.getByText("接続"));
    await screen.findByText("退席");

    await user.click(screen.getByText("退席"));
    await screen.findByText("接続");

    expect(mockManager.end).toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────────────────
// 接続エラー
// ──────────────────────────────────────────────────────────
describe("Viewer / 接続失敗", () => {
  it("API がエラーを返した場合にアラートを表示し接続ボタンが残る", async () => {
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
});

// ──────────────────────────────────────────────────────────
// ユーザーリスト表示
// ──────────────────────────────────────────────────────────
describe("Viewer / ユーザーリスト", () => {
  const users: { [key: string]: User } = {
    u1: makeUser({ h: "u1", name: "田中太郎", groups: ["dtm", "cg"], mute: false }),
    u2: makeUser({ h: "u2", name: "山田花子", groups: ["prog"], mute: true })
  };

  beforeEach(() => {
    render(() => <Viewer />);
    // onUpdate は render 時に同期的にセットされる
    mockManager.onUpdate!(users);
  });

  it("ユーザー名が一覧に表示される", async () => {
    await screen.findByText("田中太郎");
    expect(screen.getByText("山田花子")).toBeInTheDocument();
  });

  it("グループ名がカンマ区切りで表示される", async () => {
    await screen.findByText("dtm, cg");
    expect(screen.getByText("prog")).toBeInTheDocument();
  });

  it("ユーザー数が「2人」と表示される", async () => {
    await screen.findByText("2人");
  });
});

// ──────────────────────────────────────────────────────────
// UserItem のミュート状態インジケーター
// ──────────────────────────────────────────────────────────
describe("Viewer / ミュートインジケーター", () => {
  it("非ミュートユーザーのドットが緑色", async () => {
    const users = { u1: makeUser({ h: "u1", name: "Alice", mute: false }) };
    render(() => <Viewer />);
    mockManager.onUpdate!(users);

    await screen.findByText("Alice");
    const dot = document.querySelector(".status-dot");
    expect(dot).toHaveClass("bg-green-500");
  });

  it("ミュートユーザーのドットが赤色", async () => {
    const users = { u1: makeUser({ h: "u1", name: "Bob", mute: true }) };
    render(() => <Viewer />);
    mockManager.onUpdate!(users);

    await screen.findByText("Bob");
    const dot = document.querySelector(".status-dot");
    expect(dot).toHaveClass("bg-red-500");
  });
});
