/**
 * Walls of a rectangular tunnel: four rectangles that run from the edges of an
 * opening, in the xy plane and centred on the origin, straight along z. They
 * are the inside of a box with no front and no back.
 *
 * A portal sets them on the far side of its opening, with a light that fades
 * along their depth: seen through the opening they give the glow of the frame
 * a depth, the wall away from the viewer showing more than the one on his side.
 *
 * Texture coordinates: u runs once around the opening, from 0 to 1; v runs
 * along the depth, from 0 on the opening to 1 at the end of the walls.
 */

export interface IRectTunnelOptions {
  /** Size of the opening the walls start from. */
  width: number;
  height: number;
  /** How far the walls run along +z; negative to run along -z. */
  depth: number;
}

export interface IRectTunnelGeometry {
  /** 3 numbers per vertex. */
  positions: Float32Array;
  /** 3 numbers per vertex: they point inward. */
  normals: Float32Array;
  /** 2 numbers per vertex. */
  uvs: Float32Array;
  indices: Uint16Array;
}

const WALLS = 4;

export const RECT_TUNNEL_VERTEX_COUNT = WALLS * 4;
export const RECT_TUNNEL_INDEX_COUNT = WALLS * 6;

/** Signs of the four corners, counter-clockwise when x reads to the right and y upward. */
const CORNER_X = [-1, 1, 1, -1] as const;
const CORNER_Y = [-1, -1, 1, 1] as const;
/** Inward direction of the wall that starts at each corner. */
const INWARD_X = [0, -1, 0, 1] as const;
const INWARD_Y = [1, 0, -1, 0] as const;

/**
 * Writes the positions, and the texture coordinates when `uvs` is given, of
 * the walls into arrays of `RECT_TUNNEL_VERTEX_COUNT` vertices.
 */
export function writeRectTunnel(options: Readonly<IRectTunnelOptions>, positions: Float32Array, uvs?: Float32Array): void {
  const x = options.width / 2;
  const y = options.height / 2;
  const perimeter = 2 * (options.width + options.height);
  const stops = perimeter > 0 ? [0, options.width / perimeter, (options.width + options.height) / perimeter, (2 * options.width + options.height) / perimeter, 1] : [0, 0.25, 0.5, 0.75, 1];
  let p = 0;
  let t = 0;
  for (let wall = 0; wall < WALLS; wall++) {
    const next = (wall + 1) % WALLS;
    for (let v = 0; v < 4; v++) {
      // Along the opening, then back along the end of the wall.
      const atEnd = v === 1 || v === 2;
      const deep = v >= 2;
      const corner = atEnd ? next : wall;
      positions[p++] = (CORNER_X[corner] as number) * x;
      positions[p++] = (CORNER_Y[corner] as number) * y;
      positions[p++] = deep ? options.depth : 0;
      if (!uvs) continue;
      uvs[t++] = stops[atEnd ? wall + 1 : wall] as number;
      uvs[t++] = deep ? 1 : 0;
    }
  }
}

/** Builds the vertex data of the walls. They are meant to be drawn from both sides. */
export function createRectTunnel(options: Readonly<IRectTunnelOptions>): IRectTunnelGeometry {
  const positions = new Float32Array(RECT_TUNNEL_VERTEX_COUNT * 3);
  const normals = new Float32Array(RECT_TUNNEL_VERTEX_COUNT * 3);
  const uvs = new Float32Array(RECT_TUNNEL_VERTEX_COUNT * 2);
  const indices = new Uint16Array(RECT_TUNNEL_INDEX_COUNT);
  let n = 0;
  let i = 0;
  for (let wall = 0; wall < WALLS; wall++) {
    for (let v = 0; v < 4; v++) {
      normals[n++] = INWARD_X[wall] as number;
      normals[n++] = INWARD_Y[wall] as number;
      normals[n++] = 0;
    }
    const first = wall * 4;
    indices[i++] = first; indices[i++] = first + 1; indices[i++] = first + 2;
    indices[i++] = first; indices[i++] = first + 2; indices[i++] = first + 3;
  }
  writeRectTunnel(options, positions, uvs);
  return { positions, normals, uvs, indices };
}
