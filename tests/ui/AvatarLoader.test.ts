import { afterEach, describe, expect, it, vi } from "vitest";
import { User } from "../../src/common/Schema";

const { loadImage } = vi.hoisted(() => ({
  loadImage: vi.fn((src: string, image: HTMLImageElement) => {
    image.src = src || "data:fallback";
    return Promise.resolve(image);
  })
}));

vi.mock("../../src/common/Common", () => ({
  IMAGE_URL: "/dist/images",
  loadImage,
  createFallbackImage: vi.fn().mockReturnValue("data:fallback")
}));

import AvatarLoader from "../../src/main/AvatarLoader";

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

describe("AvatarLoader", () => {
  it("同じアバターは重複ロードしない", async () => {
    const loader = new AvatarLoader();
    const user = makeUser({ h: "u1", name: "Alice", avatar: "avatar.png" });

    await loader.preload([user, user]);
    await loader.preload([user]);

    expect(loadImage).toHaveBeenCalledTimes(1);
    expect(loader.get(user)?.src).toContain("/dist/images/avatar.png");
  });

  it("アバター変更時は再ロードする", async () => {
    const loader = new AvatarLoader();

    await loader.preload([makeUser({ h: "u1", name: "Alice", avatar: "avatar-a.png" })]);
    await loader.preload([makeUser({ h: "u1", name: "Alice", avatar: "avatar-b.png" })]);

    expect(loadImage).toHaveBeenCalledTimes(2);
  });
});
