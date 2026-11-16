import { describe, expect, it } from "vitest";
import { METERS_PER_INCH, RefreshClock, applyUvBounds, fitUv, pixelPerUnit, uvBoundsOf } from "@spacexr/spatial-display-core";

describe("image fitting", () => {
  it("stretches by default, whatever the proportions", () => {
    expect(fitUv(16 / 9, 1, "stretch")).toEqual({ uScale: 1, vScale: 1, uOffset: 0, vOffset: 0 });
  });

  it("covers a surface by cropping the image where it is in excess", () => {
    // An image twice as wide as the surface: its central half shows.
    expect(fitUv(2, 1, "cover")).toEqual({ uScale: 0.5, vScale: 1, uOffset: 0.25, vOffset: 0 });
    // An image twice as tall.
    expect(fitUv(1, 2, "cover")).toEqual({ uScale: 1, vScale: 0.5, uOffset: 0, vOffset: 0.25 });
  });

  it("contains an image by leaving bands, where the coordinates leave [0, 1]", () => {
    expect(fitUv(2, 1, "contain")).toEqual({ uScale: 1, vScale: 2, uOffset: 0, vOffset: -0.5 });
    expect(fitUv(1, 2, "contain")).toEqual({ uScale: 2, vScale: 1, uOffset: -0.5, vOffset: 0 });
  });

  it("leaves the image as it is when the proportions match or are unknown", () => {
    const identity = { uScale: 1, vScale: 1, uOffset: 0, vOffset: 0 };
    expect(fitUv(1.5, 1.5, "cover")).toEqual(identity);
    expect(fitUv(0, 1, "cover")).toEqual(identity);
    expect(fitUv(1, Number.NaN, "contain")).toEqual(identity);
  });

  it("maps the image onto the part of the texture space a mesh uses", () => {
    const bounds = uvBoundsOf([0.5, 0.25, 1, 0.25, 1, 0.75, 0.5, 0.75]);
    expect(bounds).toEqual({ minU: 0.5, minV: 0.25, maxU: 1, maxV: 0.75 });
    const t = applyUvBounds(fitUv(1, 1, "stretch"), bounds);
    // The corners of the rectangle the mesh uses get the corners of the image.
    expect([0.5 * t.uScale + t.uOffset, 0.25 * t.vScale + t.vOffset]).toEqual([0, 0]);
    expect([1 * t.uScale + t.uOffset, 0.75 * t.vScale + t.vOffset]).toEqual([1, 1]);
    expect(uvBoundsOf(null)).toEqual({ minU: 0, minV: 0, maxU: 1, maxV: 1 });
  });

  it("gives the density of an image on a rectangle", () => {
    const density = pixelPerUnit({ width: 1280, height: 720 }, { width: 1.6, height: 0.9 });
    expect(density.x).toBeCloseTo(800);
    expect(density.y).toBeCloseTo(800);
    expect(density.x * METERS_PER_INCH).toBeCloseTo(20.32);
    expect(pixelPerUnit({ width: 1280, height: 720 }, { width: 0, height: 0 })).toEqual({ x: 0, y: 0 });
  });
});

describe("refresh clock", () => {
  it("is due at every frame by default", () => {
    const clock = new RefreshClock();
    expect([clock.tick(0.016), clock.tick(0.016), clock.tick(0.016)]).toEqual([true, true, true]);
  });

  it("is due once, then after each invalidation, when manual", () => {
    const clock = new RefreshClock("manual");
    expect([clock.tick(0.016), clock.tick(0.016)]).toEqual([true, false]);
    clock.invalidate();
    expect([clock.tick(0.016), clock.tick(0.016)]).toEqual([true, false]);
  });

  it("holds a rate in images per second", () => {
    const clock = new RefreshClock({ hz: 10 });
    const due: boolean[] = [];
    // 60 frames of a 60 Hz loop: one second.
    for (let i = 0; i < 60; i++) due.push(clock.tick(1 / 60));
    expect(due[0]).toBe(true);
    const count = due.filter(Boolean).length;
    expect(count).toBeGreaterThanOrEqual(10);
    expect(count).toBeLessThanOrEqual(11);
  });

  it("does not pile images up after a stall", () => {
    const clock = new RefreshClock({ hz: 10 });
    clock.tick(0.016);
    expect(clock.tick(5)).toBe(true);
    expect(clock.tick(0.016)).toBe(false);
  });
});
