import { describe, expect, it, vi } from "vitest";
import RenderQueue from "../../src/map/RenderQueue";

describe("RenderQueue", () => {
  it("描画中の再要求を 1 回に集約する", async () => {
    let resolveRender: (() => void) | undefined;
    const render = vi.fn(() => {
      if (render.mock.calls.length > 1) {
        return Promise.resolve();
      }

      return new Promise<void>(resolve => {
        resolveRender = resolve;
      });
    });
    const queue = new RenderQueue(render);

    const first = queue.schedule();
    const second = queue.schedule();
    const third = queue.schedule();

    expect(render).toHaveBeenCalledTimes(1);
    resolveRender?.();
    await Promise.all([first, second, third]);

    expect(render).toHaveBeenCalledTimes(2);
  });
});
