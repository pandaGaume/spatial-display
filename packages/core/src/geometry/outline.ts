/**
 * Outline of a surface: a line a frame runs along.
 *
 * Each point of the line carries what a frame needs to stand against the
 * surface there, as a tube of square section: the way out of the surface, and
 * the normal of the surface. The inner face of the tube starts on the line,
 * and its section spans half a side on each face of the surface.
 *
 * A rectangle has one outline, of four points. An open cylinder has two, its
 * rims. A sphere has none.
 */

/**
 * How the glow of two sides meets on a point of the line.
 *
 * - "round": each side ends in a round cap, centred on the point, and the caps
 *   of the two sides overlap: the light is denser around a corner. For a line
 *   of few, long sides, as a rectangle.
 * - "mitre": the two sides are cut on the bisector of the point, and overlap
 *   nowhere. For a curve made of many short sides, where round ends would
 *   pile up into a light far denser than the one of a straight side. Where
 *   such a line turns a sharp corner, its sides end round there all the same.
 */
export type OutlineJoin = "round" | "mitre";

export interface IOutline {
  /** Points of the line, 3 numbers each, in the order the line runs. */
  readonly points: Float32Array;
  /**
   * The way out of the surface at each point, 3 numbers each: a direction in
   * the surface, across the line. Its length is 1 where the line runs straight
   * or bends gently, and more on a corner, so that moving the point along it
   * by a distance moves the two sides that meet there by that distance: the
   * mitre of the corner.
   */
  readonly outward: Float32Array;
  /** Unit normal of the surface at each point, 3 numbers each. */
  readonly normals: Float32Array;
  /** A closed line joins its last point to its first one. */
  readonly closed: boolean;
  readonly join: OutlineJoin;
}

/** An outline of `count` points, all at the origin. */
export const createOutline = (count: number, closed: boolean, join: OutlineJoin): IOutline => ({
  points: new Float32Array(count * 3),
  outward: new Float32Array(count * 3),
  normals: new Float32Array(count * 3),
  closed,
  join,
});

export const outlinePointCount = (outline: IOutline): number => outline.points.length / 3;

/** Number of sides of an outline: a closed line has one more than an open one. */
export const outlineSideCount = (outline: IOutline): number => {
  const count = outlinePointCount(outline);
  if (count < 2) return 0;
  return outline.closed ? count : count - 1;
};

/** Signs of the four corners of a rectangle, counter-clockwise when x reads to the right and y upward. */
const CORNER_X = [-1, 1, 1, -1] as const;
const CORNER_Y = [-1, -1, 1, 1] as const;

/**
 * A rectangle with no size at all has sides with no direction. It is kept
 * this large, far under what shows, so that its frame knows which way it runs.
 */
const SMALLEST_RECT = 1e-6;

/**
 * Writes the outline of a rectangle of the xy plane, centred on the origin:
 * its four corners, from the bottom left one and counter-clockwise when x
 * reads to the right and y upward.
 */
export function writeRectOutline(outline: IOutline, width: number, height: number): void {
  const x = Math.max(width, SMALLEST_RECT) / 2;
  const y = Math.max(height, SMALLEST_RECT) / 2;
  for (let corner = 0; corner < 4; corner++) {
    const cx = CORNER_X[corner] as number;
    const cy = CORNER_Y[corner] as number;
    const at = corner * 3;
    outline.points[at] = cx * x;
    outline.points[at + 1] = cy * y;
    outline.points[at + 2] = 0;
    // The mitre of a right angle: one unit along each of the two sides that leave the corner.
    outline.outward[at] = cx;
    outline.outward[at + 1] = cy;
    outline.outward[at + 2] = 0;
    outline.normals[at] = 0;
    outline.normals[at + 1] = 0;
    outline.normals[at + 2] = -1;
  }
}

/** The outline of a rectangle. Its corners keep the round ends of its four sides. */
export function createRectOutline(width: number, height: number): IOutline {
  const outline = createOutline(4, true, "round");
  writeRectOutline(outline, width, height);
  return outline;
}
