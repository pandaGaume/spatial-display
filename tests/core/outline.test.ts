import { describe, expect, it } from "vitest";
import {
  createCylinderOutlines,
  createCylinderWall,
  createMeshOutlines,
  createRectOutline,
  cylinderWallSides,
  outlinePointCount,
  outlineSideCount,
  writeCylinderOutlines,
  writeCylinderWall,
  type ICylinderWallGeometry,
  type ICylinderWallOptions,
  type IOutline,
} from "@spacexr/spatial-display-core";

const at = (array: ArrayLike<number>, index: number): number => array[index] as number;
const point = (array: ArrayLike<number>, index: number): number[] => [at(array, index * 3), at(array, index * 3 + 1), at(array, index * 3 + 2)];

/** Cross product of the first two edges of each triangle, against the normal of its first vertex. */
const windings = (g: ICylinderWallGeometry): number[] => {
  const out: number[] = [];
  for (let i = 0; i < g.indices.length; i += 3) {
    const [a, b, c] = [point(g.positions, at(g.indices, i)), point(g.positions, at(g.indices, i + 1)), point(g.positions, at(g.indices, i + 2))] as [number[], number[], number[]];
    const e1 = [0, 1, 2].map((k) => at(b, k) - at(a, k));
    const e2 = [0, 1, 2].map((k) => at(c, k) - at(a, k));
    const cross = [at(e1, 1) * at(e2, 2) - at(e1, 2) * at(e2, 1), at(e1, 2) * at(e2, 0) - at(e1, 0) * at(e2, 2), at(e1, 0) * at(e2, 1) - at(e1, 1) * at(e2, 0)];
    const n = point(g.normals, at(g.indices, i));
    out.push(at(cross, 0) * at(n, 0) + at(cross, 1) * at(n, 1) + at(cross, 2) * at(n, 2));
  }
  return out;
};

describe("outline of a rectangle", () => {
  it("is a closed line of four corners, each with the mitre of a right angle", () => {
    const outline = createRectOutline(2, 1);
    expect(outlinePointCount(outline)).toBe(4);
    expect(outlineSideCount(outline)).toBe(4);
    expect(outline.closed).toBe(true);
    expect(outline.join).toBe("round");
    expect(Array.from(outline.points)).toEqual([-1, -0.5, 0, 1, -0.5, 0, 1, 0.5, 0, -1, 0.5, 0]);
    // One unit along each of the two sides that leave the corner.
    expect(Array.from(outline.outward)).toEqual([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]);
  });
});

describe("wall of a cylinder", () => {
  const options: ICylinderWallOptions = { radius: 2, height: 1, tessellation: 16 };
  const wall = createCylinderWall(options);

  it("is a rectangle rolled around the y axis", () => {
    expect(cylinderWallSides(options)).toBe(16);
    // Two vertices on each of 17 columns: the seam is doubled, for the texture coordinates.
    expect(wall.positions).toHaveLength(34 * 3);
    expect(wall.indices).toHaveLength(16 * 6);
    for (let vertex = 0; vertex < 34; vertex++) {
      const [x, y, z] = point(wall.positions, vertex) as [number, number, number];
      expect(Math.hypot(x, z)).toBeCloseTo(2);
      expect(Math.abs(y)).toBeCloseTo(0.5);
      // The normal points away from the axis.
      const [nx, ny, nz] = point(wall.normals, vertex) as [number, number, number];
      expect([nx * 2, ny, nz * 2]).toEqual([expect.closeTo(x), 0, expect.closeTo(z)]);
    }
    // u runs along the turn, v from the bottom to the top.
    expect(Array.from(wall.uvs.slice(0, 4))).toEqual([0, 0, 0, 1]);
    expect(Array.from(wall.uvs.slice(-4))).toEqual([1, 0, 1, 1]);
  });

  it("stands with its middle on the z axis, u toward +x there", () => {
    // The middle column of the default wall is toward -z.
    expect(point(wall.positions, 16)).toEqual([expect.closeTo(0), -0.5, expect.closeTo(-2)]);
    expect(at(wall.positions, 18 * 3)).toBeGreaterThan(0);
    const other = createCylinderWall({ ...options, middle: 1 });
    expect(point(other.positions, 16)).toEqual([expect.closeTo(0), -0.5, expect.closeTo(2)]);
    expect(at(other.positions, 18 * 3)).toBeGreaterThan(0);
  });

  it("winds its front faces against their normals, whichever way it faces", () => {
    for (const middle of [1, -1] as const) {
      for (const inward of [false, true]) {
        const built = createCylinderWall({ ...options, middle, inward });
        for (const value of windings(built)) expect(value).toBeLessThan(0);
        // The front of a wall turned inward looks at the axis.
        const [x, , z] = point(built.positions, 0) as [number, number, number];
        const [nx, , nz] = point(built.normals, 0) as [number, number, number];
        expect(Math.sign(x * nx + z * nz)).toBe(inward ? -1 : 1);
      }
    }
  });

  it("covers a share of a turn, centred on its middle", () => {
    const bent = createCylinderWall({ ...options, arc: 0.25 });
    expect(cylinderWallSides({ ...options, arc: 0.25 })).toBe(4);
    expect(bent.positions).toHaveLength(10 * 3);
    // A quarter of a turn: from 45 degrees on one side of the middle to 45 on the other.
    expect(point(bent.positions, 0)).toEqual([expect.closeTo(-Math.SQRT2), -0.5, expect.closeTo(-Math.SQRT2)]);
    expect(point(bent.positions, 8)).toEqual([expect.closeTo(Math.SQRT2), -0.5, expect.closeTo(-Math.SQRT2)]);
  });

  it("is resized by rewriting positions only", () => {
    const positions = wall.positions.slice();
    writeCylinderWall({ ...options, radius: 0.5, height: 3 }, positions);
    expect(point(positions, 16)).toEqual([expect.closeTo(0), -1.5, expect.closeTo(-0.5)]);
  });
});

describe("outlines of a cylinder", () => {
  const options: ICylinderWallOptions = { radius: 2, height: 1, tessellation: 16 };

  it("are the two rims of a ring", () => {
    const [top, bottom] = createCylinderOutlines(options) as [IOutline, IOutline];
    for (const [rim, y] of [[top, 0.5], [bottom, -0.5]] as const) {
      expect(outlinePointCount(rim)).toBe(16);
      expect(rim.closed).toBe(true);
      expect(rim.join).toBe("mitre");
      for (let i = 0; i < 16; i++) {
        const [x, py, z] = point(rim.points, i) as [number, number, number];
        expect(Math.hypot(x, z)).toBeCloseTo(2);
        expect(py).toBe(y);
        // Out of the wall is upward on the top rim and downward on the bottom one.
        expect(point(rim.outward, i)).toEqual([expect.closeTo(0), Math.sign(y), expect.closeTo(0)]);
        const [nx, ny, nz] = point(rim.normals, i) as [number, number, number];
        expect([nx * 2, ny, nz * 2]).toEqual([expect.closeTo(x), 0, expect.closeTo(z)]);
      }
    }
  });

  it("is one line around a bent screen, with a mitre on its four corners", () => {
    const [edge] = createCylinderOutlines({ ...options, arc: 0.25 }) as [IOutline];
    // Five columns at the bottom, then five at the top the other way.
    expect(outlinePointCount(edge)).toBe(10);
    expect(edge.closed).toBe(true);
    expect(point(edge.points, 0)[1]).toBe(-0.5);
    expect(point(edge.points, 5)[1]).toBe(0.5);
    expect(point(edge.points, 4)[0]).toBeCloseTo(point(edge.points, 5)[0] as number);
    // On a corner the way out leaves both sides: its length is the one of the mitre of a right angle.
    for (const corner of [0, 4, 5, 9]) expect(Math.hypot(...point(edge.outward, corner))).toBeCloseTo(Math.SQRT2);
    for (const along of [1, 2, 3, 6, 7, 8]) expect(Math.hypot(...point(edge.outward, along))).toBeCloseTo(1);
    // Away from the wall: the first corner leaves it toward -x and downward.
    expect(point(edge.outward, 0)[0]).toBeLessThan(0);
    expect(point(edge.outward, 0)[1]).toBe(-1);
  });

  it("are rewritten in place when the wall changes size", () => {
    const outlines = createCylinderOutlines(options);
    writeCylinderOutlines({ ...options, radius: 1, height: 4 }, outlines);
    const [x, y, z] = point((outlines[0] as IOutline).points, 3) as [number, number, number];
    expect(Math.hypot(x, z)).toBeCloseTo(1);
    expect(y).toBe(2);
  });
});

describe("open edges of a mesh", () => {
  it("finds the edge of a flat sheet, with the way out of it", () => {
    // A square of two triangles in the xy plane.
    const positions = [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0];
    const [edge, ...others] = createMeshOutlines(positions, [0, 1, 2, 0, 2, 3]);
    expect(others).toHaveLength(0);
    const outline = edge as IOutline;
    expect(outlinePointCount(outline)).toBe(4);
    expect(outline.closed).toBe(true);
    expect(outline.join).toBe("mitre");
    for (let i = 0; i < 4; i++) {
      const [x, y, z] = point(outline.points, i) as [number, number, number];
      const [ox, oy, oz] = point(outline.outward, i) as [number, number, number];
      // Each corner leaves the square along its diagonal, by the mitre of a right angle.
      expect([ox, oy, oz]).toEqual([expect.closeTo(x === 0 ? -1 : 1), expect.closeTo(y === 0 ? -1 : 1), expect.closeTo(0)]);
      expect(z).toBe(0);
      // The front of the faces: against the cross product of their edges.
      expect(point(outline.normals, i)).toEqual([expect.closeTo(0), expect.closeTo(0), expect.closeTo(-1)]);
    }
  });

  it("takes the vertices that stand at the same place as one: a seam is not an edge", () => {
    // The wall of a cylinder has a seam, where its first and last columns stand at the same place.
    const wall = createCylinderWall({ radius: 1, height: 1, tessellation: 12 });
    const outlines = createMeshOutlines(wall.positions, wall.indices);
    expect(outlines).toHaveLength(2);
    for (const rim of outlines) {
      expect(outlinePointCount(rim)).toBe(12);
      const up = Math.sign(point(rim.points, 0)[1] as number);
      for (let i = 0; i < 12; i++) {
        // Out of the wall is along its axis, away from it.
        const [ox, oy, oz] = point(rim.outward, i) as [number, number, number];
        expect([ox, oy * up, oz]).toEqual([expect.closeTo(0), expect.closeTo(1), expect.closeTo(0)]);
      }
    }
  });

  it("finds none on a closed mesh, nor in triangles with no area", () => {
    // A tetrahedron.
    const positions = [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1];
    expect(createMeshOutlines(positions, [0, 2, 1, 0, 1, 3, 1, 2, 3, 2, 0, 3])).toHaveLength(0);
    // The same with a corner doubled, and a triangle between the two copies, as on the pole of a sphere.
    const doubled = [...positions, 0, 0, 1];
    expect(createMeshOutlines(doubled, [0, 2, 1, 0, 1, 3, 1, 2, 4, 2, 0, 3, 3, 4, 1])).toHaveLength(0);
    expect(createMeshOutlines([], [])).toHaveLength(0);
  });
});
