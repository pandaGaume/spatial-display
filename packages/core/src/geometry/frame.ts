/**
 * Frame of a surface: a tube of square section that runs along its outlines,
 * and the halo of that tube.
 *
 * The tube stands against the surface: its inner face starts on the outline,
 * and its section spans half a side on each face of the surface. Each side of
 * an outline gives four faces: front (against the normal of the surface),
 * outer, back and inner. On a corner the faces of two sides meet on a mitre,
 * which the outline gives with the way out of its points.
 *
 * Faces do not share vertices. The number of vertices and the indices do not
 * depend on the size of the surface: resizing a frame rewrites positions,
 * normals and texture coordinates only (`writeFrame`).
 *
 * Texture coordinates: u runs once along each outline, from 0 to 1, on the
 * centre line of the tube and in proportion to its length; v runs across each
 * face, from 0 on one long edge to 1 on the other.
 */
import { outlinePointCount, outlineSideCount, type IOutline } from "./outline.js";

export interface IFrameGeometry {
  /** 3 numbers per vertex. */
  positions: Float32Array;
  /** 3 numbers per vertex. */
  normals: Float32Array;
  /** 2 numbers per vertex. */
  uvs: Float32Array;
  indices: Uint16Array | Uint32Array;
}

const FACES_PER_SIDE = 4;
const VERTICES_PER_FACE = 4;

export const FRAME_VERTICES_PER_SIDE = FACES_PER_SIDE * VERTICES_PER_FACE;
export const FRAME_INDICES_PER_SIDE = FACES_PER_SIDE * 6;

/** Number of sides of the lines a frame runs along. */
export const frameSideCount = (outlines: readonly IOutline[]): number => outlines.reduce((sum, outline) => sum + outlineSideCount(outline), 0);

/**
 * The two long edges of each face, front, outer, back and inner: how far each
 * stands out of the surface, in sections, and on which face of the surface, in
 * half sections.
 */
const NEAR_OUT = [0, 1, 1, 0] as const;
const NEAR_UP = [-1, -1, 1, 1] as const;
const FAR_OUT = [1, 1, 0, 0] as const;
const FAR_UP = [-1, 1, 1, -1] as const;

const at = (array: ArrayLike<number>, index: number): number => array[index] as number;

/** The centre line of the tube of an outline: where its halo is anchored, and what its texture coordinates follow. */
interface ICentreLine {
  /** 3 numbers per point of the outline. */
  points: Float64Array;
  /** Unit direction of each side, 3 numbers each; zero for a side with no length. */
  directions: Float64Array;
  lengths: Float64Array;
  /** Where each point stands along the line, from 0 to 1: one more than there are sides. */
  stops: Float64Array;
}

function centreLine(outline: IOutline, section: number): ICentreLine {
  const count = outlinePointCount(outline);
  const sides = outlineSideCount(outline);
  const half = section / 2;
  const points = new Float64Array(count * 3);
  for (let i = 0; i < points.length; i++) points[i] = at(outline.points, i) + at(outline.outward, i) * half;
  const directions = new Float64Array(sides * 3);
  const lengths = new Float64Array(sides);
  const stops = new Float64Array(sides + 1);
  let total = 0;
  for (let side = 0; side < sides; side++) {
    const a = side * 3;
    const b = ((side + 1) % count) * 3;
    const dx = at(points, b) - at(points, a);
    const dy = at(points, b + 1) - at(points, a + 1);
    const dz = at(points, b + 2) - at(points, a + 2);
    const length = Math.hypot(dx, dy, dz);
    lengths[side] = length;
    if (length > 0) {
      directions[a] = dx / length;
      directions[a + 1] = dy / length;
      directions[a + 2] = dz / length;
    }
    total += length;
    stops[side + 1] = total;
  }
  for (let side = 1; side <= sides; side++) stops[side] = total > 0 ? at(stops, side) / total : side / sides;
  return { points, directions, lengths, stops };
}

/**
 * Writes the positions of a frame, and its normals and texture coordinates
 * when their arrays are given, into arrays of `FRAME_VERTICES_PER_SIDE`
 * vertices per side of the outlines.
 */
export function writeFrame(outlines: readonly IOutline[], section: number, positions: Float32Array, normals?: Float32Array, uvs?: Float32Array): void {
  const half = section / 2;
  let p = 0;
  let n = 0;
  let t = 0;
  for (const outline of outlines) {
    const count = outlinePointCount(outline);
    const sides = outlineSideCount(outline);
    if (sides === 0) continue;
    const line = centreLine(outline, section);
    const { points, outward, normals: surface } = outline;
    for (let side = 0; side < sides; side++) {
      const start = side * 3;
      const end = ((side + 1) % count) * 3;
      const dx = at(line.directions, start);
      const dy = at(line.directions, start + 1);
      const dz = at(line.directions, start + 2);
      const u0 = at(line.stops, side);
      const u1 = at(line.stops, side + 1);
      for (let face = 0; face < FACES_PER_SIDE; face++) {
        for (let v = 0; v < VERTICES_PER_FACE; v++) {
          // Along one long edge of the face at the start of the side, then back along the other from its end.
          const point = v < 2 ? start : end;
          const far = v === 1 || v === 2;
          const out = at(far ? FAR_OUT : NEAR_OUT, face) * section;
          const up = at(far ? FAR_UP : NEAR_UP, face) * half;
          positions[p++] = at(points, point) + at(outward, point) * out + at(surface, point) * up;
          positions[p++] = at(points, point + 1) + at(outward, point + 1) * out + at(surface, point + 1) * up;
          positions[p++] = at(points, point + 2) + at(outward, point + 2) * out + at(surface, point + 2) * up;
          if (normals) {
            let x: number;
            let y: number;
            let z: number;
            if (face % 2 === 0) {
              // Front and back: the normal of the surface, and its opposite.
              const sign = face === 0 ? -1 : 1;
              x = at(surface, point) * sign;
              y = at(surface, point + 1) * sign;
              z = at(surface, point + 2) * sign;
            } else {
              // Outer and inner: the way out of the surface, across the side. On a corner the mitre leans along
              // the side, and what is left of it across the side is the normal of that side alone.
              const along = at(outward, point) * dx + at(outward, point + 1) * dy + at(outward, point + 2) * dz;
              x = at(outward, point) - dx * along;
              y = at(outward, point + 1) - dy * along;
              z = at(outward, point + 2) - dz * along;
              const length = Math.hypot(x, y, z);
              const scale = length > 0 ? (face === 1 ? 1 : -1) / length : 0;
              x *= scale;
              y *= scale;
              z *= scale;
            }
            normals[n++] = x;
            normals[n++] = y;
            normals[n++] = z;
          }
          if (uvs) {
            uvs[t++] = v < 2 ? u0 : u1;
            uvs[t++] = far ? 1 : 0;
          }
        }
      }
    }
  }
}

/**
 * Tells which way the faces of the tube of an outline are wound. With the way
 * out of the surface, the direction the line runs in and the normal of the
 * surface, the faces of every side turn the same way: it is read on the whole
 * line, so that a side with no length does not count.
 */
function windsAsWritten(outline: IOutline): boolean {
  const count = outlinePointCount(outline);
  const sides = outlineSideCount(outline);
  const { points, outward, normals } = outline;
  let turn = 0;
  for (let side = 0; side < sides; side++) {
    const a = side * 3;
    const b = ((side + 1) % count) * 3;
    const dx = at(points, b) - at(points, a);
    const dy = at(points, b + 1) - at(points, a + 1);
    const dz = at(points, b + 2) - at(points, a + 2);
    const length = Math.hypot(dx, dy, dz);
    if (length === 0) continue;
    const ox = at(outward, a);
    const oy = at(outward, a + 1);
    const oz = at(outward, a + 2);
    // (outward x direction) . normal
    turn += ((oy * dz - oz * dy) * at(normals, a) + (oz * dx - ox * dz) * at(normals, a + 1) + (ox * dy - oy * dx) * at(normals, a + 2)) / length;
  }
  return turn > 0;
}

/**
 * Builds the vertex data of a frame. Each face is wound so that the cross
 * product of its edges points against its normal: the convention of the vertex
 * data Babylon.js builds, which it draws facing outward in left- and
 * right-handed scenes alike.
 */
export function createFrame(outlines: readonly IOutline[], section: number): IFrameGeometry {
  const sides = frameSideCount(outlines);
  const vertices = sides * FRAME_VERTICES_PER_SIDE;
  const positions = new Float32Array(vertices * 3);
  const normals = new Float32Array(vertices * 3);
  const uvs = new Float32Array(vertices * 2);
  const indices = vertices > 0xffff ? new Uint32Array(sides * FRAME_INDICES_PER_SIDE) : new Uint16Array(sides * FRAME_INDICES_PER_SIDE);
  let i = 0;
  let first = 0;
  for (const outline of outlines) {
    const asWritten = windsAsWritten(outline);
    const faces = outlineSideCount(outline) * FACES_PER_SIDE;
    for (let face = 0; face < faces; face++) {
      if (asWritten) {
        indices[i++] = first; indices[i++] = first + 1; indices[i++] = first + 2;
        indices[i++] = first; indices[i++] = first + 2; indices[i++] = first + 3;
      } else {
        indices[i++] = first; indices[i++] = first + 2; indices[i++] = first + 1;
        indices[i++] = first; indices[i++] = first + 3; indices[i++] = first + 2;
      }
      first += VERTICES_PER_FACE;
    }
  }
  writeFrame(outlines, section, positions, normals, uvs);
  return { positions, normals, uvs, indices };
}

// ---------------------------------------------------------------------------
// Halo

/**
 * Halo of a frame: the anchors of what a shader spreads into light around the
 * tube. It is made of ribbons, one along the centre line of each side.
 *
 * A vertex holds an end of the centre line of its side, not its final place:
 * the shader moves it away from there by the radius of the halo, across the
 * side and across the line of sight. The ribbon so faces the eye from every
 * angle, which a flat skirt around the frame would not.
 *
 * What happens on a point where two sides meet is the choice of the outline
 * (`IOutline.join`). With round ends the ribbon reaches beyond the end of its
 * side and the shader rounds it: two ribbons meet with the same round end,
 * centred on the point. With a mitre the two ribbons end on the same line, the
 * bisector of the point, and cover no pixel twice. The ends of an open line
 * are round either way, and so are the sharp corners of a line: a mitre is
 * for a curve.
 *
 * - `axes`: direction of the side.
 * - `offsets`: x is -1 at the start of the side and 1 at its end, y is -1 on
 *   one edge of the ribbon and 1 on the other.
 * - `uvs`: u is the coordinate along the outline, the same as on the tube, so
 *   that a light that travels along the tube travels along its halo too; v is
 *   the length of the side, which the shader needs to round the ends.
 * - `joints`: the direction of the line on the point the vertex stands on,
 *   halfway between those of the two sides that meet there, then 1 for a
 *   mitre; four zeros for a round end.
 *
 * `offsets` and `indices` do not depend on the size of the surface.
 */
export interface IFrameHaloGeometry {
  /** 3 numbers per vertex. */
  positions: Float32Array;
  /** 3 numbers per vertex. */
  axes: Float32Array;
  /** 2 numbers per vertex. */
  offsets: Float32Array;
  /** 2 numbers per vertex. */
  uvs: Float32Array;
  /** 4 numbers per vertex. */
  joints: Float32Array;
  indices: Uint16Array | Uint32Array;
}

export const FRAME_HALO_VERTICES_PER_SIDE = 4;
export const FRAME_HALO_INDICES_PER_SIDE = 6;

/** Which end of the side, and which edge of the ribbon, each of the four vertices of a ribbon stands on. */
const RIBBON_END = [-1, 1, 1, -1] as const;
const RIBBON_EDGE = [-1, -1, 1, 1] as const;

/**
 * Two sides meet on a mitre while the line bends by less than about 30
 * degrees: this is the cosine of the sharpest bend. On a sharper corner a
 * mitre would be a long spike, and the two sides end round there instead, as
 * on the corners of a rectangle.
 */
const SHARPEST_MITRE = 0.85;

/** The joints of the points of an outline: 4 numbers each, as in `IFrameHaloGeometry.joints`. */
function jointsOf(outline: IOutline, line: ICentreLine): Float64Array {
  const count = outlinePointCount(outline);
  const sides = outlineSideCount(outline);
  const joints = new Float64Array(count * 4);
  if (outline.join !== "mitre") return joints;
  for (let point = 0; point < count; point++) {
    // The side that ends on the point and the one that starts there. An open line has neither at its ends.
    const before = outline.closed ? (point - 1 + sides) % sides : point - 1;
    const after = outline.closed ? point % sides : point;
    if (before < 0 || after >= sides) continue;
    if (at(line.lengths, before) === 0 || at(line.lengths, after) === 0) continue;
    const bx = at(line.directions, before * 3);
    const by = at(line.directions, before * 3 + 1);
    const bz = at(line.directions, before * 3 + 2);
    const ax = at(line.directions, after * 3);
    const ay = at(line.directions, after * 3 + 1);
    const az = at(line.directions, after * 3 + 2);
    if (bx * ax + by * ay + bz * az < SHARPEST_MITRE) continue;
    const x = bx + ax;
    const y = by + ay;
    const z = bz + az;
    const length = Math.hypot(x, y, z);
    joints[point * 4] = x / length;
    joints[point * 4 + 1] = y / length;
    joints[point * 4 + 2] = z / length;
    joints[point * 4 + 3] = 1;
  }
  return joints;
}

/**
 * Writes what depends on the size of the surface in the halo of a frame: the
 * anchors, the directions of the sides, the texture coordinates and the
 * joints, into arrays of `FRAME_HALO_VERTICES_PER_SIDE` vertices per side of
 * the outlines.
 */
export function writeFrameHalo(outlines: readonly IOutline[], section: number, halo: Pick<IFrameHaloGeometry, "positions" | "axes" | "uvs" | "joints">): void {
  const { positions, axes, uvs, joints } = halo;
  let p = 0;
  let a = 0;
  let t = 0;
  let j = 0;
  for (const outline of outlines) {
    const count = outlinePointCount(outline);
    const sides = outlineSideCount(outline);
    if (sides === 0) continue;
    const line = centreLine(outline, section);
    const folds = jointsOf(outline, line);
    for (let side = 0; side < sides; side++) {
      for (let v = 0; v < FRAME_HALO_VERTICES_PER_SIDE; v++) {
        const atEnd = (RIBBON_END[v] as number) > 0;
        const point = atEnd ? (side + 1) % count : side;
        positions[p++] = at(line.points, point * 3);
        positions[p++] = at(line.points, point * 3 + 1);
        positions[p++] = at(line.points, point * 3 + 2);
        axes[a++] = at(line.directions, side * 3);
        axes[a++] = at(line.directions, side * 3 + 1);
        axes[a++] = at(line.directions, side * 3 + 2);
        uvs[t++] = at(line.stops, atEnd ? side + 1 : side);
        uvs[t++] = at(line.lengths, side);
        joints[j++] = at(folds, point * 4);
        joints[j++] = at(folds, point * 4 + 1);
        joints[j++] = at(folds, point * 4 + 2);
        joints[j++] = at(folds, point * 4 + 3);
      }
    }
  }
}

/** Builds the vertex data of the halo of a frame. */
export function createFrameHalo(outlines: readonly IOutline[], section: number): IFrameHaloGeometry {
  const sides = frameSideCount(outlines);
  const vertices = sides * FRAME_HALO_VERTICES_PER_SIDE;
  const positions = new Float32Array(vertices * 3);
  const axes = new Float32Array(vertices * 3);
  const offsets = new Float32Array(vertices * 2);
  const uvs = new Float32Array(vertices * 2);
  const joints = new Float32Array(vertices * 4);
  const indices = vertices > 0xffff ? new Uint32Array(sides * FRAME_HALO_INDICES_PER_SIDE) : new Uint16Array(sides * FRAME_HALO_INDICES_PER_SIDE);
  let o = 0;
  let i = 0;
  for (let side = 0; side < sides; side++) {
    for (let v = 0; v < FRAME_HALO_VERTICES_PER_SIDE; v++) {
      offsets[o++] = RIBBON_END[v] as number;
      offsets[o++] = RIBBON_EDGE[v] as number;
    }
    // A ribbon faces the eye from both sides of the frame: its winding does not matter, and it is drawn unculled.
    const first = side * FRAME_HALO_VERTICES_PER_SIDE;
    indices[i++] = first; indices[i++] = first + 1; indices[i++] = first + 2;
    indices[i++] = first; indices[i++] = first + 2; indices[i++] = first + 3;
  }
  writeFrameHalo(outlines, section, { positions, axes, uvs, joints });
  return { positions, axes, offsets, uvs, joints, indices };
}
