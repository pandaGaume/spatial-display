import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import type { IColor3Like } from "@babylonjs/core/Maths/math.like.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { Scene } from "@babylonjs/core/scene.js";
import {
  createCylinderOutlines,
  createCylinderWall,
  createMeshOutlines,
  createRectOutline,
  writeCylinderOutlines,
  writeCylinderWall,
  writeRectOutline,
  type ICylinderWallOptions,
  type IOutline,
  type ISize2,
} from "@spacexr/spatial-display-core";
import type { ITextureDisplay } from "./display.js";
import type { IDisplaySurfaceOptions } from "./surface.js";

/**
 * The glow of the frame on the far side of a window: walls of light that run
 * from the edges of the opening straight into the world behind it, as the
 * inside of a box. Seen through the opening they give the glow a depth: the
 * wall away from the viewer shows more than the one on their side.
 */
export interface IPortalWorldGlowOptions {
  /** How far the walls run into the world, in the units of the opening. Default: twice the size of the glow of the frame. */
  depth?: number;
  /** Brightness of the light on the walls. Default: 0.7 times the intensity of the glow of the frame. */
  intensity?: number;
  /** How fast the light fades along the walls: 1 for a straight fade, more for a light held close to the frame. Default 2. */
  falloff?: number;
  /** Default: the color of the glow of the frame, which it then follows. */
  color?: Readonly<IColor3Like>;
}

export interface IPortalWindowOptions {
  /**
   * Where the opening stands in the scene the display shows: a node of that
   * scene, whose frame is the one of the opening. The scene lies behind it:
   * toward +z in a left-handed scene, toward -z in a right-handed one. Its
   * scale sizes the world against the opening. Default: the origin of the
   * scene, unturned; or the portal itself when its display shows the very
   * scene the portal stands in. The opening then gives onto what stands
   * behind it, drawn as its display draws it: with other layers, or another
   * material.
   */
  anchor?: TransformNode;
  /**
   * Light on the far side of the opening; false for none. Default: the glow
   * of the frame carries on there, when the portal has one. Given as options,
   * the light is set even behind a portal with no glow.
   */
  glow?: false | Readonly<IPortalWorldGlowOptions>;
}

/**
 * What a surface of a portal shows, and how. The surface carries its display:
 * a mesh that shows nothing is not a surface yet.
 */
export interface IPortalSurfaceOptions extends Omit<IDisplaySurfaceOptions, "aspect" | "alwaysBlended"> {
  /** What the surface shows. Without a display it is empty until `portal.display` is given one. */
  display?: ITextureDisplay;
  /**
   * Pixels of the image per world unit. When given, the display is resized
   * with the surface so that its image keeps that density and the proportions
   * of the surface. Each change of size then allocates a new render target:
   * leave it out for a surface whose size is animated.
   */
  pixelsPerUnit?: number;
}

/**
 * The surface of a portal: the mesh that shows its image, and the lines its
 * frame runs along.
 */
export interface IPortalSurface {
  /**
   * What the application places, turns and parents: a node of its own for a
   * surface the library builds, the mesh itself for a mesh of the application.
   */
  readonly root: TransformNode;
  /**
   * The mesh that shows the image. It is `root`, or a child of `root` that is
   * neither moved, turned nor scaled: the outlines are counted in the space of
   * `root`, where the frame is set.
   */
  readonly mesh: AbstractMesh;
  /** True for a mesh the surface built: the portal hides it while it shows nothing, and it goes with the surface. */
  readonly ownsMesh: boolean;
  /** Size of the surface, in world units: the one of the rectangle it is rolled from, for a surface that is bent. */
  readonly dimension: Readonly<ISize2>;
  /** The lines the frame runs along; none for a surface with no edge, as a sphere. `setDimension` rewrites them in place. */
  readonly outlines: readonly IOutline[];
  /** What the surface was asked to show, and how. */
  readonly options: Readonly<IPortalSurfaceOptions>;
  /** Given by a surface that was asked to be a window. Only a flat rectangle can be one. */
  readonly window?: Readonly<IPortalWindowOptions> | null;
  /** Changes the size of the surface, in world units. Left out by a surface that keeps the size of its mesh. */
  setDimension?(width: number, height: number): void;
  /** Releases what the surface built. A mesh of the application is left as it is. */
  dispose(): void;
}

/** What builds the surface of a portal: `PortalBuilder.withSurface` takes one, or a mesh. */
export interface IPortalSurfaceBuilder {
  /** `name` is the one of the portal, and `scene` the one it stands in. */
  build(name: string, scene: Scene): IPortalSurface;
}

const worldUnits = (value: number): number => (Number.isFinite(value) ? Math.max(0, value) : 0);

// ---------------------------------------------------------------------------
// Rectangle

export interface IRectSurfaceOptions extends IPortalSurfaceOptions {
  /** Size of the rectangle, in world units. The frame goes around it. */
  width: number;
  height: number;
  /**
   * Makes the portal a window: its image is what the viewer sees through the
   * rectangle, as if it were an opening onto the scene of its display, and
   * follows the viewer as they move. It needs a display that can be a window,
   * as a `CameraDisplay`; with another one the portal stays a screen. The
   * image then always fills the opening: `fit` does not apply. Default: a screen.
   */
  window?: boolean | Readonly<IPortalWindowOptions>;
}

/**
 * A flat rectangle, centred on the node of the portal and in its xy plane.
 * Facing its front, the local x axis reads to the right and the y axis upward:
 * the front looks toward -z in a left-handed scene, as the planes of
 * Babylon.js, and toward +z in a right-handed one.
 */
export class RectSurfaceBuilder implements IPortalSurfaceBuilder {
  private readonly options: Readonly<IRectSurfaceOptions>;

  constructor(options: Readonly<IRectSurfaceOptions>) {
    this.options = options;
  }

  build(name: string, scene: Scene): IPortalSurface {
    return new RectSurface(name, scene, this.options);
  }
}

class RectSurface implements IPortalSurface {
  readonly root: TransformNode;
  readonly mesh: Mesh;
  readonly ownsMesh = true;
  readonly dimension: ISize2;
  readonly outlines: readonly [IOutline];
  readonly options: Readonly<IPortalSurfaceOptions>;
  readonly window: Readonly<IPortalWindowOptions> | null;

  private readonly positions = new Float32Array(12);

  constructor(name: string, scene: Scene, options: Readonly<IRectSurfaceOptions>) {
    this.options = options;
    this.window = options.window ? (options.window === true ? {} : options.window) : null;
    this.dimension = { width: worldUnits(options.width), height: worldUnits(options.height) };
    this.outlines = [createRectOutline(this.dimension.width, this.dimension.height)];
    this.root = new TransformNode(name, scene);

    const rightHanded = scene.useRightHandedSystem;
    const front = rightHanded ? 1 : -1;
    this.fill();
    const mesh = new Mesh(`${name}.screen`, scene, this.root);
    // The positions are rewritten at each change of size.
    mesh.setVerticesData(VertexBuffer.PositionKind, this.positions, true);
    mesh.setVerticesData(VertexBuffer.NormalKind, [0, 0, front, 0, 0, front, 0, 0, front, 0, 0, front]);
    mesh.setVerticesData(VertexBuffer.UVKind, [0, 0, 1, 0, 1, 1, 0, 1]);
    mesh.setIndices(rightHanded ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]);
    this.mesh = mesh;
  }

  setDimension(width: number, height: number): void {
    this.dimension.width = worldUnits(width);
    this.dimension.height = worldUnits(height);
    this.fill();
    this.mesh.updateVerticesData(VertexBuffer.PositionKind, this.positions);
    this.mesh.refreshBoundingInfo();
    writeRectOutline(this.outlines[0], this.dimension.width, this.dimension.height);
  }

  dispose(): void {
    this.root.dispose();
  }

  private fill(): void {
    const x = this.dimension.width / 2;
    const y = this.dimension.height / 2;
    this.positions.set([-x, -y, 0, x, -y, 0, x, y, 0, -x, y, 0]);
  }
}

// ---------------------------------------------------------------------------
// Cylinder

export interface ICylinderSurfaceOptions extends IPortalSurfaceOptions {
  /** Diameter of the wall, in world units. */
  diameter: number;
  /** Height of the wall, in world units. */
  height: number;
  /** Share of a whole turn the wall covers, above 0 and up to 1. Default 1: a ring. Less makes a bent screen. */
  arc?: number;
  /** Number of sides of a whole turn. Default 64. */
  tessellation?: number;
  /**
   * The face of the wall that shows the image. "outside" (default): the wall
   * bulges toward who faces the portal. "inside": the wall bends around them,
   * as a curved monitor does. `doubleSided` shows the image on the other face too.
   */
  facing?: "outside" | "inside";
}

/**
 * The wall of a cylinder around the y axis of the node of the portal, with no
 * cap: a ring, or a bent screen with `arc`. Its frame runs along its two
 * rims, or all around a bent screen.
 *
 * The middle of the wall stands where the front of a flat portal looks: toward
 * -z in a left-handed scene, toward +z in a right-handed one; behind the node
 * for a wall that shows its inside. The image is rolled with the wall: its
 * width follows the turn, and reads the right way round from the front.
 *
 * As a physical display, its width is the length of the turn and its height
 * the one of the wall: `portal.setDimension()` changes the diameter with the
 * width. A wall cannot be a window. With a display that is a lens, it shows
 * what stands behind it from every side.
 */
export class CylinderSurfaceBuilder implements IPortalSurfaceBuilder {
  private readonly options: Readonly<ICylinderSurfaceOptions>;

  constructor(options: Readonly<ICylinderSurfaceOptions>) {
    this.options = options;
  }

  build(name: string, scene: Scene): IPortalSurface {
    return new CylinderSurface(name, scene, this.options);
  }
}

class CylinderSurface implements IPortalSurface {
  readonly root: TransformNode;
  readonly mesh: Mesh;
  readonly ownsMesh = true;
  readonly dimension: ISize2;
  readonly outlines: readonly IOutline[];
  readonly options: Readonly<IPortalSurfaceOptions>;

  private readonly wall: ICylinderWallOptions & { arc: number };
  private readonly positions: Float32Array;

  constructor(name: string, scene: Scene, options: Readonly<ICylinderSurfaceOptions>) {
    this.options = options;
    const front = scene.useRightHandedSystem ? 1 : -1;
    const inside = options.facing === "inside";
    const arc = Math.min(1, Math.max(1e-4, options.arc ?? 1));
    this.wall = {
      radius: worldUnits(options.diameter) / 2,
      height: worldUnits(options.height),
      arc,
      tessellation: options.tessellation ?? 64,
      // A wall that shows its inside stands behind the node, and bends around who faces the portal.
      middle: (inside ? -front : front) as 1 | -1,
      inward: inside,
    };
    this.dimension = { width: 2 * Math.PI * this.wall.radius * arc, height: this.wall.height };
    this.outlines = createCylinderOutlines(this.wall);
    this.root = new TransformNode(name, scene);

    const geometry = createCylinderWall(this.wall);
    this.positions = geometry.positions;
    const mesh = new Mesh(`${name}.screen`, scene, this.root);
    // The positions are rewritten at each change of size.
    mesh.setVerticesData(VertexBuffer.PositionKind, geometry.positions, true);
    mesh.setVerticesData(VertexBuffer.NormalKind, geometry.normals);
    mesh.setVerticesData(VertexBuffer.UVKind, geometry.uvs);
    mesh.setIndices(geometry.indices);
    this.mesh = mesh;
  }

  /** `width` is the length of the turn: the diameter follows it. */
  setDimension(width: number, height: number): void {
    this.dimension.width = worldUnits(width);
    this.dimension.height = worldUnits(height);
    this.wall.radius = this.dimension.width / (2 * Math.PI * this.wall.arc);
    this.wall.height = this.dimension.height;
    writeCylinderWall(this.wall, this.positions);
    this.mesh.updateVerticesData(VertexBuffer.PositionKind, this.positions);
    this.mesh.refreshBoundingInfo();
    writeCylinderOutlines(this.wall, this.outlines);
  }

  dispose(): void {
    this.root.dispose();
  }
}

// ---------------------------------------------------------------------------
// A mesh of the application

export interface IMeshSurfaceOptions extends IPortalSurfaceOptions {
  /**
   * The lines the frame of the portal runs along, in the space of the mesh.
   * Default: the open edges of the mesh, found from its triangles; a mesh
   * with no edge, as a sphere, gets no frame.
   */
  outlines?: readonly IOutline[];
}

/**
 * A mesh the application already has, of any shape: it needs texture
 * coordinates, and a material of its own (not an instance). The portal gives
 * it its image and sets its frame on it; it does not own it. The mesh is the
 * node of the portal: the application places it as it did before, and gets
 * its former material back when the portal is disposed.
 *
 * The frame is counted in the space of the mesh: a mesh that is scaled
 * thickens its tube. The light and the glow keep their size.
 */
export class MeshSurfaceBuilder implements IPortalSurfaceBuilder {
  private readonly mesh: AbstractMesh;
  private readonly options: Readonly<IMeshSurfaceOptions>;

  constructor(mesh: AbstractMesh, options: Readonly<IMeshSurfaceOptions> = {}) {
    this.mesh = mesh;
    this.options = options;
  }

  build(_name: string, scene: Scene): IPortalSurface {
    if (this.mesh.getScene() !== scene) throw new Error(`spatial-display: mesh "${this.mesh.name}" is not of the scene its portal is built in.`);
    return new MeshSurface(this.mesh, this.options);
  }
}

class MeshSurface implements IPortalSurface {
  readonly root: AbstractMesh;
  readonly mesh: AbstractMesh;
  readonly ownsMesh = false;
  readonly dimension: ISize2;
  readonly options: Readonly<IMeshSurfaceOptions>;

  private edges: readonly IOutline[] | null;

  constructor(mesh: AbstractMesh, options: Readonly<IMeshSurfaceOptions>) {
    this.root = mesh;
    this.mesh = mesh;
    this.options = options;
    this.edges = options.outlines ?? null;
    // As a surface reads its proportions: the extent along x, and along y, or along z for a mesh that is flat along y.
    const extend = mesh.getBoundingInfo().boundingBox.extendSize;
    const epsilon = 1e-6 * Math.max(extend.x, extend.y, extend.z);
    this.dimension = { width: 2 * extend.x, height: 2 * (extend.y > epsilon ? extend.y : extend.z) };
  }

  /** Found when first asked for: a portal with no frame never looks for the edges of its mesh. */
  get outlines(): readonly IOutline[] {
    if (!this.edges) {
      const positions = this.mesh.getVerticesData(VertexBuffer.PositionKind);
      const indices = this.mesh.getIndices();
      this.edges = positions && indices ? createMeshOutlines(positions, indices) : [];
    }
    return this.edges;
  }

  dispose(): void {}
}
