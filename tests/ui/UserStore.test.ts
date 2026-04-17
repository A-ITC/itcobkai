import { describe, expect, it, vi } from "vitest";
import { Move, User } from "../../src/common/Schema";
import UserStore from "../../src/main/UserStore";

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

describe("UserStore", () => {
  it("replaceAll でスナップショットを辞書化して保持する", () => {
    const store = new UserStore();
    store.replaceAll([makeUser({ h: "a", name: "Alice" }), makeUser({ h: "b", name: "Bob" })]);

    expect(store.snapshot()).toEqual({
      a: makeUser({ h: "a", name: "Alice" }),
      b: makeUser({ h: "b", name: "Bob" })
    });
  });

  it("snapshot は外部から変更しても内部状態を汚さない", () => {
    const store = new UserStore();
    store.replaceAll([makeUser({ h: "a", name: "Alice", groups: ["dtm", "cg"] })]);

    const snapshot = store.snapshot();
    snapshot.a.name = "Changed";
    snapshot.a.groups.push("prog");

    expect(store.get("a")).toEqual(makeUser({ h: "a", name: "Alice", groups: ["dtm", "cg"] }));
  });

  it("applyMoves は既存ユーザーの座標だけ更新する", () => {
    const store = new UserStore();
    const moves: Move[] = [
      { h: "a", x: 2, y: 3 },
      { h: "missing", x: 9, y: 9 }
    ];
    store.replaceAll([makeUser({ h: "a", name: "Alice" })]);

    store.applyMoves(moves);

    expect(store.get("a")).toEqual(makeUser({ h: "a", name: "Alice", x: 2, y: 3 }));
    expect(store.get("missing")).toBeUndefined();
  });

  it("batch は複数更新を 1 回の通知にまとめる", async () => {
    const store = new UserStore();
    const listener = vi.fn();
    store.subscribe(listener);

    await store.batch(async () => {
      store.upsert(makeUser({ h: "a", name: "Alice" }));
      store.upsert(makeUser({ h: "b", name: "Bob" }));
      store.setMuted("b", true);
    });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenLastCalledWith({
      a: makeUser({ h: "a", name: "Alice" }),
      b: makeUser({ h: "b", name: "Bob", mute: true })
    });
  });
});
