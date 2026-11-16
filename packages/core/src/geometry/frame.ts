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

  const stops = perimeterStops(options);

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

/** Where each corner stands along the centre line of the tube, from 0 to 1 around the frame. */
function perimeterStops(options: Readonly<IRectFrameOptions>): number[] {
  const alongX = options.width + options.section;
  const alongY = options.height + options.section;
  const perimeter = 2 * (alongX + alongY);
  return perimeter > 0 ? [0, alongX / perimeter, (alongX + alongY) / perimeter, (2 * alongX + alongY) / perimeter, 1] : [0, 0.25, 0.5, 0.75, 1];
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

// ---------------------------------------------------------------------------
// Halo

/**
 * Halo of a rectangular frame: the anchors of what a shader spreads into light
 * around the tube. It is made of four ribbons, one along the centre line of
 * each side.
 *
 * A vertex holds an end of the centre line of its side, not its final place:
 * the shader moves it away from there by the radius of the halo, across the
 * side and across the line of sight, and beyond the end of the side. The
 * ribbon so faces the eye from every angle, which a flat skirt around the
 * frame would not, and the shader rounds its ends: two ribbons meet on a
 * corner with the same round end, centred on that corner.
 *
 * - `axes`: direction of the side.
 * - `offsets`: x is -1 at the start of the side and 1 at its end, y is -1 on
 *   one edge of the ribbon and 1 on the other.
 * - `uvs`: u is the coordinate along the frame, the same as on the tube, so
 *   that a light that travels along the tube travels along its halo too; v is
 *   the length of the side, which the shader needs to round the ends.
 *
 * Only `positions` and `uvs` depend on the size of the frame.
 */
export interface IRectFrameHaloGeometry {
  /** 3 numbers per vertex. */
  positions: Float32Array;
  /** 3 numbers per vertex. */
  axes: Float32Array;
  /** 2 numbers per vertex. */
  offsets: Float32Array;
  /** 2 numbers per vertex. */
  uvs: Float32Array;
  indices: Uint16Array;
}

export const RECT_FRAME_HALO_VERTEX_COUNT = SIDES * 4;
export const RECT_FRAME_HALO_INDEX_COUNT = SIDES * 6;

/** Which end of the side, and which edge of the ribbon, each of the four vertices of a ribbon stands on. */
const RIBBON_END = [-1, 1, 1, -1] as const;
const RIBBON_EDGE = [-1, -1, 1, 1] as const;

/**
 * Writes the anchors of the halo of a frame, and its texture coordinates when
 * `uvs` is given, into arrays of `RECT_FRAME_HALO_VERTEX_COUNT` vertices.
 */
export function writeRectFrameHalo(options: Readonly<IRectFrameOptions>, positions: Float32Array, uvs?: Float32Array): void {
  // The centre line of the tube.
  const x = (options.width + options.section) / 2;
  const y = (options.height + options.section) / 2;
  const stops = perimeterStops(options);
  let p = 0;
  let t = 0;
  for (let side = 0; side < SIDES; side++) {
    const next = (side + 1) % SIDES;
    const length = side % 2 === 0 ? 2 * x : 2 * y;
    for (let v = 0; v < 4; v++) {
      const atEnd = (RIBBON_END[v] as number) > 0;
      const corner = atEnd ? next : side;
      positions[p++] = (CORNER_X[corner] as number) * x;
      positions[p++] = (CORNER_Y[corner] as number) * y;
      positions[p++] = 0;
      if (!uvs) continue;
      uvs[t++] = stops[atEnd ? side + 1 : side] as number;
      uvs[t++] = length;
    }
  }
}

/** Builds the vertex data of the halo of a frame. */
export function createRectFrameHalo(options: Readonly<IRectFrameOptions>): IRectFrameHaloGeometry {
  const positions = new Float32Array(RECT_FRAME_HALO_VERTEX_COUNT * 3);
  const axes = new Float32Array(RECT_FRAME_HALO_VERTEX_COUNT * 3);
  const offsets = new Float32Array(RECT_FRAME_HALO_VERTEX_COUNT * 2);
  const uvs = new Float32Array(RECT_FRAME_HALO_VERTEX_COUNT * 2);
  const indices = new Uint16Array(RECT_FRAME_HALO_INDEX_COUNT);
  let a = 0;
  let o = 0;
  let i = 0;
  for (let side = 0; side < SIDES; side++) {
    const next = (side + 1) % SIDES;
    // The corners are those of a square here: the direction of a side does not depend on the size of the frame.
    const dx = ((CORNER_X[next] as number) - (CORNER_X[side] as number)) / 2;
    const dy = ((CORNER_Y[next] as number) - (CORNER_Y[side] as number)) / 2;
    for (let v = 0; v < 4; v++) {
      axes[a++] = dx;
      axes[a++] = dy;
      axes[a++] = 0;
      offsets[o++] = RIBBON_END[v] as number;
      offsets[o++] = RIBBON_EDGE[v] as number;
    }
    // A ribbon faces the eye from both sides of the frame: its winding does not matter, and it is drawn unculled.
    const first = side * 4;
    indices[i++] = first; indices[i++] = first + 1; indices[i++] = first + 2;
    indices[i++] = first; indices[i++] = first + 2; indices[i++] = first + 3;
  }
  writeRectFrameHalo(options, positions, uvs);
  return { positions, axes, offsets, uvs, indices };
}
