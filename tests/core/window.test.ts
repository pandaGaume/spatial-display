import { describe, expect, it } from "vitest";
import { RECT_TUNNEL_INDEX_COUNT, RECT_TUNNEL_VERTEX_COUNT, createRectTunnel, windowFrustum, windowProjection, writeRectTunnel } from "@spacexr/spatial-display-core";

const at = (array: ArrayLike<number>, index: number): number => array[index] as number;

/** Projects a point of view space with a matrix laid out column-major, for column vectors. */
const project = (m: readonly number[], x: number, y: number, z: number): { x: number; y: number; z: number } => {
  const w = at(m, 3) * x + at(m, 7) * y + at(m, 11) * z + at(m, 15);
  return {
    x: (at(m, 0) * x + at(m, 4) * y + at(m, 8) * z + at(m, 12)) / w,
    y: (at(m, 1) * x + at(m, 5) * y + at(m, 9) * z + at(m, 13)) / w,
    z: (at(m, 2) * x + at(m, 6) * y + at(m, 10) * z + at(m, 14)) / w,
  };
};

describe("looking through a window", () => {
  // An opening of 2 by 1, seen from a point off its axis.
  const eye = { x: 0.3, y: -0.2, distance: 2 };
  const [width, height, near, far] = [2, 1, 1.5, 100];
  const frustum = windowFrustum(eye, width, height, near);

  it("measures the frustum that passes through the edges of the opening", () => {
    // On the plane of the opening the sides are its edges, seen from the eye; they shrink with the near plane.
    expect(frustum.left).toBeCloseTo((-1 - 0.3) * 0.75);
    expect(frustum.right).toBeCloseTo((1 - 0.3) * 0.75);
    expect(frustum.bottom).toBeCloseTo((-0.5 + 0.2) * 0.75);
    expect(frustum.top).toBeCloseTo((0.5 + 0.2) * 0.75);
    // An eye on the axis gives a frustum centred on it.
    const centred = windowFrustum({ x: 0, y: 0, distance: 2 }, width, height, near);
    expect(centred.left).toBeCloseTo(-centred.right);
    expect(centred.bottom).toBeCloseTo(-centred.top);
  });

  it("projects the corners of the opening onto the corners of the image", () => {
    const m = windowProjection(frustum, { near, far });
    // In view space the opening stands at the distance of the eye, its corners off the axis by where the eye is.
    const low = project(m, -1 - eye.x, -0.5 - eye.y, eye.distance);
    const high = project(m, 1 - eye.x, 0.5 - eye.y, eye.distance);
    expect([low.x, low.y]).toEqual([expect.closeTo(-1), expect.closeTo(-1)]);
    expect([high.x, high.y]).toEqual([expect.closeTo(1), expect.closeTo(1)]);
    // The centre of the opening is not the centre of the image, unless the eye faces it.
    expect(project(m, -eye.x, -eye.y, eye.distance).x).toBeCloseTo(0);
    expect(project(m, 0, 0, eye.distance).x).not.toBeCloseTo(0);
  });

  it("maps depth from the near plane to the far one, for both ranges of depth", () => {
    const full = windowProjection(frustum, { near, far });
    expect(project(full, 0, 0, near).z).toBeCloseTo(-1);
    expect(project(full, 0, 0, far).z).toBeCloseTo(1);
    const half = windowProjection(frustum, { near, far, halfZRange: true });
    expect(project(half, 0, 0, near).z).toBeCloseTo(0);
    expect(project(half, 0, 0, far).z).toBeCloseTo(1);
  });

  it("does the same for a camera that looks down -z", () => {
    const m = windowProjection(frustum, { near, far, rightHanded: true });
    const low = project(m, -1 - eye.x, -0.5 - eye.y, -eye.distance);
    const high = project(m, 1 - eye.x, 0.5 - eye.y, -eye.distance);
    expect([low.x, low.y]).toEqual([expect.closeTo(-1), expect.closeTo(-1)]);
    expect([high.x, high.y]).toEqual([expect.closeTo(1), expect.closeTo(1)]);
    expect(project(m, 0, 0, -near).z).toBeCloseTo(-1);
    expect(project(m, 0, 0, -far).z).toBeCloseTo(1);
    const half = windowProjection(frustum, { near, far, rightHanded: true, halfZRange: true });
    expect(project(half, 0, 0, -near).z).toBeCloseTo(0);
  });
});

describe("walls of a rectangular tunnel", () => {
  const tunnel = createRectTunnel({ width: 2, height: 1, depth: 0.5 });

  it("are four rectangles that run from the edges of the opening", () => {
    expect(RECT_TUNNEL_VERTEX_COUNT).toBe(16);
    expect(RECT_TUNNEL_INDEX_COUNT).toBe(24);
    expect(tunnel.positions).toHaveLength(16 * 3);
    expect(Math.max(...tunnel.indices)).toBe(15);
    for (let v = 0; v < 16; v++) {
      // Every vertex stands on a corner of the opening, on its plane or at the end of the walls.
      expect(Math.abs(at(tunnel.positions, v * 3))).toBe(1);
      expect(Math.abs(at(tunnel.positions, v * 3 + 1))).toBe(0.5);
      expect([0, 0.5]).toContain(at(tunnel.positions, v * 3 + 2));
      // The depth is what the texture coordinate v follows.
      expect(at(tunnel.uvs, v * 2 + 1)).toBe(at(tunnel.positions, v * 3 + 2) === 0 ? 0 : 1);
    }
  });

  it("face inward", () => {
    for (let wall = 0; wall < 4; wall++) {
      const first = wall * 4;
      // A wall holds one of x or y; its normal points back toward the axis of the tunnel.
      const [x, y] = [at(tunnel.positions, first * 3), at(tunnel.positions, first * 3 + 1)];
      const [x1, y1] = [at(tunnel.positions, (first + 1) * 3), at(tunnel.positions, (first + 1) * 3 + 1)];
      const [nx, ny] = [at(tunnel.normals, first * 3), at(tunnel.normals, first * 3 + 1)];
      expect(Math.hypot(nx, ny)).toBe(1);
      expect(nx * (x + x1) + ny * (y + y1)).toBeLessThan(0);
    }
  });

  it("run the other way with a negative depth, and follow the opening when rewritten", () => {
    const positions = tunnel.positions.slice();
    writeRectTunnel({ width: 4, height: 4, depth: -2 }, positions);
    for (let v = 0; v < 16; v++) {
      expect(Math.abs(at(positions, v * 3))).toBe(2);
      expect([0, -2]).toContain(at(positions, v * 3 + 2));
    }
  });
});
