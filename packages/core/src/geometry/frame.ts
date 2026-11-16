/**
 * Rectangular frame made of a tube of square section, with mitred corners.
 *
 * The frame lies in the xy plane, around an opening centred on the origin, and
 * spans half a section on each side of that plane. Its four sides are the
 * bottom, the right, the top and the left ones, in that order, and each side
 * has four faces: front (toward -z), outer, back (toward +z) and inner.
 *
 * Faces do not share vertices, so normals are flat. The number of vertices,
 * the indices and the normals do not depend on the size: resizing a frame
 * rewrites positions and texture coordinates only (`writeRectFrame`).
 *
 * Texture coordinates: u runs once around the frame, from 0 to 1, along the
 * centre line of the tube and in proportion to its length; v runs across each
 * face, from 0 on one long edge to 1 on the other.
 */

export interface IRectFrameOptions {
  /** Size of the opening the frame goes around. */
  width: number;
  height: number;
  /** Side of the square section of the tube. */
  section: number;
}

export interface IRectFrameGeometry {
  /** 3 numbers per vertex. */
  positions: Float32Array;
  /** 3 numbers per vertex. */
  normals: Float32Array;
  /** 2 numbers per vertex. */
  uvs: Float32Array;
  indices: Uint16Array;
}

const SIDES = 4;
const FACES_PER_SIDE = 4;
const VERTICES_PER_FACE = 4;

export const RECT_FRAME_VERTEX_COUNT = SIDES * FACES_PER_SIDE * VERTICES_PER_FACE;
export const RECT_FRAME_INDEX_COUNT = SIDES * FACES_PER_SIDE * 6;

/** Signs of the four corners, counter-clockwise when x reads to the right and y upward. */
const CORNER_X = [-1, 1, 1, -1] as const;
const CORNER_Y = [-1, -1, 1, 1] as const;
/** Outward direction of the side that starts at each corner. */
const OUTWARD_X = [0, 1, 0, -1] as const;
const OUTWARD_Y = [-1, 0, 1, 0] as const;

/**
 * Writes the positions, and the texture coordinates when `uvs` is given, of a
 * frame into arrays of `RECT_FRAME_VERTEX_COUNT` vertices.
 */
export function writeRectFrame(options: Readonly<IRectFrameOptions>, positions: Float32Array, uvs?: Float32Array): void {
  const { width, height, section } = options;
  const innerX = width / 2;
  const innerY = height / 2;
  const outerX = innerX + section;
  const outerY = innerY + section;
  const front = -section / 2;
  const back = section / 2;

  // Lengths of the sides along the centre line of the tube.
  const alongX = width + section;
  const alongY = height + section;
  const perimeter = 2 * (alongX + alongY);
  const stops = perimeter > 0 ? [0, alongX / perimeter, (alongX + alongY) / perimeter, (2 * alongX + alongY) / perimeter, 1] : [0, 0.25, 0.5, 0.75, 1];

  let p = 0;
  let t = 0;
  const quad = (
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number,
    dx: number, dy: number, dz: number,
    u0: number, u1: number,
  ): void => {
    positions[p++] = ax; positions[p++] = ay; positions[p++] = az;
    positions[p++] = bx; positions[p++] = by; positions[p++] = bz;
    positions[p++] = cx; positions[p++] = cy; positions[p++] = cz;
    positions[p++] = dx; positions[p++] = dy; positions[p++] = dz;
    if (!uvs) return;
    uvs[t++] = u0; uvs[t++] = 0;
    uvs[t++] = u1; uvs[t++] = 0;
    uvs[t++] = u1; uvs[t++] = 1;
    uvs[t++] = u0; uvs[t++] = 1;
  };

  for (let side = 0; side < SIDES; side++) {
    const next = (side + 1) % SIDES;
    const sx0 = CORNER_X[side] as number;
    const sy0 = CORNER_Y[side] as number;
    const sx1 = CORNER_X[next] as number;
    const sy1 = CORNER_Y[next] as number;
    const u0 = stops[side] as number;
    const u1 = stops[side + 1] as number;

    // Corners of the side: inner and outer, at its start (0) and at its end (1).
    const ix0 = sx0 * innerX, iy0 = sy0 * innerY;
    const ix1 = sx1 * innerX, iy1 = sy1 * innerY;
    const ox0 = sx0 * outerX, oy0 = sy0 * outerY;
    const ox1 = sx1 * outerX, oy1 = sy1 * outerY;

    // Front and back faces are trapezoids: the mitre joins the outer corner to the inner one.
    quad(ox0, oy0, front, ox1, oy1, front, ix1, iy1, front, ix0, iy0, front, u0, u1);
    quad(ox0, oy0, front, ox1, oy1, front, ox1, oy1, back, ox0, oy0, back, u0, u1);
    quad(ox0, oy0, back, ox1, oy1, back, ix1, iy1, back, ix0, iy0, back, u0, u1);
    quad(ix0, iy0, front, ix1, iy1, front, ix1, iy1, back, ix0, iy0, back, u0, u1);
  }
}

/** Normals of a frame: one direction per face, whatever its size. */
function writeNormals(normals: Float32Array): void {
  let n = 0;
  const face = (x: number, y: number, z: number): void => {
    for (let v = 0; v < VERTICES_PER_FACE; v++) {
      normals[n++] = x;
      normals[n++] = y;
      normals[n++] = z;
    }
  };
  for (let side = 0; side < SIDES; side++) {
    const x = OUTWARD_X[side] as number;
    const y = OUTWARD_Y[side] as number;
    face(0, 0, -1);
    face(x, y, 0);
    face(0, 0, 1);
    face(-x, -y, 0);
  }
}

/**
 * Indices of a frame. Each face is wound so that the cross product of its
 * edges points against its normal: the convention of the vertex data Babylon.js
 * builds, which it draws facing outward in left- and right-handed scenes alike.
 */
function writeIndices(indices: Uint16Array, positions: Float32Array, normals: Float32Array): void {
  let i = 0;
  for (let first = 0; first < RECT_FRAME_VERTEX_COUNT; first += VERTICES_PER_FACE) {
    const a = first * 3;
    const b = a + 3;
    const c = a + 6;
    const e1x = (positions[b] as number) - (positions[a] as number);
    const e1y = (positions[b + 1] as number) - (positions[a + 1] as number);
    const e1z = (positions[b + 2] as number) - (positions[a + 2] as number);
    const e2x = (positions[c] as number) - (positions[a] as number);
    const e2y = (positions[c + 1] as number) - (positions[a + 1] as number);
    const e2z = (positions[c + 2] as number) - (positions[a + 2] as number);
    const along =
      (e1y * e2z - e1z * e2y) * (normals[a] as number) +
      (e1z * e2x - e1x * e2z) * (normals[a + 1] as number) +
      (e1x * e2y - e1y * e2x) * (normals[a + 2] as number);
    if (along < 0) {
      indices[i++] = first; indices[i++] = first + 1; indices[i++] = first + 2;
      indices[i++] = first; indices[i++] = first + 2; indices[i++] = first + 3;
    } else {
      indices[i++] = first; indices[i++] = first + 2; indices[i++] = first + 1;
      indices[i++] = first; indices[i++] = first + 3; indices[i++] = first + 2;
    }
  }
}

/** Builds the vertex data of a frame. */
export function createRectFrame(options: Readonly<IRectFrameOptions>): IRectFrameGeometry {
  const positions = new Float32Array(RECT_FRAME_VERTEX_COUNT * 3);
  const normals = new Float32Array(RECT_FRAME_VERTEX_COUNT * 3);
  const uvs = new Float32Array(RECT_FRAME_VERTEX_COUNT * 2);
  const indices = new Uint16Array(RECT_FRAME_INDEX_COUNT);
  writeNormals(normals);
  // The winding is the same for every size: it is worked out on a frame of plain proportions,
  // so that a flat frame (no width, no section yet) still gets valid indices.
  writeRectFrame({ width: 1, height: 1, section: 0.25 }, positions);
  writeIndices(indices, positions, normals);
  writeRectFrame(options, positions, uvs);
  return { positions, normals, uvs, indices };
}
