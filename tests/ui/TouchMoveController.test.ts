import { beforeEach, describe, expect, it, vi } from "vitest";
import TouchMoveController from "../../src/map/TouchMoveController";

describe("TouchMoveController", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("ドラッグ方向を4方向に量子化してその都度移動する", () => {
    const move = vi.fn(() => true);
    const render = vi.fn();
    const controller = new TouchMoveController(move, render, 100, 12);

    controller.start(1, { x: 40, y: 40 });
    controller.update(1, { x: 72, y: 46 });
    controller.update(1, { x: 46, y: 78 });

    expect(move).toHaveBeenNthCalledWith(1, 1, 0);
    expect(move).toHaveBeenNthCalledWith(2, 0, 1);
  });

  it("ドラッグ開始時は描画だけで移動しない", () => {
    const move = vi.fn(() => true);
    const render = vi.fn();
    const controller = new TouchMoveController(move, render, 100, 12);

    controller.start(1, { x: 40, y: 40 });

    expect(move).not.toHaveBeenCalled();
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("deadzone 内では移動しない", () => {
    const move = vi.fn(() => true);
    const render = vi.fn();
    const controller = new TouchMoveController(move, render, 100, 18);

    controller.start(1, { x: 40, y: 40 });
    controller.update(1, { x: 50, y: 48 });

    expect(move).not.toHaveBeenCalled();
  });

  it("ドラッグ終了で描画を消す", () => {
    const move = vi.fn(() => true);
    const render = vi.fn();
    const controller = new TouchMoveController(move, render, 100, 12);

    controller.start(1, { x: 40, y: 40 });
    controller.end(1);

    expect(render).toHaveBeenCalledTimes(2);
  });

  it("drag の向きに応じて左右上下の最も近い方向へ動く", () => {
    const move = vi.fn(() => true);
    const render = vi.fn();
    const controller = new TouchMoveController(move, render, 100, 12);

    controller.start(1, { x: 40, y: 40 });
    controller.update(1, { x: 25, y: 43 });
    controller.update(1, { x: 45, y: 24 });
    controller.update(1, { x: 44, y: 58 });

    expect(move).toHaveBeenCalledTimes(3);
    expect(move).toHaveBeenNthCalledWith(1, -1, 0);
    expect(move).toHaveBeenNthCalledWith(2, 0, -1);
    expect(move).toHaveBeenNthCalledWith(3, 0, 1);
  });

  it("ドラッグ中は pointermove が止まっても同じ方向へ進み続ける", () => {
    const move = vi.fn(() => true);
    const render = vi.fn();
    const controller = new TouchMoveController(move, render, 100, 12);

    controller.start(1, { x: 40, y: 40 });
    controller.update(1, { x: 76, y: 42 });
    vi.advanceTimersByTime(250);

    expect(move).toHaveBeenCalledTimes(3);
    expect(move).toHaveBeenNthCalledWith(1, 1, 0);
    expect(move).toHaveBeenNthCalledWith(2, 1, 0);
    expect(move).toHaveBeenNthCalledWith(3, 1, 0);
  });

  it("ニュートラル時は interval が move を送らない", () => {
    const move = vi.fn(() => true);
    const render = vi.fn();
    const controller = new TouchMoveController(move, render, 100, 18);

    controller.start(1, { x: 40, y: 40 });
    vi.advanceTimersByTime(300);

    expect(move).not.toHaveBeenCalled();
  });

  it("active 時だけオーバーレイを描画する", () => {
    const move = vi.fn(() => true);
    const render = vi.fn();
    const controller = new TouchMoveController(move, render, 100, 12, 20);
    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      lineWidth: 0,
      fillStyle: "",
      strokeStyle: ""
    } as unknown as CanvasRenderingContext2D;

    controller.draw(ctx);
    expect(ctx.arc).not.toHaveBeenCalled();

    controller.start(1, { x: 50, y: 50 });
    controller.update(1, { x: 84, y: 52 });
    controller.draw(ctx);

    expect(ctx.arc).toHaveBeenCalledTimes(2);
    expect(ctx.fill).toHaveBeenCalledTimes(1);
    expect(ctx.stroke).toHaveBeenCalledTimes(1);
    expect(ctx.arc).toHaveBeenNthCalledWith(1, 50, 50, 36, 0, Math.PI * 2);
    const arcMock = ctx.arc as unknown as ReturnType<typeof vi.fn>;
    const knobCall = arcMock.mock.calls[1];
    expect(knobCall[0]).toBeCloseTo(70.96, 2);
    expect(knobCall[1]).toBeCloseTo(51.23, 2);
    expect(knobCall[2]).toBe(12);
    expect(knobCall[3]).toBe(0);
    expect(knobCall[4]).toBe(Math.PI * 2);
  });
});
