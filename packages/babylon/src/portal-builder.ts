import type { IColor3Like } from "@babylonjs/core/Maths/math.like.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { IPortalSurfaceBuilder } from "./portal-surface.js";
import { Portal, type IPortalFrameOptions, type IPortalGlowOptions, type IPortalLightOptions } from "./portal.js";

/**
 * Builds a portal step by step: a surface, then what it wears on its edges.
 *
 * ```ts
 * const portal = new PortalBuilder("gate", scene)
 *   .withSurface(new RectSurfaceBuilder({ width: 1.6, height: 0.9, display }))
 *   .withFrame(true)
 *   .withLight(true)
 *   .withGlow({ size: 0.2 })
 *   .build();
 * ```
 *
 * Only the surface is needed. A portal has no frame, no light and no glow
 * unless it is asked for them.
 */
export class PortalBuilder {
  private readonly name: string;
  private readonly scene: Scene;
  private surface: AbstractMesh | IPortalSurfaceBuilder | null = null;
  private frame: boolean | IPortalFrameOptions = false;
  private light: boolean | IPortalLightOptions = false;
  private glow: boolean | Readonly<IPortalGlowOptions> = false;

  /** `name` is given to the node of the portal and starts the names of its meshes; `scene` is the one it stands in. */
  constructor(name: string, scene: Scene) {
    this.name = name;
    this.scene = scene;
  }

  /**
   * What the portal shows its image on: a mesh of the application, which
   * the portal does not own, or what builds one: `RectSurfaceBuilder` for a
   * flat rectangle, `CylinderSurfaceBuilder` for a ring or a bent screen,
   * `MeshSurfaceBuilder` for a mesh with a display and options of its own.
   * The surface carries its display.
   */
  withSurface(surface: AbstractMesh | IPortalSurfaceBuilder): this {
    this.surface = surface;
    return this;
  }

  /** A tube of square section along the edges of the surface; `section` is its side, in world units (0.012 by default). */
  withFrame(on = true, section?: number): this {
    this.frame = on && section !== undefined ? { section } : on;
    return this;
  }

  /**
   * Lights the edges of the surface, in `color` (white by default): the frame
   * becomes a line of light, or a hairline is drawn where there is no frame.
   */
  withLight(on = true, color?: Readonly<IColor3Like>): this {
    this.light = on && color ? { color } : on;
    return this;
  }

  /** A glow on both sides of the edges of the surface: true for the default one, or its color, its size, its intensity. */
  withGlow(glow: boolean | Readonly<IPortalGlowOptions> = true): this {
    this.glow = glow;
    return this;
  }

  /** Builds the portal. Each call builds another one: a builder whose surface is a mesh serves once. */
  build(): Portal {
    if (!this.surface) throw new Error("spatial-display: a portal needs a surface: call withSurface() before build().");
    return new Portal(this.name, this.scene, { surface: this.surface, frame: this.frame, light: this.light, glow: this.glow });
  }
}
