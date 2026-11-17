/**
 * Wall of a cylinder: a rectangle rolled around the y axis, with no cap. A
 * whole turn makes a ring; a share of a turn makes a bent screen.
 *
 * The wall is centred on the origin. Its middle stands on the z axis, and its
 * texture coordinates are those of the rectangle it is rolled from: u runs
 * along the turn, from 0 to 1 and toward +x on the middle of the wall, v runs
 * from 0 at the bottom to 1 at the top. An image so reads the right way round
 * for who faces the middle of the wall from its front.
 *
 * The number of vertices, the normals, the texture coordinates and the indices
 * do not depend on the radius nor on the height: resizing a wall rewrites
 * positions only (`writeCylinderWall`).
 */
import { createOutline, type IOutline } from "./outline.js";

export interface ICylinderWallOptions {
  radius: number;
  height: number;
  /** Share of a whole turn the wall covers, above 0 and up to 1. Default 1: a ring. */
  arc?: number;
  /** Number of sides of a whole turn. Default 64. */
  tessellation?: number;
  /** Sign of z where the middle of the wall stands. Default -1. */
  middle?: 1 | -1;
  /** True when the front of the wall is its inner face, turned toward the axis. Default false. */
  inward?: boolean;
}

export interface ICylinderWallGeometry {
  /** 3 numbers per vertex. */
  positions: Float32Array;
  /** 3 numbers per vertex: they point where the front of the wall looks. */
  normals: Float32Array;
  /** 2 numbers per vertex. */
  uvs: Float32Array;
  indices: Uint16Array | Uint32Array;
}

/** A wall with no radius has sides with no direction: its rims are kept this large, far under what shows. */
const SMALLEST_RADIUS = 1e-6;

/** A turn this close to a whole one is a whole one: the wall closes on itself. */
const WHOLE_TURN = 1 - 1e-9;

interface ITurn {
  /** Share of a whole turn, from 0 to 1. */
  arc: number;
  /** True when the wall closes on itself. */
  whole: boolean;
  /** Number of sides along the turn. */
  sides: number;
  middle: number;
  /** 1 for a front that looks away from the axis, -1 for one that looks at it. */
  facing: number;
}

function turnOf(options: Readonly<ICylinderWallOptions>): ITurn {
  const given = options.arc ?? 1;
  const whole = !(given < WHOLE_TURN);
  const arc = whole ? 1 : Math.max(given, 1e-4);
  const tessellation = Math.max(3, Math.round(options.tessellation ?? 64));
  const sides = whole ? tessellation : Math.max(1, Math.round(tessellation * arc));
  return { arc, whole, sides, middle: options.middle ?? -1, facing: options.inward ? -1 : 1 };
}

/** Angle of a column of the wall, counted from its middle. */
const angleOf = (turn: ITurn, column: number): number => (column / turn.sides - 0.5) * 2 * Math.PI * turn.arc;

/** Number of sides along the turn of a wall: its vertices stand on one more column, at the bottom and at the top. */
export const cylinderWallSides = (options: Readonly<ICylinderWallOptions>): number => turnOf(options).sides;

/** Writes the positions of a wall: two vertices per column, the bottom one then the top one. */
export function writeCylinderWall(options: Readonly<ICylinderWallOptions>, positions: Float32Array): void {
  const turn = turnOf(options);
  const radius = Math.max(options.radius, 0);
  const y = Math.max(options.height, 0) / 2;
  let p = 0;
  for (let column = 0; column <= turn.sides; column++) {
    const angle = angleOf(turn, column);
    const x = radius * Math.sin(angle);
    const z = radius * Math.cos(angle) * turn.middle;
    positions[p++] = x; positions[p++] = -y; positions[p++] = z;
    positions[p++] = x; positions[p++] = y; positions[p++] = z;
  }
}

/**
 * Builds the vertex data of a wall. Its front faces are wound so that the
 * cross product of their edges points against their normal, as the vertex
 * data of Babylon.js.
 */
export function createCylinderWall(options: Readonly<ICylinderWallOptions>): ICylinderWallGeometry {
  const turn = turnOf(options);
  const vertices = (turn.sides + 1) * 2;
  const positions = new Float32Array(vertices * 3);
  const normals = new Float32Array(vertices * 3);
  const uvs = new Float32Array(vertices * 2);
  const indices = vertices > 0xffff ? new Uint32Array(turn.sides * 6) : new Uint16Array(turn.sides * 6);
  let n = 0;
  let t = 0;
  for (let column = 0; column <= turn.sides; column++) {
    const angle = angleOf(turn, column);
    const x = Math.sin(angle) * turn.facing;
    const z = Math.cos(angle) * turn.middle * turn.facing;
    for (let row = 0; row < 2; row++) {
      normals[n++] = x; normals[n++] = 0; normals[n++] = z;
      uvs[t++] = column / turn.sides;
      uvs[t++] = row;
    }
  }
  // Along the turn then upward, the edges of a face turn about the way out of the axis by the sign of `middle`.
  const asWritten = turn.middle * turn.facing < 0;
  let i = 0;
  for (let side = 0; side < turn.sides; side++) {
    const bottom = side * 2;
    const top = bottom + 1;
    const nextBottom = bottom + 2;
    const nextTop = bottom + 3;
    if (asWritten) {
      indices[i++] = bottom; indices[i++] = nextBottom; indices[i++] = nextTop;
      indices[i++] = bottom; indices[i++] = nextTop; indices[i++] = top;
    } else {
      indices[i++] = bottom; indices[i++] = nextTop; indices[i++] = nextBottom;
      indices[i++] = bottom; indices[i++] = top; indices[i++] = nextTop;
    }
  }
  writeCylinderWall(options, positions);
  return { positions, normals, uvs, indices };
}

/**
 * Writes the outlines of a wall, as `createCylinderOutlines` builds them: the
 * two rims of a ring, or the single edge of a bent screen.
 */
export function writeCylinderOutlines(options: Readonly<ICylinderWallOptions>, outlines: readonly IOutline[]): void {
  const turn = turnOf(options);
  const radius = Math.max(options.radius, SMALLEST_RADIUS);
  const y = Math.max(options.height, 0) / 2;
  const write = (outline: IOutline, point: number, column: number, top: boolean, side: number): void => {
    const angle = angleOf(turn, column);
    const sin = Math.sin(angle);
    const cos = Math.cos(angle) * turn.middle;
    const at = point * 3;
    outline.points[at] = radius * sin;
    outline.points[at + 1] = top ? y : -y;
    outline.points[at + 2] = radius * cos;
    // Out of the wall: upward on its top rim, downward on its bottom one. On a corner of a bent screen, also
    // along the turn, away from the wall: the mitre of a right angle.
    outline.outward[at] = side * Math.cos(angle);
    outline.outward[at + 1] = top ? 1 : -1;
    outline.outward[at + 2] = -side * sin * turn.middle;
    outline.normals[at] = sin * turn.facing;
    outline.normals[at + 1] = 0;
    outline.normals[at + 2] = cos * turn.facing;
  };
  if (turn.whole) {
    const [top, bottom] = outlines as readonly [IOutline, IOutline];
    for (let column = 0; column < turn.sides; column++) {
      write(top, column, column, true, 0);
      write(bottom, column, column, false, 0);
    }
    return;
  }
  // One line around the screen: its bottom edge, then its top edge the other way.
  const [edge] = outlines as readonly [IOutline];
  const columns = turn.sides + 1;
  for (let column = 0; column < columns; column++) {
    const side = column === 0 ? -1 : column === turn.sides ? 1 : 0;
    write(edge, column, column, false, side);
    write(edge, 2 * columns - 1 - column, column, true, side);
  }
}

/**
 * Builds the outlines of a wall: the top rim and the bottom rim of a ring, two
 * closed lines; or the edge of a bent screen, one closed line with four
 * corners. They are curves: their sides meet on mitres.
 */
export function createCylinderOutlines(options: Readonly<ICylinderWallOptions>): IOutline[] {
  const turn = turnOf(options);
  const outlines = turn.whole ? [createOutline(turn.sides, true, "mitre"), createOutline(turn.sides, true, "mitre")] : [createOutline((turn.sides + 1) * 2, true, "mitre")];
  writeCylinderOutlines(options, outlines);
  return outlines;
}
