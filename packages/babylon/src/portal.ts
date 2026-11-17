import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture.js";
import { Texture } from "@babylonjs/core/Materials/Textures/texture.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import type { IColor3Like, IColor4Like } from "@babylonjs/core/Maths/math.like.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { Observer } from "@babylonjs/core/Misc/observable.js";
import type { Scene } from "@babylonjs/core/scene.js";
import {
  PhysicalDisplay,
  createFrame,
  createFrameHalo,
  createRectTunnel,
  writeFrame,
  writeFrameHalo,
  writeRectTunnel,
  type DisplayFit,
  type IFrameGeometry,
  type IFrameHaloGeometry,
  type IRectTunnelGeometry,
} from "@spacexr/spatial-display-core";
import { WINDOW_LAYER_MASK, type IDisplayChange, type ITextureDisplay } from "./display.js";
import type { IChromaKey } from "./materials/display-material.js";
import { NEON_BLUE, NEON_WHITE, NeonMaterial, type INeonFlow } from "./materials/neon-material.js";
import { MeshSurfaceBuilder, type IPortalSurface, type IPortalSurfaceBuilder, type IPortalWindowOptions, type IPortalWorldGlowOptions } from "./portal-surface.js";
import { DisplaySurface, type IDisplaySurfaceOptions } from "./surface.js";

/** The frame of a portal: a tube of square section that runs along the edges of its surface. */
export interface IPortalFrameOptions {
  /** Side of the square section of the tube, in world units. Default 0.012. */
  section?: number;
  /** Color of the tube while it is not lit: it then takes the light of the scene, as any solid. Default: a dark gray. */
  color?: Readonly<IColor3Like>;
}

/** The light of a portal: a line along the edges of its surface. */
export interface IPortalLightOptions {
  /** Color of the line. Default white. */
  color?: Readonly<IColor3Like>;
  /** Smallest width of the line on screen, in pixels: from afar, or with no frame to give it a body, the line stays a hairline. Default 1.5. */
  minWidth?: number;
}

/** The glow of a portal: a light that spreads on both sides of the edges of its surface. */
export interface IPortalGlowOptions {
  /** Default: an electric blue. */
  color?: Readonly<IColor3Like>;
  /** How far the glow reaches from the edge, in world units. Default 0.18. */
  size?: number;
  /** Brightness of the glow. It does not widen it. Default 1.4. */
  intensity?: number;
  /** How fast the glow fades away from the edge: 1 for a straight fade, more for a light held close to it. Default 2.5. */
  falloff?: number;
  /**
   * How much the glow hides what stands behind it, from 0 to 1. At 0 it only
   * adds to the background, as light does, and is lost on a bright one. At 1
   * (default) it tints the background, so that it reads on any color.
   */
  cover?: number;
  /** Waves of light that travel along the edges. Default: a steady light. */
  flow?: Partial<INeonFlow>;
}

export interface IPortalOptions {
  /**
   * What the portal shows its image on: a mesh of the application, or what
   * builds one (`RectSurfaceBuilder`, `CylinderSurfaceBuilder`,
   * `MeshSurfaceBuilder`). The surface carries its display and the way to
   * show it.
   */
  surface: AbstractMesh | IPortalSurfaceBuilder;
  /** A tube of square section along the edges of the surface. Default: none. */
  frame?: boolean | Readonly<IPortalFrameOptions>;
  /**
   * Lights the edges of the surface: the frame becomes a line of light, or,
   * with no frame, a hairline is drawn along them. Default: none; a frame is
   * then a plain solid.
   */
  light?: boolean | Readonly<IPortalLightOptions>;
  /** A glow that spreads on both sides of the edges of the surface. Default: none. */
  glow?: boolean | Readonly<IPortalGlowOptions>;
}

/**
 * A surface that shows a display, dressed on its edges with what it is asked
 * for: a frame, a light, a glow. None of them is there by default.
 *
 * - The frame is a tube of square section that stands against the edges of
 *   the surface: around a rectangle, along the two rims of a cylinder, along
 *   the open edges of a mesh. A surface with no edge, as a sphere, has none.
 * - The light makes that tube a line of light. With no frame it draws a
 *   hairline along the edges.
 * - The glow spreads on both sides of the edges. The image of the surface is
 *   drawn over it: the glow shows around the surface, and through an image
 *   that is see-through.
 *
 * `PortalBuilder` builds one step by step. The surface is a flat rectangle
 * (`RectSurfaceBuilder`), the wall of a cylinder (`CylinderSurfaceBuilder`),
 * or a mesh of the application.
 *
 * A portal is a screen by default: its image is glued to its surface. A flat
 * rectangle can be a window instead (`window` in its options): it gives onto
 * the scene of its display, the image follows the eye of the viewer, and the
 * glow carries on behind the opening, on walls of light that run into that scene.
 *
 * A portal is a physical display. `setDimension` changes the size of its
 * surface, in world units, and `resize` the size of its image, in pixels. Its
 * resolution is the one of the display it shows: showing a display takes its
 * resolution, and resizing the portal resizes that display.
 *
 * `root` is what the application places, turns and parents. It should keep a
 * scale of 1: the surface changes size through `setDimension`, which keeps the
 * section of the frame.
 */
export class Portal extends PhysicalDisplay {
  readonly root: TransformNode;
  /** The mesh that shows the image. */
  readonly screen: AbstractMesh;

  private readonly name: string;
  private readonly scene: Scene;
  private readonly surface: IPortalSurface;
  private readonly look: IPortalLook;
  private frameOn: boolean;
  private lightOn: boolean;
  private glowOn: boolean;
  private tube: ITube | null = null;
  private ribbon: IRibbon | null = null;
  private readonly surfaceOptions: IDisplaySurfaceOptions;
  /** null for a screen. */
  private readonly windowOptions: Readonly<IPortalWindowOptions> | null;
  private readonly worldGlowOptions: IPortalWorldGlowOptions;
  private worldGlowState: IWorldGlow | null = null;
  private shown: DisplaySurface | null = null;
  private displayObserver: Observer<IDisplayChange> | null = null;
  private _display: ITextureDisplay | null = null;

  constructor(name: string, scene: Scene, options: Readonly<IPortalOptions>) {
    const given = options.surface;
    const surface = (isMesh(given) ? new MeshSurfaceBuilder(given) : given).build(name, scene);
    const shown = surface.options;
    super({
      width: surface.dimension.width,
      height: surface.dimension.height,
      maxResolution: scene.getEngine().getCaps().maxTextureSize,
      ...(shown.pixelsPerUnit !== undefined ? { pixelsPerUnit: shown.pixelsPerUnit } : {}),
    });
    this.name = name;
    this.scene = scene;
    this.surface = surface;
    this.root = surface.root;
    this.screen = surface.mesh;

    const frame = typeof options.frame === "object" ? options.frame : {};
    const light = typeof options.light === "object" ? options.light : {};
    const glow = typeof options.glow === "object" ? options.glow : {};
    this.frameOn = !!options.frame;
    this.lightOn = !!options.light;
    this.glowOn = !!options.glow;
    this.look = {
      section: Math.max(0, frame.section ?? 0.012),
      frameColor: copyColor(frame.color ?? FRAME_GRAY),
      lineColor: copyColor(light.color ?? NEON_WHITE),
      minLineWidth: Math.max(0, light.minWidth ?? 1.5),
      glowColor: copyColor(glow.color ?? NEON_BLUE),
      glowSize: Math.max(0, glow.size ?? 0.18),
      glowIntensity: Math.max(0, glow.intensity ?? 1.4),
      glowFalloff: glow.falloff ?? 2.5,
      cover: glow.cover ?? 1,
      flow: { amplitude: 0, waves: 4, speed: 1.5, ...glow.flow },
    };

    this.windowOptions = surface.window ?? null;
    this.worldGlowOptions = { ...(this.windowOptions?.glow || {}) };
    this.surfaceOptions = {
      opacity: shown.opacity ?? 1,
      // The image of a window is the opening itself.
      fit: this.windowOptions ? "stretch" : (shown.fit ?? "stretch"),
      doubleSided: shown.doubleSided ?? false,
      ...(shown.useImageAlpha !== undefined ? { useImageAlpha: shown.useImageAlpha } : {}),
      ...(shown.chromaKey ? { chromaKey: shown.chromaKey } : {}),
      ...(shown.border ? { border: shown.border } : {}),
      ...(shown.backColor ? { backColor: shown.backColor } : {}),
    };

    this.dress();
    this.display = shown.display ?? null;
  }

  /** The tube along the edges of the surface: an opaque mesh. null for a portal with no frame, or whose surface has no edge. */
  get frame(): AbstractMesh | null {
    return this.tube?.mesh ?? null;
  }

  /** The mesh that draws the light and the glow of the edges, under the image. null for a portal with neither. */
  get glow(): AbstractMesh | null {
    return this.ribbon?.mesh ?? null;
  }

  /**
   * Material of the light and of the glow: it also holds their `glowFalloff`,
   * their `cover`, and `flow` for waves of light that travel along the edges.
   * null for a portal with neither light nor glow.
   */
  get neon(): NeonMaterial | null {
    return this.ribbon?.material ?? null;
  }

  /** Whether the portal has a frame. See `IPortalOptions.frame`. */
  get framed(): boolean {
    return this.frameOn;
  }

  set framed(value: boolean) {
    if (value === this.frameOn) return;
    this.frameOn = value;
    this.dress();
  }

  /** Whether the edges of the surface are lit. See `IPortalOptions.light`. */
  get lit(): boolean {
    return this.lightOn;
  }

  set lit(value: boolean) {
    if (value === this.lightOn) return;
    this.lightOn = value;
    this.dress();
  }

  /** Whether the edges of the surface glow. See `IPortalOptions.glow`. */
  get glowing(): boolean {
    return this.glowOn;
  }

  set glowing(value: boolean) {
    if (value === this.glowOn) return;
    this.glowOn = value;
    this.dress();
    // The light behind a window is the glow of the frame carried on.
    if (this._display) this.buildWorldGlow(this._display);
  }

  /** Side of the square section of the frame, in world units. */
  get frameSection(): number {
    return this.look.section;
  }

  set frameSection(value: number) {
    value = Math.max(0, value);
    if (value === this.look.section) return;
    this.look.section = value;
    this.layout();
  }

  /** Color of the frame while it is not lit. */
  get frameColor(): Readonly<IColor3Like> {
    return this.look.frameColor;
  }

  set frameColor(value: Readonly<IColor3Like>) {
    this.look.frameColor = copyColor(value);
    this.paint();
  }

  /** Color of the line of light. */
  get lineColor(): Readonly<IColor3Like> {
    return this.look.lineColor;
  }

  set lineColor(value: Readonly<IColor3Like>) {
    this.look.lineColor = copyColor(value);
    this.paint();
  }

  /**
   * How far the glow reaches from the edges, in world units. Set it here
   * rather than on `neon`: the portal makes room for the glow in the bounds of
   * the mesh that draws it.
   */
  get glowSize(): number {
    return this.look.glowSize;
  }

  set glowSize(value: number) {
    this.look.glowSize = Math.max(0, value);
    this.paint();
    this.layout();
  }

  /** Brightness of the glow. */
  get glowIntensity(): number {
    return this.look.glowIntensity;
  }

  set glowIntensity(value: number) {
    this.look.glowIntensity = Math.max(0, value);
    this.paint();
  }

  /** Color of the glow. */
  get glowColor(): Readonly<IColor3Like> {
    return this.look.glowColor;
  }

  set glowColor(value: Readonly<IColor3Like>) {
    this.look.glowColor = copyColor(value);
    this.paint();
  }

  /** True when the portal is a window onto the scene of its display. */
  get isWindow(): boolean {
    return this.windowOptions !== null;
  }

  /** The walls of light behind the opening of a window, in the scene its display shows; null when there are none. */
  get worldGlow(): AbstractMesh | null {
    return this.worldGlowState?.mesh ?? null;
  }

  /** How far the light runs into the world behind a window. See `IPortalWorldGlowOptions.depth`. */
  get worldGlowDepth(): number {
    return this.worldGlowOptions.depth ?? this.look.glowSize * 2;
  }

  set worldGlowDepth(value: number) {
    this.worldGlowOptions.depth = Math.max(0, value);
    this.layout();
  }

  /** Brightness of the light behind a window. See `IPortalWorldGlowOptions.intensity`. */
  get worldGlowIntensity(): number {
    return this.worldGlowOptions.intensity ?? this.look.glowIntensity * 0.7;
  }

  set worldGlowIntensity(value: number) {
    this.worldGlowOptions.intensity = Math.max(0, value);
    this.paintWorldGlow();
  }

  /** What the surface shows; null for an empty one. The portal does not own its display. */
  get display(): ITextureDisplay | null {
    return this._display;
  }

  set display(value: ITextureDisplay | null) {
    if (value === this._display) return;
    const previous = this._display;
    if (previous && this.displayObserver) previous.onChangedObservable.remove(this.displayObserver);
    this.displayObserver = null;
    if (previous && this.windowOptions) previous.setWindow?.(null);
    for (const mesh of this.dressing()) previous?.removeSurface?.(mesh);
    this.disposeWorldGlow();
    this._display = value;
    if (!value) {
      this.shown?.dispose();
      this.shown = null;
    } else {
      if (this.shown) this.shown.display = value;
      else this.shown = new DisplaySurface(this.screen, value, { ...this.surfaceOptions, alwaysBlended: this.ribbon !== null, aspect: this.aspect });
      this.displayObserver = value.onChangedObservable.add((change) => {
        if (change.kind === "disposed") this.display = null;
        else if (change.kind === "resolution") this.takeResolution(value);
        // The display shows another scene: the light behind the opening moves there.
        else if (change.kind === "texture") this.buildWorldGlow(value);
      });
      // The frame belongs to the portal as its surface does: a display does not show the portal it is shown in.
      for (const mesh of this.dressing()) value.addSurface?.(mesh);
      if (this.windowOptions) {
        value.setWindow?.(this, this.anchorIn(value));
        this.buildWorldGlow(value);
      }
      // A portal that keeps a density of pixels gives its resolution to a display that can take it.
      if (this.pixelsPerUnit !== undefined && value.resize) this.onResized();
      this.takeResolution(value);
    }
    this.updateScreen();
  }

  /** Opacity of the image: 1 opaque, 0 invisible. */
  get opacity(): number {
    return this.surfaceOptions.opacity ?? 1;
  }

  set opacity(value: number) {
    this.surfaceOptions.opacity = Math.min(1, Math.max(0, value));
    if (this.shown) this.shown.opacity = this.surfaceOptions.opacity;
  }

  /** Whether the image shows on the back faces of the surface too: the back of a rectangle, the inside of a ring. */
  get doubleSided(): boolean {
    return this.surfaceOptions.doubleSided ?? false;
  }

  set doubleSided(value: boolean) {
    this.surfaceOptions.doubleSided = value;
    if (this.shown) this.shown.doubleSided = value;
  }

  /**
   * Color of the back faces of the surface, which then show no image: the
   * plain back of a screen, the inside of a ring. null for none.
   */
  get backColor(): Readonly<IColor4Like> | null {
    return this.surfaceOptions.backColor ?? null;
  }

  set backColor(value: Readonly<IColor4Like> | null) {
    if (value) this.surfaceOptions.backColor = value;
    else delete this.surfaceOptions.backColor;
    if (this.shown) this.shown.backColor = value;
  }

  get fit(): DisplayFit {
    return this.surfaceOptions.fit ?? "stretch";
  }

  set fit(value: DisplayFit) {
    // The image of a window is the opening itself.
    if (this.windowOptions) return;
    this.surfaceOptions.fit = value;
    if (this.shown) this.shown.fit = value;
  }

  /** See `IDisplaySurfaceOptions.useImageAlpha`; undefined when the portal follows what the texture of its display says. */
  get useImageAlpha(): boolean | undefined {
    return this.surfaceOptions.useImageAlpha;
  }

  set useImageAlpha(value: boolean | undefined) {
    if (value === undefined) delete this.surfaceOptions.useImageAlpha;
    else this.surfaceOptions.useImageAlpha = value;
    if (this.shown) this.shown.useImageAlpha = value;
  }

  /** A color of the image to let through; null for none. */
  get chromaKey(): Readonly<IChromaKey> | null {
    return this.surfaceOptions.chromaKey ?? null;
  }

  set chromaKey(value: Readonly<IChromaKey> | null) {
    if (value) this.surfaceOptions.chromaKey = value;
    else delete this.surfaceOptions.chromaKey;
    if (this.shown) this.shown.chromaKey = value;
  }

  /**
   * Changes the size of the surface, in world units. A mesh of the
   * application keeps its size: the application scales it itself.
   */
  override setDimension(width: number, height: number): void {
    if (!this.surface.setDimension) return;
    super.setDimension(width, height);
  }

  /**
   * Releases what the portal built: its frame, its glow, and its surface when
   * the portal built it. Its display is left as it is, and a mesh of the
   * application gets its former material back.
   */
  override dispose(): void {
    this.display = null;
    this.setTube(false);
    this.setRibbon(false);
    this.surface.dispose();
    super.dispose();
  }

  /** The image changed size: so does the display that draws it, when it can. */
  protected override onResized(): void {
    const display = this._display;
    if (!display?.resize) return;
    const { width, height } = this.resolution;
    if (width > 0 && height > 0 && (width !== display.resolution.width || height !== display.resolution.height)) display.resize(width, height);
  }

  protected override onDimensionChanged(): void {
    this.surface.setDimension?.(this.width, this.height);
    this.layout();
  }

  /** The resolution of a portal is the one of its display. */
  private takeResolution(display: ITextureDisplay): void {
    this.resize(display.resolution.width, display.resolution.height);
  }

  /** The meshes the portal sets on the edges of its surface. */
  private dressing(): Mesh[] {
    const meshes: Mesh[] = [];
    if (this.tube) meshes.push(this.tube.mesh);
    if (this.ribbon) meshes.push(this.ribbon.mesh);
    return meshes;
  }

  /** Builds what the portal is asked to wear and is not there yet, and lets go of what it no longer wears. */
  private dress(): void {
    // The edges of a mesh of the application are looked for only when something is to stand on them.
    const edged = (this.frameOn || this.lightOn || this.glowOn) && this.surface.outlines.length > 0;
    this.setTube(edged && this.frameOn);
    this.setRibbon(edged && (this.lightOn || this.glowOn));
    // Drawn after the glow whatever its opacity: see the order of the meshes in `setRibbon`.
    if (this.shown) this.shown.material.alwaysBlended = this.ribbon !== null;
    this.paint();
    this.layout();
  }

  private setTube(on: boolean): void {
    const tube = this.tube;
    if (on === (tube !== null)) return;
    if (tube) {
      this.tube = null;
      this._display?.removeSurface?.(tube.mesh);
      tube.mesh.dispose();
      tube.material.dispose();
      return;
    }
    const geometry = createFrame(this.surface.outlines, this.look.section);
    const mesh = new Mesh(`${this.name}.frame`, this.scene, this.root);
    // Positions, normals and texture coordinates are rewritten at each change of size.
    mesh.setVerticesData(VertexBuffer.PositionKind, geometry.positions, true);
    mesh.setVerticesData(VertexBuffer.NormalKind, geometry.normals, true);
    mesh.setVerticesData(VertexBuffer.UVKind, geometry.uvs, true);
    mesh.setIndices(geometry.indices);
    const material = new StandardMaterial(`${this.name}.frame`, this.scene);
    material.specularColor = new Color3(0.2, 0.2, 0.2);
    mesh.material = material;
    this.tube = { mesh, geometry, material };
    this._display?.addSurface?.(mesh);
  }

  private setRibbon(on: boolean): void {
    const ribbon = this.ribbon;
    if (on === (ribbon !== null)) return;
    const look = this.look;
    if (ribbon) {
      this.ribbon = null;
      // What the application set on the material itself is kept for the next one.
      look.minLineWidth = ribbon.material.minLineWidth;
      look.glowFalloff = ribbon.material.glowFalloff;
      look.cover = ribbon.material.cover;
      look.flow = { ...ribbon.material.flow };
      this._display?.removeSurface?.(ribbon.mesh);
      ribbon.mesh.dispose();
      ribbon.material.dispose();
      return;
    }
    const geometry = createFrameHalo(this.surface.outlines, this.frameOn ? look.section : 0);
    const mesh = new Mesh(`${this.name}.glow`, this.scene, this.root);
    // What depends on the size of the surface is rewritten at each change of size.
    mesh.setVerticesData(VertexBuffer.PositionKind, geometry.positions, true);
    mesh.setVerticesData(VertexBuffer.NormalKind, geometry.axes, true);
    mesh.setVerticesData(VertexBuffer.UVKind, geometry.uvs, true);
    mesh.setVerticesData(VertexBuffer.UV2Kind, geometry.offsets, false);
    mesh.setVerticesData(VertexBuffer.TangentKind, geometry.joints, true);
    mesh.setIndices(geometry.indices);
    mesh.isPickable = false;
    const material = new NeonMaterial(`${this.name}.neon`, this.scene, {
      minLineWidth: look.minLineWidth,
      glowFalloff: look.glowFalloff,
      cover: look.cover,
      flow: look.flow,
    });
    mesh.material = material;
    this.ribbon = { mesh, geometry, material };
    // The glow and the surface are both blended and stand as far from the eye: they are drawn in the order
    // the scene holds them. The glow comes first, so that the image is drawn over it and the glow shows
    // around the surface only, or through an image that is see-through.
    holdBefore(mesh, this.screen);
    this._display?.addSurface?.(mesh);
  }

  /** Gives the materials of the frame and of the glow the colors and the light of the portal. */
  private paint(): void {
    const look = this.look;
    const tube = this.tube;
    if (tube) {
      // Lit, the tube is a line of light and takes none from the scene. Else it is a solid as any other.
      const body = this.lightOn ? BLACK : look.frameColor;
      const light = this.lightOn ? look.lineColor : BLACK;
      tube.material.disableLighting = this.lightOn;
      tube.material.diffuseColor.set(body.r, body.g, body.b);
      tube.material.emissiveColor.set(light.r, light.g, light.b);
    }
    const neon = this.ribbon?.material;
    if (neon) {
      neon.lit = this.lightOn;
      neon.lineColor = look.lineColor;
      neon.glowColor = look.glowColor;
      neon.glowSize = this.glowOn ? look.glowSize : 0;
      neon.glowIntensity = look.glowIntensity;
    }
    this.paintWorldGlow();
  }

  /** Writes the vertices of what stands on the edges of the surface, after a change of size. Nothing is rebuilt. */
  private layout(): void {
    const outlines = this.surface.outlines;
    // With no tube the light and the glow stand on the edge of the surface itself.
    const section = this.frameOn ? this.look.section : 0;
    const tube = this.tube;
    if (tube) {
      writeFrame(outlines, section, tube.geometry.positions, tube.geometry.normals, tube.geometry.uvs);
      tube.mesh.updateVerticesData(VertexBuffer.PositionKind, tube.geometry.positions);
      tube.mesh.updateVerticesData(VertexBuffer.NormalKind, tube.geometry.normals);
      tube.mesh.updateVerticesData(VertexBuffer.UVKind, tube.geometry.uvs);
      tube.mesh.refreshBoundingInfo();
    }
    const ribbon = this.ribbon;
    if (ribbon) {
      writeFrameHalo(outlines, section, ribbon.geometry);
      ribbon.mesh.updateVerticesData(VertexBuffer.PositionKind, ribbon.geometry.positions);
      ribbon.mesh.updateVerticesData(VertexBuffer.NormalKind, ribbon.geometry.axes);
      ribbon.mesh.updateVerticesData(VertexBuffer.UVKind, ribbon.geometry.uvs);
      ribbon.mesh.updateVerticesData(VertexBuffer.TangentKind, ribbon.geometry.joints);
      ribbon.material.lineWidth = section;
      this.boundGlow(ribbon, section);
    }

    const world = this.worldGlowState;
    if (world) {
      writeRectTunnel({ width: this.width, height: this.height, depth: this.worldGlowDepth * world.into }, world.geometry.positions, world.geometry.uvs);
      world.mesh.updateVerticesData(VertexBuffer.PositionKind, world.geometry.positions);
      world.mesh.updateVerticesData(VertexBuffer.UVKind, world.geometry.uvs);
      world.mesh.refreshBoundingInfo();
    }

    if (this.shown) this.shown.aspect = this.aspect;
    this.updateScreen();
  }

  /**
   * Gives the mesh of the glow its bounds. The shader spreads the light from
   * the centre line of the frame, beyond the vertices: the bounds make room
   * for it, so that the glow is not culled early.
   *
   * They are centred on the very centre of the surface. Blended meshes are
   * sorted by the distance of that centre to the eye: with the same one, the
   * glow and the surface are drawn in the order the scene holds them, from
   * every angle.
   */
  private boundGlow(ribbon: IRibbon, section: number): void {
    const positions = ribbon.geometry.positions;
    const reach = Math.max(this.glowOn ? this.look.glowSize : 0, section / 2);
    const centre = this.screen.getBoundingInfo().boundingSphere.center;
    const around = [centre.x, centre.y, centre.z];
    const extend = [reach, reach, reach];
    for (let i = 0; i < positions.length; i++) {
      const axis = i % 3;
      extend[axis] = Math.max(extend[axis] as number, Math.abs((positions[i] as number) - (around[axis] as number)) + reach);
    }
    // New bounds know nothing of where the mesh stands unless they are given its world matrix: without it the
    // glow would be culled, and sorted against the surface, as if it stood at the origin of the world.
    this.root.computeWorldMatrix(true);
    const world = ribbon.mesh.computeWorldMatrix(true);
    const [x, y, z] = extend as [number, number, number];
    ribbon.mesh.buildBoundingInfo(new Vector3(centre.x - x, centre.y - y, centre.z - z), new Vector3(centre.x + x, centre.y + y, centre.z + z), world);
    // Halfway between two corners is the centre to the last bit only when said so.
    const bounds = ribbon.mesh.getBoundingInfo();
    bounds.boundingSphere.center.copyFrom(centre);
    bounds.update(world);
  }

  private updateScreen(): void {
    // A surface the portal built is hidden while it shows nothing. A mesh of the application is left as it is.
    if (this.surface.ownsMesh) this.screen.setEnabled(this.shown !== null && this.width > 0 && this.height > 0);
  }

  /**
   * Where the opening stands in the scene of a display: the anchor the portal
   * was given, when it is of that scene; the portal itself, when the display
   * shows the scene the portal stands in; else the origin of that scene.
   */
  private anchorIn(display: ITextureDisplay): TransformNode | null {
    const scene = display.texture.getScene();
    const given = this.windowOptions?.anchor;
    if (given && given.getScene() === scene) return given;
    return scene === this.root.getScene() ? this.root : null;
  }

  /**
   * Sets the walls of light behind the opening, in the scene the display
   * shows. Only the camera of the window draws them: they are on its layer.
   */
  private buildWorldGlow(display: ITextureDisplay): void {
    this.disposeWorldGlow();
    const options = this.windowOptions;
    const scene = display.texture.getScene();
    if (!options || options.glow === false || !display.setWindow || !scene) return;
    // The glow of the frame carried on: a portal that does not glow has none, unless it is asked for.
    if (!this.glowOn && !options.glow) return;
    const anchor = this.anchorIn(display);
    // Behind the opening: toward +z in a left-handed scene, toward -z in a right-handed one.
    const into = scene.useRightHandedSystem ? -1 : 1;
    const geometry = createRectTunnel({ width: this.width, height: this.height, depth: this.worldGlowDepth * into });
    const mesh = new Mesh(`${this.name}.worldGlow`, scene, anchor);
    mesh.setVerticesData(VertexBuffer.PositionKind, geometry.positions, true);
    mesh.setVerticesData(VertexBuffer.NormalKind, geometry.normals, false);
    mesh.setVerticesData(VertexBuffer.UVKind, geometry.uvs, true);
    mesh.setIndices(geometry.indices);
    mesh.layerMask = WINDOW_LAYER_MASK;
    mesh.isPickable = false;

    // The light is a strip of colors that fade along the depth of the walls.
    const pixels = new Uint8Array(WORLD_GLOW_STEPS * 4);
    const texture = RawTexture.CreateRGBATexture(pixels, 1, WORLD_GLOW_STEPS, scene, false, false, Texture.BILINEAR_SAMPLINGMODE);
    texture.wrapU = Texture.CLAMP_ADDRESSMODE;
    texture.wrapV = Texture.CLAMP_ADDRESSMODE;
    texture.hasAlpha = true;
    const material = new StandardMaterial(`${this.name}.worldGlow`, scene);
    material.disableLighting = true;
    material.diffuseColor = Color3.Black();
    material.specularColor = Color3.Black();
    material.emissiveTexture = texture;
    material.opacityTexture = texture;
    // The walls are seen from inside the tunnel and, from a side, from outside it.
    material.backFaceCulling = false;
    mesh.material = material;

    this.worldGlowState = { mesh, material, texture, pixels, geometry, into };
    this.paintWorldGlow();
  }

  /** Writes the colors of the light behind the opening: the glow of the frame, white-hot against the frame, fading with depth. */
  private paintWorldGlow(): void {
    const world = this.worldGlowState;
    if (!world) return;
    const glow = this.worldGlowOptions.color ?? this.look.glowColor;
    const line = this.look.lineColor;
    const intensity = this.worldGlowIntensity;
    const falloff = Math.max(0.01, this.worldGlowOptions.falloff ?? 2);
    const cover = this.ribbon?.material.cover ?? this.look.cover;
    const byte = (value: number): number => Math.round(Math.min(1, Math.max(0, value)) * 255);
    for (let i = 0; i < WORLD_GLOW_STEPS; i++) {
      // 1 on the opening, 0 at the end of the walls.
      const near = 1 - i / (WORLD_GLOW_STEPS - 1);
      const wide = near ** falloff;
      // The share of the light that burns toward the color of the line, as around the frame.
      const hot = near ** (falloff * 5) * 0.6;
      world.pixels[i * 4] = byte((glow.r + line.r * hot) * intensity);
      world.pixels[i * 4 + 1] = byte((glow.g + line.g * hot) * intensity);
      world.pixels[i * 4 + 2] = byte((glow.b + line.b * hot) * intensity);
      world.pixels[i * 4 + 3] = byte(wide * cover);
    }
    world.texture.update(world.pixels);
  }

  private disposeWorldGlow(): void {
    const world = this.worldGlowState;
    if (!world) return;
    this.worldGlowState = null;
    world.mesh.dispose();
    world.material.dispose();
    world.texture.dispose();
  }
}

/** The colors and the sizes of what a portal wears, whether it wears it now or not. */
interface IPortalLook {
  section: number;
  frameColor: IColor3Like;
  lineColor: IColor3Like;
  minLineWidth: number;
  glowColor: IColor3Like;
  glowSize: number;
  glowIntensity: number;
  glowFalloff: number;
  cover: number;
  flow: INeonFlow;
}

/** The tube of the frame. Its vertices are rewritten at each change of size. */
interface ITube {
  mesh: Mesh;
  geometry: IFrameGeometry;
  material: StandardMaterial;
}

/** The ribbons that draw the light and the glow. Their vertices are rewritten at each change of size. */
interface IRibbon {
  mesh: Mesh;
  geometry: IFrameHaloGeometry;
  material: NeonMaterial;
}

/** The light behind the opening of a window, and what draws it. */
interface IWorldGlow {
  mesh: Mesh;
  material: StandardMaterial;
  texture: RawTexture;
  pixels: Uint8Array;
  geometry: IRectTunnelGeometry;
  /** 1 or -1: the direction of z that goes behind the opening, in the scene of the display. */
  into: number;
}

/** Colors along the depth of the walls. */
const WORLD_GLOW_STEPS = 64;

const BLACK: Readonly<IColor3Like> = { r: 0, g: 0, b: 0 };
const FRAME_GRAY: Readonly<IColor3Like> = { r: 0.16, g: 0.17, b: 0.2 };

const copyColor = (color: Readonly<IColor3Like>): IColor3Like => ({ r: color.r, g: color.g, b: color.b });

const isMesh = (surface: AbstractMesh | IPortalSurfaceBuilder): surface is AbstractMesh => typeof (surface as Partial<AbstractMesh>).getScene === "function";

/**
 * Moves `first` before `second` in the list of the meshes of their scene.
 * Blended meshes that stand as far from the eye are drawn in the order of
 * that list, which Babylon.js keeps when a mesh leaves the scene.
 */
function holdBefore(first: AbstractMesh, second: AbstractMesh): void {
  const meshes = first.getScene().meshes;
  const from = meshes.indexOf(first);
  const to = meshes.indexOf(second);
  if (from < 0 || to < 0 || from < to) return;
  meshes.splice(from, 1);
  meshes.splice(to, 0, first);
}
