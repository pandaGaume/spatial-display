import { describe, expect, it } from "vitest";
import { RECT_FRAME_INDEX_COUNT, RECT_FRAME_VERTEX_COUNT, createRectFrame, writeRectFrame, type IRectFrameGeometry } from "@spacexr/spatial-display-core";

const at = (array: ArrayLike<number>, index: number): number => array[index] as number;

/** Cross product of the first two edges of each triangle, against the normal of its first vertex. */
const windings = (g: IRectFrameGeometry): number[] => {
  const out: number[] = [];
  for (let i = 0; i < g.indices.length; i += 3) {
    const [a, b, c] = [at(g.indices, i) * 3, at(g.indices, i + 1) * 3, at(g.indices, i + 2) * 3];
    const e1 = [0, 1, 2].map((k) => at(g.positions, b + k) - at(g.positions, a + k));
    const e2 = [0, 1, 2].map((k) => at(g.positions, c + k) - at(g.positions, a + k));
    const cross = [at(e1, 1) * at(e2, 2) - at(e1, 2) * at(e2, 1), at(e1, 2) * at(e2, 0) - at(e1, 0) * at(e2, 2), at(e1, 0) * at(e2, 1) - at(e1, 1) * at(e2, 0)];
    out.push(at(cross, 0) * at(g.normals, a) + at(cross, 1) * at(g.normals, a + 1) + at(cross, 2) * at(g.normals, a + 2));
  }
  return out;
};

const extent = (positions: Float32Array, axis: number): [number, number] => {
  let min = Infinity;
  let max = -Infinity;
  for (let i = axis; i < positions.length; i += 3) {
    min = Math.min(min, at(positions, i));
    max = Math.max(max, at(positions, i));
  }
  return [min, max];
};

describe("rectangular frame", () => {
  const options = { width: 2, height: 1, section: 0.1 };
  const frame = createRectFrame(options);

  it("has four faces on each of its four sides", () => {
    expect(RECT_FRAME_VERTEX_COUNT).toBe(64);
    expect(RECT_FRAME_INDEX_COUNT).toBe(96);
    expect(frame.positions).toHaveLength(64 * 3);
    expect(frame.normals).toHaveLength(64 * 3);
    expect(frame.uvs).toHaveLength(64 * 2);
    expect(frame.indices).toHaveLength(96);
    expect(Math.max(...frame.indices)).toBe(63);
  });

  it("goes around the opening, a section wide and a section deep", () => {
    const [minX, maxX] = extent(frame.positions, 0);
    const [minY, maxY] = extent(frame.positions, 1);
    const [minZ, maxZ] = extent(frame.positions, 2);
    expect([minX, maxX]).toEqual([expect.closeTo(-1.1), expect.closeTo(1.1)]);
    expect([minY, maxY]).toEqual([expect.closeTo(-0.6), expect.closeTo(0.6)]);
    expect([minZ, maxZ]).toEqual([expect.closeTo(-0.05), expect.closeTo(0.05)]);
    // No vertex stands inside the opening.
    for (let i = 0; i < frame.positions.length; i += 3) {
      const inside = Math.abs(at(frame.positions, i)) < 1 - 1e-6 && Math.abs(at(frame.positions, i + 1)) < 0.5 - 1e-6;
      expect(inside).toBe(false);
    }
  });

  it("has flat, axis-aligned unit normals", () => {
    for (let i = 0; i < frame.normals.length; i += 3) {
      const n = [at(frame.normals, i), at(frame.normals, i + 1), at(frame.normals, i + 2)];
      expect(n.filter((c) => c !== 0)).toHaveLength(1);
      expect(Math.hypot(...n)).toBe(1);
    }
  });

  it("winds every triangle against its normal, as the vertex data of Babylon.js", () => {
    const w = windings(frame);
    expect(w).toHaveLength(32);
    for (const value of w) expect(value).toBeLessThan(0);
  });

  it("runs u once around the frame and v across each face", () => {
    for (let i = 0; i < frame.uvs.length; i += 2) {
      expect(at(frame.uvs, i)).toBeGreaterThanOrEqual(0);
      expect(at(frame.uvs, i)).toBeLessThanOrEqual(1);
      expect([0, 1]).toContain(at(frame.uvs, i + 1));
    }
    // The bottom side starts at 0, the left one ends at 1, and each side takes its share of the perimeter.
    const perimeter = 2 * (2.1 + 1.1);
    expect(at(frame.uvs, 0)).toBe(0);
    expect(at(frame.uvs, 2)).toBeCloseTo(2.1 / perimeter);
    expect(at(frame.uvs, 16 * 2 + 2)).toBeCloseTo((2.1 + 1.1) / perimeter);
    expect(at(frame.uvs, 48 * 2 + 2)).toBe(1);
  });

  it("is resized by rewriting positions only: the indices stay valid", () => {
    const resized: IRectFrameGeometry = { ...frame, positions: frame.positions.slice(), uvs: frame.uvs.slice() };
    writeRectFrame({ width: 0.4, height: 3, section: 0.3 }, resized.positions, resized.uvs);
    expect(extent(resized.positions, 0)).toEqual([expect.closeTo(-0.5), expect.closeTo(0.5)]);
    expect(extent(resized.positions, 1)).toEqual([expect.closeTo(-1.8), expect.closeTo(1.8)]);
    for (const value of windings(resized)) expect(value).toBeLessThan(0);
  });

  it("builds valid indices for a frame with no size yet", () => {
    const flat = createRectFrame({ width: 0, height: 0, section: 0 });
    expect(Array.from(flat.indices)).toEqual(Array.from(frame.indices));
  });
});
