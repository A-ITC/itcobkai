import { afterEach, describe, expect, it, vi } from "vitest";
import { User } from "../../src/common/Schema";

const { loadImage } = vi.hoisted(() => ({
  loadImage: vi.fn((category: string, hash: string, image: HTMLImageElement) => {
    image.src = hash ? `/dist/image/${category}/${hash}` : "data:fallback";
    return Promise.resolve(image);
  })
}));

vi.mock("../../src/common/ImageLoader", () => ({
  loadImage
}));

import Controller from "../../src/map/Controller";

afterEach(() => {
  loadImage.mockClear();
});

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

describe("Controller avatar preload", () => {
  it("同じアバターは重複ロードしない", async () => {
    const controller = new Controller();
    const user = makeUser({ h: "u1", name: "Alice", avatar: "avatar.png" });

    await Promise.all([
      (controller as any).ensureAvatarLoaded(user),
      (controller as any).ensureAvatarLoaded(user),
      (controller as any).ensureAvatarLoaded(user)
    ]);

    expect(loadImage).toHaveBeenCalledTimes(1);
    expect(loadImage).toHaveBeenCalledWith("avatars", "avatar.png", expect.any(HTMLImageElement));
    expect((controller as any).avatars[user.h]?.src).toContain("/dist/image/avatars/avatar.png");
  });

  it("アバター変更時は再ロードする", async () => {
    const controller = new Controller();

    await (controller as any).ensureAvatarLoaded(makeUser({ h: "u1", name: "Alice", avatar: "avatar-a.png" }));
    await (controller as any).ensureAvatarLoaded(makeUser({ h: "u1", name: "Alice", avatar: "avatar-b.png" }));

    expect(loadImage).toHaveBeenCalledTimes(2);
  });
});
