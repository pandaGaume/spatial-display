import { describe, expect, it } from "vitest";
import { Display, PhysicalDisplay, type IPhysicalDisplayOptions } from "@spacexr/spatial-display-core";

/** Records what a subclass is told. */
class Probe extends PhysicalDisplay {
  readonly calls: string[] = [];
  constructor(options: IPhysicalDisplayOptions) {
    super(options);
  }
  protected override onResized(): void {
    this.calls.push(`resized ${this.resolution.width}x${this.resolution.height}`);
  }
  protected override onDimensionChanged(): void {
    this.calls.push(`dimension ${this.width}x${this.height}`);
  }
}

describe("Display", () => {
  it("holds a resolution in whole pixels", () => {
    const display = new Display({ width: 1280.4, height: 719.6 });
    expect(display.resolution).toEqual({ width: 1280, height: 720 });
    expect(new Display().resolution).toEqual({ width: 0, height: 0 });
    display.resize(-5, Number.NaN);
    expect(display.resolution).toEqual({ width: 0, height: 0 });
  });

  it("tells a subclass when its image changed size, and only then", () => {
    const probe = new Probe({ width: 1, height: 1, resolution: { width: 100, height: 50 } });
    expect(probe.calls).toEqual([]);
    probe.resize(100, 50);
    probe.resize(100.2, 50);
    expect(probe.calls).toEqual([]);
    probe.resize(200, 100);
    expect(probe.calls).toEqual(["resized 200x100"]);
  });
});

describe("PhysicalDisplay", () => {
  it("is a display with a size in the world", () => {
    const display = new PhysicalDisplay({ width: 1.6, height: 0.9, resolution: { width: 1280, height: 720 } });
    expect(display).toBeInstanceOf(Display);
    expect(display.dimension).toEqual({ width: 1.6, height: 0.9 });
    expect(display.resolution).toEqual({ width: 1280, height: 720 });
    expect(display.aspect).toBeCloseTo(16 / 9);
    expect(display.pixelPerUnit.x).toBeCloseTo(800);
    expect(display.pixelPerUnit.y).toBeCloseTo(800);
    expect(display.dpi).toBeCloseTo(20.32);
  });

  it("changes its two sizes apart", () => {
    const probe = new Probe({ width: 2, height: 1, resolution: { width: 800, height: 400 } });
    probe.setDimension(4, 1);
    expect(probe.dimension).toEqual({ width: 4, height: 1 });
    expect(probe.resolution).toEqual({ width: 800, height: 400 });
    probe.resize(1600, 400);
    expect(probe.dimension).toEqual({ width: 4, height: 1 });
    probe.height = 2;
    probe.setDimension(4, 2);
    probe.setDimension(-1, 2);
    expect(probe.dimension).toEqual({ width: 0, height: 2 });
    expect(probe.calls).toEqual(["dimension 4x1", "resized 1600x400", "dimension 4x2", "dimension 0x2"]);
    expect(probe.aspect).toBe(0);
    expect(new PhysicalDisplay({ width: 1, height: 0 }).aspect).toBe(1);
  });

  it("keeps a density of pixels when asked, by steps and within a limit", () => {
    const probe = new Probe({ width: 2, height: 1, pixelsPerUnit: 203, maxResolution: 1000 });
    // Fitted at construction, without a call to the subclass.
    expect(probe.resolution).toEqual({ width: 408, height: 200 });
    expect(probe.calls).toEqual([]);

    probe.setDimension(1, 1);
    expect(probe.resolution).toEqual({ width: 200, height: 200 });
    expect(probe.calls).toEqual(["dimension 1x1", "resized 200x200"]);

    probe.pixelsPerUnit = 5000;
    expect(probe.resolution).toEqual({ width: 1000, height: 1000 });
    probe.maxResolution = 400;
    expect(probe.resolution).toEqual({ width: 400, height: 400 });

    probe.pixelsPerUnit = undefined;
    probe.setDimension(8, 8);
    expect(probe.resolution).toEqual({ width: 400, height: 400 });
  });
});
