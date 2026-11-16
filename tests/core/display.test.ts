import { describe, expect, it } from "vitest";
import {
  Display,
  PhysicalDisplay,
  RECT_FRAME_HALO_INDEX_COUNT,
  RECT_FRAME_HALO_VERTEX_COUNT,
  createRectFrameHalo,
  writeRectFrameHalo,
  type IPhysicalDisplayOptions,
} from "@spacexr/spatial-display-core";

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

describe("halo of a rectangular frame", () => {
  const options = { width: 2, height: 1, section: 0.1 };
  const halo = createRectFrameHalo(options);
  const at = (array: ArrayLike<number>, index: number): number => array[index] as number;

  it("is one ribbon along each side", () => {
    expect(RECT_FRAME_HALO_VERTEX_COUNT).toBe(16);
    expect(RECT_FRAME_HALO_INDEX_COUNT).toBe(24);
    expect(halo.positions).toHaveLength(16 * 3);
    expect(halo.axes).toHaveLength(16 * 3);
    expect(halo.offsets).toHaveLength(16 * 2);
    expect(halo.uvs).toHaveLength(16 * 2);
    expect(Math.max(...halo.indices)).toBe(15);
    for (let v = 0; v < 16; v++) {
      // The direction of the side, an end of it, and one edge of the ribbon or the other.
      expect(Math.hypot(at(halo.axes, v * 3), at(halo.axes, v * 3 + 1), at(halo.axes, v * 3 + 2))).toBe(1);
      expect([Math.abs(at(halo.offsets, v * 2)), Math.abs(at(halo.offsets, v * 2 + 1))]).toEqual([1, 1]);
    }
  });

  it("anchors every vertex on an end of the centre line of its side", () => {
    for (let v = 0; v < 16; v++) {
      expect(Math.abs(at(halo.positions, v * 3))).toBeCloseTo(1.05);
      expect(Math.abs(at(halo.positions, v * 3 + 1))).toBeCloseTo(0.55);
      expect(at(halo.positions, v * 3 + 2)).toBe(0);
    }
    for (let side = 0; side < 4; side++) {
      const first = side * 4;
      // The vertices at the end of a side stand its length away from those at its start, along its direction.
      const start = [at(halo.positions, first * 3), at(halo.positions, first * 3 + 1)];
      const end = [at(halo.positions, (first + 1) * 3), at(halo.positions, (first + 1) * 3 + 1)];
      const length = at(halo.uvs, first * 2 + 1);
      expect(length).toBeCloseTo(side % 2 === 0 ? 2.1 : 1.1);
      expect(at(end, 0) - at(start, 0)).toBeCloseTo(at(halo.axes, first * 3) * length);
      expect(at(end, 1) - at(start, 1)).toBeCloseTo(at(halo.axes, first * 3 + 1) * length);
      expect([at(halo.offsets, first * 2), at(halo.offsets, (first + 1) * 2)]).toEqual([-1, 1]);
    }
  });

  it("follows the frame when rewritten", () => {
    const positions = halo.positions.slice();
    const uvs = halo.uvs.slice();
    writeRectFrameHalo({ width: 4, height: 4, section: 0 }, positions, uvs);
    for (let v = 0; v < 16; v++) expect(Math.abs(at(positions, v * 3))).toBe(2);
    // A square frame: each side takes a quarter of the way around, and measures 4.
    expect([at(uvs, 0), at(uvs, 2)]).toEqual([0, 0.25]);
    expect(at(uvs, 1)).toBe(4);
  });
});
