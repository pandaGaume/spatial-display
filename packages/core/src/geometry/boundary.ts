/**
 * Open edges of a mesh of triangles: the lines where its surface stops. A
 * flat polygon has one, an open cylinder two, a sphere none.
 *
 * An edge is open when one triangle only holds it. Vertices that stand at the
 * same place are taken as one, so that a seam in the texture coordinates of a
 * mesh, where its vertices are doubled, is not mistaken for an edge.
 */
import { createOutline, type IOutline } from "./outline.js";

/** Vertices closer than this share of the size of the mesh are one. */
const WELD = 1e-5;

/** Longest mitre of a corner of the line, against the section of a frame: a sharper corner is cut short. */
const LONGEST_MITRE = 3;

const at = (array: ArrayLike<number>, index: number): number => array[index] as number;

/**
 * Finds the open edges of a mesh and returns them as outlines: closed lines,
 * each with the way out of the surface and its normal on every point. The
 * normal is the one Babylon.js gives the front of a face: against the cross
 * product of its edges.
 *
 * `positions` holds 3 numbers per vertex and `indices` 3 per triangle.
 */
export function createMeshOutlines(positions: ArrayLike<number>, indices: ArrayLike<number>): IOutline[] {
  const count = Math.floor(positions.length / 3);
  if (count === 0 || indices.length < 3) return [];

  // --- Vertices at the same place become one.
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < count * 3; i++) {
    const axis = i % 3;
    const value = at(positions, i);
    if (value < at(min, axis)) min[axis] = value;
    if (value > at(max, axis)) max[axis] = value;
  }
  const size = Math.max(at(max, 0) - at(min, 0), at(max, 1) - at(min, 1), at(max, 2) - at(min, 2));
  const cell = size > 0 ? size * WELD : 1;
  const welded = new Int32Array(count);
  /** A vertex of the mesh for each welded one. */
  const sample: number[] = [];
  // The welded vertices of each cell of a grid. Two vertices at the same place may fall on either side of the
  // wall between two cells: a vertex is looked for in its cell and in those around it.
  const cells = new Map<number, number[]>();
  const cellOf = (x: number, y: number, z: number): number => (x * 73856093) ^ (y * 19349663) ^ (z * 83492791);
  for (let vertex = 0; vertex < count; vertex++) {
    const px = at(positions, vertex * 3);
    const py = at(positions, vertex * 3 + 1);
    const pz = at(positions, vertex * 3 + 2);
    const cx = Math.floor(px / cell);
    const cy = Math.floor(py / cell);
    const cz = Math.floor(pz / cell);
    let id = -1;
    for (let around = 0; around < 27 && id < 0; around++) {
      const held = cells.get(cellOf(cx + (around % 3) - 1, cy + (Math.floor(around / 3) % 3) - 1, cz + Math.floor(around / 9) - 1));
      if (!held) continue;
      for (const other of held) {
        const o = at(sample, other) * 3;
        if (Math.abs(at(positions, o) - px) <= cell && Math.abs(at(positions, o + 1) - py) <= cell && Math.abs(at(positions, o + 2) - pz) <= cell) {
          id = other;
          break;
        }
      }
    }
    if (id < 0) {
      id = sample.length;
      sample.push(vertex);
      const key = cellOf(cx, cy, cz);
      const held = cells.get(key);
      if (held) held.push(id);
      else cells.set(key, [id]);
    }
    welded[vertex] = id;
  }
  const placeOf = (id: number): [number, number, number] => {
    const vertex = at(sample, id) * 3;
    return [at(positions, vertex), at(positions, vertex + 1), at(positions, vertex + 2)];
  };

  // --- Each triangle holds its three edges, in the order it is wound.
  const span = sample.length;
  const holders = new Map<number, number>();
  const triangles = Math.floor(indices.length / 3);
  for (let triangle = 0; triangle < triangles; triangle++) {
    const a = at(welded, at(indices, triangle * 3));
    const b = at(welded, at(indices, triangle * 3 + 1));
    const c = at(welded, at(indices, triangle * 3 + 2));
    // A triangle with two corners at the same place has no area: the pole of a sphere is made of those.
    if (a === b || b === c || c === a) continue;
    holders.set(a * span + b, triangle);
    holders.set(b * span + c, triangle);
    holders.set(c * span + a, triangle);
  }

  // --- An edge is open when no triangle holds it the other way round.
  const next = new Map<number, { to: number; triangle: number }>();
  for (const [edge, triangle] of holders) {
    const from = Math.floor(edge / span);
    const to = edge % span;
    if (!holders.has(to * span + from) && !next.has(from)) next.set(from, { to, triangle });
  }

  // --- Open edges follow one another around each hole of the surface.
  const outlines: IOutline[] = [];
  const walked = new Set<number>();
  for (const start of next.keys()) {
    if (walked.has(start)) continue;
    const loop: { from: number; triangle: number }[] = [];
    let here = start;
    for (let step = next.get(here); step && !walked.has(here); step = next.get(here)) {
      walked.add(here);
      loop.push({ from: here, triangle: step.triangle });
      here = step.to;
    }
    // A line that does not come back to where it started is the mark of a mesh that is not a surface there.
    if (here !== start || loop.length < 3) continue;
    outlines.push(outlineOf(loop, indices, welded, placeOf));
  }
  return outlines;
}

/** The outline of a closed line of open edges: `loop` holds, for each edge, the vertex it starts from and the triangle that holds it. */
function outlineOf(
  loop: readonly { from: number; triangle: number }[],
  indices: ArrayLike<number>,
  welded: Int32Array,
  place: (id: number) => [number, number, number],
): IOutline {
  const count = loop.length;
  const outline = createOutline(count, true, "mitre");
  /** For each edge: the way out of its triangle, across the edge, then the normal of that triangle. */
  const away = new Float64Array(count * 3);
  const normal = new Float64Array(count * 3);
  for (let edge = 0; edge < count; edge++) {
    const step = loop[edge] as { from: number; triangle: number };
    const end = (loop[(edge + 1) % count] as { from: number }).from;
    const from = place(step.from);
    const to = place(end);
    const corners = [0, 1, 2].map((k) => at(welded, at(indices, step.triangle * 3 + k)));
    const third = place(corners.find((id) => id !== step.from && id !== end) ?? step.from);
    const d = unit([to[0] - from[0], to[1] - from[1], to[2] - from[2]]);
    // From the edge to the third corner, less what runs along the edge: the way into the triangle.
    const inward = [third[0] - from[0], third[1] - from[1], third[2] - from[2]];
    const along = at(inward, 0) * d[0] + at(inward, 1) * d[1] + at(inward, 2) * d[2];
    const out = unit([-(at(inward, 0) - d[0] * along), -(at(inward, 1) - d[1] * along), -(at(inward, 2) - d[2] * along)]);
    // The corners in the order the triangle is wound: the front of the face looks against this cross product.
    const [a, b, c] = corners.map(place) as [[number, number, number], [number, number, number], [number, number, number]];
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]] as const;
    const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]] as const;
    const front = unit([-(e1[1] * e2[2] - e1[2] * e2[1]), -(e1[2] * e2[0] - e1[0] * e2[2]), -(e1[0] * e2[1] - e1[1] * e2[0])]);
    for (let k = 0; k < 3; k++) {
      away[edge * 3 + k] = at(out, k);
      normal[edge * 3 + k] = at(front, k);
      outline.points[edge * 3 + k] = at(from, k);
    }
  }
  for (let point = 0; point < count; point++) {
    // The edge that ends on the point and the one that starts there.
    const before = ((point - 1 + count) % count) * 3;
    const after = point * 3;
    const dot = at(away, before) * at(away, after) + at(away, before + 1) * at(away, after + 1) + at(away, before + 2) * at(away, after + 2);
    // The vector that moves both edges by one unit when the point moves along it.
    const mitre = 1 / Math.max(1 + dot, 2 / (LONGEST_MITRE * LONGEST_MITRE));
    const facing = unit([at(normal, before) + at(normal, after), at(normal, before + 1) + at(normal, after + 1), at(normal, before + 2) + at(normal, after + 2)]);
    // Two faces folded flat against each other have no normal between them: the one of the edge that starts here stands.
    const folded = facing[0] === 0 && facing[1] === 0 && facing[2] === 0;
    for (let k = 0; k < 3; k++) {
      outline.outward[after + k] = (at(away, before + k) + at(away, after + k)) * mitre;
      outline.normals[after + k] = folded ? at(normal, after + k) : at(facing, k);
    }
  }
  return outline;
}

function unit(vector: readonly number[]): [number, number, number] {
  const x = at(vector, 0);
  const y = at(vector, 1);
  const z = at(vector, 2);
  const length = Math.hypot(x, y, z);
  return length > 0 ? [x / length, y / length, z / length] : [0, 0, 0];
}
