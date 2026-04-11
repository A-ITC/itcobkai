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
// 初期表示（name が空の初回ユーザー）
// ──────────────────────────────────────────────────────────
describe("Setup / 初期表示（初回ユーザー）", () => {
  beforeEach(async () => {
    mockFetchDefault();
    render(() => <Setup />);
    // フォームが表示されるまで待機
    await screen.findByText("登録する");
  });

  it("タイトルが表示される", () => {
    expect(screen.getByText("ITCOBKAI")).toBeInTheDocument();
  });

  it("「プロフィール設定」見出しが表示される", () => {
    expect(screen.getByText("プロフィール設定")).toBeInTheDocument();
  });

  it("「登録する」ボタンが表示される", () => {
    expect(screen.getByRole("button", { name: "登録する" })).toBeInTheDocument();
  });

  it("名前フィールドが表示される", () => {
    expect(screen.getByPlaceholderText("表示名を入力")).toBeInTheDocument();
  });

  it("何期生セレクトが表示される", () => {
    expect(screen.getByText("何期生")).toBeInTheDocument();
  });

  it("所属チェックボックスが表示される（DTM/CG/PROG/MV/3DCG）", () => {
    expect(screen.getByText("DTM")).toBeInTheDocument();
    expect(screen.getByText("CG")).toBeInTheDocument();
    expect(screen.getByText("PROG")).toBeInTheDocument();
    expect(screen.getByText("MV")).toBeInTheDocument();
    expect(screen.getByText("3DCG")).toBeInTheDocument();
  });

  it("挨拶テキストエリアが表示される", () => {
    expect(screen.getByPlaceholderText("一言自己紹介など（省略可）")).toBeInTheDocument();
  });

  it("名前の文字数カウンターが表示される（0 / 40）", () => {
    expect(screen.getByText("0 / 40")).toBeInTheDocument();
  });

  it("挨拶の文字数カウンターが表示される（0 / 400）", () => {
    expect(screen.getByText("0 / 400")).toBeInTheDocument();
  });
});

// ──────────────────────────────────────────────────────────
// フォーム入力インタラクション
// ──────────────────────────────────────────────────────────
describe("Setup / フォーム入力", () => {
  beforeEach(async () => {
    mockFetchDefault();
    render(() => <Setup />);
    await screen.findByText("登録する");
  });

  it("名前を入力すると文字数カウンターが更新される", async () => {
    const user = userEvent.setup();
    const input = screen.getByPlaceholderText("表示名を入力");
    await user.type(input, "テスト太郎");
    expect(input).toHaveValue("テスト太郎");
    // 文字数は入力した文字数分
    const nameLength = "テスト太郎".length.toString();
    expect(screen.getByText(`${nameLength} / 40`)).toBeInTheDocument();
  });

  it("グループチェックボックスをクリックするとチェックが入る", async () => {
    const user = userEvent.setup();
    const dtmCheckbox = screen.getAllByRole("checkbox")[0]; // DTM
    await user.click(dtmCheckbox);
    expect(dtmCheckbox).toBeChecked();
  });

  it("同じグループを再クリックするとチェックが外れる", async () => {
    const user = userEvent.setup();
    const dtmCheckbox = screen.getAllByRole("checkbox")[0]; // DTM
    await user.click(dtmCheckbox);
    await user.click(dtmCheckbox);
    expect(dtmCheckbox).not.toBeChecked();
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
