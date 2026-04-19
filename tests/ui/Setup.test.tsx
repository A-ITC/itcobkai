import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import Setup from "../../src/pages/Setup";

// @solidjs/router の useNavigate をモック
const mockNavigate = vi.fn();
vi.mock("@solidjs/router", () => ({
  useNavigate: () => mockNavigate
}));

const originalLocation = window.location;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  mockNavigate.mockReset();
  Object.defineProperty(window, "location", { writable: true, value: originalLocation });
});

// デフォルトの fetch モック: /api/token → OK, /api/users/@me → name が空（初回ユーザー）
function mockFetchDefault(overrides: { token?: object; me?: object } = {}) {
  const tokenBody = overrides.token ?? { token: "jwt-token-abc", ttl: 1800 };
  const meBody = overrides.me ?? { h: "abc123", name: "", year: -1, groups: [], avatar: "", x: 0, y: 0, greeting: "" };

  return vi.spyOn(window, "fetch").mockImplementation(async input => {
    const url = typeof input === "string" ? input : (input as Request).url;
    if (url === "/api/token") {
      return { status: 200, ok: true, json: async () => tokenBody } as Response;
    }
    if (url === "/api/users/@me") {
      return { status: 200, ok: true, json: async () => meBody } as Response;
    }
    return { status: 404, ok: false, json: async () => ({}) } as Response;
  });
}

// ──────────────────────────────────────────────────────────
// 未ログイン（/api/token が 401）
// ──────────────────────────────────────────────────────────
describe("Setup / 未ログイン", () => {
  it("token が 401 なら /login にリダイレクトする", async () => {
    vi.spyOn(window, "fetch").mockImplementation(async input => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url === "/api/token") {
        return { status: 401, ok: false, json: async () => ({ detail: "Unauthorized" }) } as Response;
      }
      return { status: 200, ok: true, json: async () => ({}) } as Response;
    });

    render(() => <Setup />);

    await vi.waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/login", { replace: true });
    });
  });

  it("/api/users/@me が 4xx なら /login にリダイレクトする", async () => {
    vi.spyOn(window, "fetch").mockImplementation(async input => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url === "/api/token") {
        return { status: 200, ok: true, json: async () => ({ token: "jwt", ttl: 1800 }) } as Response;
      }
      return { status: 404, ok: false, json: async () => ({}) } as Response;
    });

    render(() => <Setup />);

    await vi.waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/login", { replace: true });
    });
  });
});

// ──────────────────────────────────────────────────────────
// name が設定済み（再ログイン）
// ──────────────────────────────────────────────────────────
describe("Setup / name 設定済み", () => {
  it("name があれば / にリダイレクトする（フォームを表示しない）", async () => {
    mockFetchDefault({
      me: { h: "abc", name: "Alice", year: 3, groups: ["dtm"], avatar: "", x: 0, y: 0, greeting: "" }
    });

    render(() => <Setup />);

    await vi.waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/", { replace: true });
    });
    expect(screen.queryByText("登録する")).not.toBeInTheDocument();
  });
});

// ──────────────────────────────────────────────────────────
// 初回登録フロー
// ──────────────────────────────────────────────────────────
describe("Setup / 初回登録フロー", () => {
  it("初回ユーザーにはプロフィールフォームが表示され、入力できる", async () => {
    mockFetchDefault();
    render(() => <Setup />);

    await screen.findByRole("button", { name: "登録する" });

    expect(screen.getByText("ITCOBKAI")).toBeInTheDocument();
    expect(screen.getByText("プロフィール設定")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("表示名を入力")).toBeInTheDocument();
    expect(screen.getByText("何期生")).toBeInTheDocument();
    expect(screen.getByText("DTM")).toBeInTheDocument();
    expect(screen.getByText("3DCG")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("一言自己紹介など（省略可）")).toBeInTheDocument();

    const user = userEvent.setup();
    const nameInput = screen.getByPlaceholderText("表示名を入力");
    const greetingInput = screen.getByPlaceholderText("一言自己紹介など（省略可）");
    const dtmCheckbox = screen.getAllByRole("checkbox")[0];

    await user.type(nameInput, "テスト太郎");
    await user.click(dtmCheckbox);
    await user.type(greetingInput, "よろしくお願いします");

    expect(nameInput).toHaveValue("テスト太郎");
    expect(dtmCheckbox).toBeChecked();
    expect(greetingInput).toHaveValue("よろしくお願いします");
    expect(screen.getByText(`${"テスト太郎".length} / 40`)).toBeInTheDocument();
  });
});

// ──────────────────────────────────────────────────────────
// フォーム送信 — 成功
// ──────────────────────────────────────────────────────────
describe("Setup / フォーム送信成功", () => {
  it("POST が 200 なら / にナビゲートする", async () => {
    const fetchSpy = vi.spyOn(window, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url === "/api/token") {
        return { status: 200, ok: true, json: async () => ({ token: "jwt", ttl: 1800 }) } as Response;
      }
      if (url === "/api/users/@me" && (!init || (init as RequestInit).method !== "POST")) {
        return {
          status: 200,
          ok: true,
          json: async () => ({ h: "abc", name: "", year: -1, groups: [], avatar: "", x: 0, y: 0, greeting: "" })
        } as Response;
      }
      if (url === "/api/users/@me" && (init as RequestInit).method === "POST") {
        return {
          status: 200,
          ok: true,
          json: async () => ({
            h: "abc",
            name: "Alice",
            year: 3,
            groups: ["dtm"],
            avatar: "",
            x: 0,
            y: 0,
            greeting: ""
          })
        } as Response;
      }
      return { status: 404, ok: false, json: async () => ({}) } as Response;
    });

    render(() => <Setup />);
    await screen.findByText("登録する");

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("表示名を入力"), "Alice");
    await user.click(screen.getByRole("button", { name: "登録する" }));

    await vi.waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/", { replace: true });
    });

    // POST が正しいエンドポイントに送られたか確認
    const postCall = fetchSpy.mock.calls.find(
      ([url, init]) =>
        (typeof url === "string" ? url : (url as Request).url) === "/api/users/@me" &&
        (init as RequestInit)?.method === "POST"
    );
    expect(postCall).toBeDefined();
  });

  it("POST リクエストに name/year/groups/greeting が含まれる", async () => {
    const fetchSpy = vi.spyOn(window, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url === "/api/token")
        return { status: 200, ok: true, json: async () => ({ token: "jwt", ttl: 1800 }) } as Response;
      if (url === "/api/users/@me" && (!init || (init as RequestInit).method !== "POST")) {
        return {
          status: 200,
          ok: true,
          json: async () => ({ h: "abc", name: "", year: -1, groups: [], avatar: "", x: 0, y: 0, greeting: "" })
        } as Response;
      }
      return { status: 200, ok: true, json: async () => ({}) } as Response;
    });

    render(() => <Setup />);
    await screen.findByText("登録する");

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("表示名を入力"), "Bob");
    const dtmCheckbox = screen.getAllByRole("checkbox")[0];
    await user.click(dtmCheckbox);
    await user.type(screen.getByPlaceholderText("一言自己紹介など（省略可）"), "Hello!");
    await user.click(screen.getByRole("button", { name: "登録する" }));

    await vi.waitFor(() => {
      const postCall = fetchSpy.mock.calls.find(
        ([url, init]) =>
          (typeof url === "string" ? url : (url as Request).url) === "/api/users/@me" &&
          (init as RequestInit)?.method === "POST"
      );
      expect(postCall).toBeDefined();
      const body = JSON.parse((postCall![1] as RequestInit).body as string);
      expect(body.name).toBe("Bob");
      expect(body.groups).toContain("dtm");
      expect(body.greeting).toBe("Hello!");
    });
  });
});

// ──────────────────────────────────────────────────────────
// フォーム送信 — 失敗
// ──────────────────────────────────────────────────────────
describe("Setup / フォーム送信失敗", () => {
  it("POST が 422 なら alert を表示しページ遷移しない", async () => {
    vi.spyOn(window, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url === "/api/token")
        return { status: 200, ok: true, json: async () => ({ token: "jwt", ttl: 1800 }) } as Response;
      if (url === "/api/users/@me" && (!init || (init as RequestInit).method !== "POST")) {
        return {
          status: 200,
          ok: true,
          json: async () => ({ h: "abc", name: "", year: -1, groups: [], avatar: "", x: 0, y: 0, greeting: "" })
        } as Response;
      }
      return { status: 422, ok: false, json: async () => ({ detail: "バリデーションエラー" }) } as Response;
    });
    vi.stubGlobal("alert", vi.fn());
    const alertMock = window.alert as ReturnType<typeof vi.fn>;

    render(() => <Setup />);
    await screen.findByText("登録する");

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("表示名を入力"), "Alice");
    await user.click(screen.getByRole("button", { name: "登録する" }));

    await vi.waitFor(() => {
      expect(alertMock).toHaveBeenCalledWith("バリデーションエラー");
    });
    expect(mockNavigate).not.toHaveBeenCalledWith("/", expect.anything());
  });
});
