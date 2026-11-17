import { describe, expect, it } from "vitest";
import {
  FRAME_HALO_VERTICES_PER_SIDE,
  FRAME_INDICES_PER_SIDE,
  FRAME_VERTICES_PER_SIDE,
  createCylinderOutlines,
  createFrame,
  createFrameHalo,
  createOutline,
  createRectOutline,
  frameSideCount,
  writeFrame,
  writeFrameHalo,
  writeRectOutline,
  type IFrameGeometry,
} from "@spacexr/spatial-display-core";

const at = (array: ArrayLike<number>, index: number): number => array[index] as number;

/** Cross product of the first two edges of each triangle, against the normal of its first vertex. */
const windings = (g: IFrameGeometry): number[] => {
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

describe("frame of a rectangle", () => {
  const outlines = [createRectOutline(2, 1)];
  const frame = createFrame(outlines, 0.1);

  it("has four faces on each of its four sides", () => {
    expect(frameSideCount(outlines)).toBe(4);
    expect(FRAME_VERTICES_PER_SIDE).toBe(16);
    expect(FRAME_INDICES_PER_SIDE).toBe(24);
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

  it("has flat, axis-aligned unit normals: the mitre of a corner does not lean them", () => {
    for (let i = 0; i < frame.normals.length; i += 3) {
      const n = [at(frame.normals, i), at(frame.normals, i + 1), at(frame.normals, i + 2)];
      expect(n.filter((c) => Math.abs(c) > 1e-6)).toHaveLength(1);
      expect(Math.hypot(...n)).toBeCloseTo(1);
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
    // The bottom side starts at 0, the left one ends at 1, and each side takes its share of the centre line.
    const perimeter = 2 * (2.1 + 1.1);
    expect(at(frame.uvs, 0)).toBe(0);
    expect(at(frame.uvs, 2 * 2)).toBeCloseTo(2.1 / perimeter);
    expect(at(frame.uvs, 16 * 2 + 2 * 2)).toBeCloseTo((2.1 + 1.1) / perimeter);
    expect(at(frame.uvs, 48 * 2 + 2 * 2)).toBeCloseTo(1);
  });

  it("is resized by rewriting its vertices: the indices stay valid", () => {
    const resized: IFrameGeometry = { ...frame, positions: frame.positions.slice(), normals: frame.normals.slice(), uvs: frame.uvs.slice() };
    const outline = createRectOutline(2, 1);
    writeRectOutline(outline, 0.4, 3);
    writeFrame([outline], 0.3, resized.positions, resized.normals, resized.uvs);
    expect(extent(resized.positions, 0)).toEqual([expect.closeTo(-0.5), expect.closeTo(0.5)]);
    expect(extent(resized.positions, 1)).toEqual([expect.closeTo(-1.8), expect.closeTo(1.8)]);
    for (const value of windings(resized)) expect(value).toBeLessThan(0);
  });

  it("builds valid indices for a frame with no size yet", () => {
    const flat = createFrame([createRectOutline(0, 0)], 0);
    expect(Array.from(flat.indices)).toEqual(Array.from(frame.indices));
  });
});

describe("halo of a rectangle", () => {
  const halo = createFrameHalo([createRectOutline(2, 1)], 0.1);

  it("is a ribbon along the centre line of each side", () => {
    expect(FRAME_HALO_VERTICES_PER_SIDE).toBe(4);
    expect(halo.positions).toHaveLength(16 * 3);
    expect(halo.indices).toHaveLength(24);
    // The bottom side: from the bottom left corner of the centre line to the bottom right one.
    expect(Array.from(halo.positions.slice(0, 6))).toEqual([expect.closeTo(-1.05), expect.closeTo(-0.55), 0, expect.closeTo(1.05), expect.closeTo(-0.55), 0]);
    expect(Array.from(halo.axes.slice(0, 3))).toEqual([expect.closeTo(1), expect.closeTo(0), 0]);
    // The start then the end of the side, on one edge of the ribbon then on the other.
    expect(Array.from(halo.offsets.slice(0, 8))).toEqual([-1, -1, 1, -1, 1, 1, -1, 1]);
    // u follows the frame, v is the length of the side.
    const perimeter = 2 * (2.1 + 1.1);
    expect(at(halo.uvs, 0)).toBe(0);
    expect(at(halo.uvs, 2)).toBeCloseTo(2.1 / perimeter);
    expect(at(halo.uvs, 1)).toBeCloseTo(2.1);
    expect(at(halo.uvs, 4 * 2 + 1)).toBeCloseTo(1.1);
  });

  it("anchors every vertex on an end of the centre line of its side", () => {
    for (let v = 0; v < 16; v++) {
      expect(Math.abs(at(halo.positions, v * 3))).toBeCloseTo(1.05);
      expect(Math.abs(at(halo.positions, v * 3 + 1))).toBeCloseTo(0.55);
      expect(at(halo.positions, v * 3 + 2)).toBe(0);
      // The direction of the side, an end of it, and one edge of the ribbon or the other.
      expect(Math.hypot(at(halo.axes, v * 3), at(halo.axes, v * 3 + 1), at(halo.axes, v * 3 + 2))).toBeCloseTo(1);
      expect([Math.abs(at(halo.offsets, v * 2)), Math.abs(at(halo.offsets, v * 2 + 1))]).toEqual([1, 1]);
    }
    expect(Math.max(...halo.indices)).toBe(15);
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

  it("ends its sides round on the corners: no joint is a mitre", () => {
    expect(halo.joints).toHaveLength(16 * 4);
    expect(Array.from(halo.joints).every((value) => value === 0)).toBe(true);
  });

  it("follows the section of the frame and the size of the opening", () => {
    const outline = createRectOutline(4, 2);
    writeFrameHalo([outline], 0, halo);
    expect(Array.from(halo.positions.slice(0, 6))).toEqual([-2, -1, 0, 2, -1, 0]);
    expect(at(halo.uvs, 1)).toBeCloseTo(4);
    // Each side takes its share of the way around: a third for the long ones.
    expect([at(halo.uvs, 0), at(halo.uvs, 2)]).toEqual([0, expect.closeTo(1 / 3)]);
  });
});

describe("frame of a curve", () => {
  // The two rims of a ring of 16 sides.
  const options = { radius: 1, height: 0.5, tessellation: 16 };
  const outlines = createCylinderOutlines(options);

  it("stands on the rims: above the top one, under the bottom one", () => {
    const frame = createFrame(outlines, 0.1);
    expect(frameSideCount(outlines)).toBe(32);
    expect(frame.positions).toHaveLength(32 * 16 * 3);
    expect(extent(frame.positions, 1)).toEqual([expect.closeTo(-0.35), expect.closeTo(0.35)]);
    // Half a section on each face of the wall.
    for (let i = 0; i < frame.positions.length; i += 3) {
      const radius = Math.hypot(at(frame.positions, i), at(frame.positions, i + 2));
      expect(radius).toBeGreaterThan(0.95 - 1e-5);
      expect(radius).toBeLessThan(1.05 + 1e-5);
      expect(Math.abs(at(frame.positions, i + 1))).toBeGreaterThan(0.25 - 1e-5);
    }
    for (const value of windings(frame)) expect(value).toBeLessThan(0);
  });

  it("joins the ribbons of its halo on mitres: the direction of the curve on each point", () => {
    const halo = createFrameHalo(outlines, 0);
    expect(halo.positions).toHaveLength(32 * 4 * 3);
    for (let vertex = 0; vertex < 32 * 4; vertex++) {
      const joint = [0, 1, 2, 3].map((k) => at(halo.joints, vertex * 4 + k));
      expect(at(joint, 3)).toBe(1);
      expect(Math.hypot(at(joint, 0), at(joint, 1), at(joint, 2))).toBeCloseTo(1);
      // The curve turns about y: its direction lies flat, and across the radius of its point.
      expect(at(joint, 1)).toBeCloseTo(0);
      expect(at(joint, 0) * at(halo.positions, vertex * 3) + at(joint, 2) * at(halo.positions, vertex * 3 + 2)).toBeCloseTo(0);
    }
    // The end of a side and the start of the next one stand on the same point, with the same joint.
    expect(Array.from(halo.joints.slice(4, 8))).toEqual(Array.from(halo.joints.slice(16, 20)));
    expect(Array.from(halo.positions.slice(3, 6))).toEqual(Array.from(halo.positions.slice(12, 15)));
  });

  it("keeps round the ends of an open line, and its sharp corners", () => {
    const line = createOutline(4, false, "mitre");
    // A gentle bend on the second point, a right angle on the third.
    line.points.set([0, 0, 0, 1, 0, 0, 2, 0.2, 0, 1.8, 1.2, 0]);
    line.outward.set([0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0]);
    line.normals.set([0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1]);
    const halo = createFrameHalo([line], 0);
    expect(halo.positions).toHaveLength(3 * 4 * 3);
    // The first side: round at the start of the line, a mitre on the bend.
    expect(at(halo.joints, 3)).toBe(0);
    expect(at(halo.joints, 4 + 3)).toBe(1);
    // The second side: the same mitre, then the corner, round.
    expect(at(halo.joints, 16 + 3)).toBe(1);
    expect(at(halo.joints, 20 + 3)).toBe(0);
    // The third side: round on the corner and at the end of the line.
    expect(at(halo.joints, 32 + 3)).toBe(0);
    expect(at(halo.joints, 36 + 3)).toBe(0);
  });
});
