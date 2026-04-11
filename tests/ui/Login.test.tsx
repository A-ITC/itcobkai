import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@solidjs/testing-library";
import Login from "../../src/pages/Login";

// window.location はテストごとに必要なセットが異なるため saveRestore で管理
const originalLocation = window.location;

afterEach(() => {
  cleanup(); // SolidJS のリアクティブルートを破棄し DOM をリセット
  Object.defineProperty(window, "location", { writable: true, value: originalLocation });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ──────────────────────────────────────────────────────────
// 初期ログイン画面（URL に code パラメータなし）
// ──────────────────────────────────────────────────────────
describe("Login / 初期画面（codeパラメータなし）", () => {
  it("タイトルと LOGIN 見出しが表示される", () => {
    render(() => <Login />);
    expect(screen.getByText("ITCOBKAI")).toBeInTheDocument();
    expect(screen.getByText("LOGIN")).toBeInTheDocument();
  });

  it("Discord SVG ボタンが表示される", () => {
    render(() => <Login />);
    // SVG ボタンは role="img" ではないため、存在確認は DOM クエリで行う
    const svgs = document.querySelectorAll("svg");
    expect(svgs.length).toBeGreaterThan(0);
  });

  it("「Discordで認証中...」テキストは表示されない", () => {
    render(() => <Login />);
    expect(screen.queryByText("Discordで認証中...")).not.toBeInTheDocument();
  });
});

// ──────────────────────────────────────────────────────────
// 認証コールバック画面（URL に code パラメータあり）
// ──────────────────────────────────────────────────────────
describe("Login / 認証処理中（codeパラメータあり）", () => {
  beforeEach(() => {
    // URL に code パラメータをセット
    Object.defineProperty(window, "location", {
      writable: true,
      value: {
        ...originalLocation,
        search: "?code=abc123",
        origin: "http://localhost",
        replace: vi.fn()
      }
    });
    // fetch の成功レスポンスをデフォルトでモック
    vi.spyOn(window, "fetch").mockResolvedValue({
      status: 200,
      json: async () => ({})
    } as Response);
    vi.spyOn(window.history, "replaceState").mockImplementation(() => {});
  });

  it("「Discordで認証中...」テキストが表示される", async () => {
    render(() => <Login />);
    // onMount で fetch が呼ばれた後も表示が残ることを確認
    expect(await screen.findByText("Discordで認証中...")).toBeInTheDocument();
  });

  it("「ログイン画面に戻る」リンクが表示される", async () => {
    render(() => <Login />);
    const link = await screen.findByRole("link", { name: "ログイン画面に戻る" });
    expect(link).toHaveAttribute("href", "/#/login");
  });

  it("認証 API を正しい引数で呼ぶ", async () => {
    const fetchSpy = vi.spyOn(window, "fetch").mockResolvedValue({
      status: 200,
      json: async () => ({})
    } as Response);

    render(() => <Login />);

    await vi.waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/discord",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"code":"abc123"')
        })
      );
    });
  });

  it("認証失敗時（401）にエラーアラートが表示される", async () => {
    vi.spyOn(window, "fetch").mockResolvedValue({
      status: 401,
      json: async () => ({ detail: "不正なコード" })
    } as Response);
    vi.stubGlobal("alert", vi.fn());
    const alertMock = window.alert as ReturnType<typeof vi.fn>;

    render(() => <Login />);

    await vi.waitFor(() => {
      expect(alertMock).toHaveBeenCalledWith(expect.stringContaining("認証に失敗しました"));
    });
  });

  it("予期しないエラー時（500）にアラートが表示される", async () => {
    vi.spyOn(window, "fetch").mockResolvedValue({
      status: 500,
      json: async () => ({})
    } as Response);
    vi.stubGlobal("alert", vi.fn());
    const alertMock = window.alert as ReturnType<typeof vi.fn>;

    render(() => <Login />);

    await vi.waitFor(() => {
      expect(alertMock).toHaveBeenCalledWith(expect.stringContaining("予期せぬエラー"));
    });
  });
});
