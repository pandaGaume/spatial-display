import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture.js";
import { Texture } from "@babylonjs/core/Materials/Textures/texture.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import type { IColor3Like, IColor4Like } from "@babylonjs/core/Maths/math.like.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { Observer } from "@babylonjs/core/Misc/observable.js";
import type { Scene } from "@babylonjs/core/scene.js";
import {
  PhysicalDisplay,
  createRectFrame,
  createRectFrameHalo,
  createRectTunnel,
  writeRectFrame,
  writeRectFrameHalo,
  writeRectTunnel,
  type DisplayFit,
  type IRectFrameGeometry,
  type IRectFrameHaloGeometry,
  type IRectTunnelGeometry,
} from "@spacexr/spatial-display-core";
import { WINDOW_LAYER_MASK, type IDisplayChange, type ITextureDisplay } from "./display.js";
import type { IChromaKey } from "./materials/display-material.js";
import { NeonMaterial, type INeonMaterialOptions } from "./materials/neon-material.js";
import { DisplaySurface, type IDisplaySurfaceOptions } from "./surface.js";

/**
 * The glow of the frame on the far side of a window: walls of light that run
 * from the edges of the opening straight into the world behind it, as the
 * inside of a box. Seen through the opening they give the glow a depth: the
 * wall away from the viewer shows more than the one on his side.
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
   * scene, unturned.
   */
  anchor?: TransformNode;
  /** Light on the far side of the opening; false for none. */
  glow?: false | Readonly<IPortalWorldGlowOptions>;
}

export interface IPortalOptions {
  /**
   * Makes the portal a window: its image is what the viewer sees through the
   * opening, as if it gave onto the scene of its display, and follows the
   * viewer as he moves. It needs a display that can be a window, as a
   * `CameraDisplay`; with another one the portal stays a screen. The image
   * then always fills the opening: `fit` does not apply. Default: a screen.
   */
  window?: boolean | Readonly<IPortalWindowOptions>;
  /** Size of the opening, in world units. The frame goes around it. */
  width: number;
  height: number;
  /**
   * Side of the square section of the frame, in world units: the width of its
   * line of light. Default 0.012. Whatever its section, the line never shows
   * thinner than a hairline (`neon.minLineWidth`).
   */
  frameSection?: number;
  /**
   * Look of the frame: the color of its line, the color, the size and the
   * intensity of its glow, the light that travels along it. Default: a white
   * line in a blue glow. Its `lineWidth` is set by the portal, from `frameSection`.
   */
  neon?: Readonly<Omit<INeonMaterialOptions, "lineWidth">>;
  /** What the opening shows. Without a display the opening is empty: the scene shows through the frame. */
  display?: ITextureDisplay;
  /** Opacity of the image in the opening: 1 (default) opaque, 0 invisible. */
  opacity?: number;
  /** How the image fills the opening when their proportions differ. Default "stretch". */
  fit?: DisplayFit;
  /** Shows the image on the back of the portal too, mirrored. Default false. */
  doubleSided?: boolean;
  /** Color of the opening where the image does not reach ("contain"). Default opaque black. */
  border?: Readonly<IColor4Like>;
  /** Lets the transparent pixels of the image through. Default: what the texture of the display says of itself. */
  useImageAlpha?: boolean;
  /** A color of the image to let through, as the green of a green screen. Default: none. */
  chromaKey?: Readonly<IChromaKey>;
  /**
   * Pixels of the image per world unit. When given, the display is resized
   * with the opening so that its image keeps that density and the proportions
   * of the opening. Each change of size then allocates a new render target:
   * leave it out for a portal whose size is animated.
   */
  pixelsPerUnit?: number;
}

/**
 * A rectangular opening in a frame of neon, that shows a display.
 *
 * The frame is a line of light, with a glow that spreads on both sides of it.
 * The image of the opening is drawn over the glow: the glow shows around the
 * opening, and through an image that is see-through.
 *
 * A portal is a screen by default: its image is glued to the opening. As a
 * window (`window` in its options) the opening gives onto the scene of its
 * display: the image follows the eye of the viewer, and the glow of the frame
 * carries on behind the opening, on walls of light that run into that scene.
 *
 * A portal is a physical display. `setDimension` changes the size of its
 * opening, in world units, and `resize` the size of its image, in pixels. Its
 * resolution is the one of the display it shows: showing a display takes its
 * resolution, and resizing the portal resizes that display.
 *
 * `root` is what the application places, turns and parents. When facing the
 * front of the portal, the local x axis of `root` reads to the right and its y
 * axis upward: the front looks toward -z in a left-handed scene, as the planes
 * of Babylon.js, and toward +z in a right-handed one. `root` should keep a
 * scale of 1: the opening changes size through `setDimension`, which keeps the
 * section of the frame.
 */
export class Portal extends PhysicalDisplay {
  readonly root: TransformNode;
  /** The line of light around the opening: a tube of square section, opaque. */
  readonly frame: AbstractMesh;
  /** The glow of the line. It spreads on both sides of it, and the image of the opening is drawn over it. */
  readonly glow: AbstractMesh;
  /** The opening: a rectangle in the plane of `root`. */
  readonly screen: AbstractMesh;
  /** Material of the glow: its color, its size, its intensity, the light that travels along the frame. */
  readonly neon: NeonMaterial;

  /** The meshes as they are built: their vertices are rewritten at each change of size. */
  private readonly tubeMesh: Mesh;
  private readonly glowMesh: Mesh;
  private readonly tube: IRectFrameGeometry;
  private readonly halo: IRectFrameHaloGeometry;
  private readonly lineMaterial: StandardMaterial;
  private readonly surfaceOptions: IDisplaySurfaceOptions;
  private readonly name: string;
  /** null for a screen. */
  private readonly windowOptions: Readonly<IPortalWindowOptions> | null;
  private readonly worldGlowOptions: IPortalWorldGlowOptions;
  private worldGlowState: IWorldGlow | null = null;
  private section: number;
  private surface: DisplaySurface | null = null;
  private displayObserver: Observer<IDisplayChange> | null = null;
  private _display: ITextureDisplay | null = null;

  constructor(name: string, scene: Scene, options: Readonly<IPortalOptions>) {
    super({
      width: options.width,
      height: options.height,
      maxResolution: scene.getEngine().getCaps().maxTextureSize,
      ...(options.pixelsPerUnit !== undefined ? { pixelsPerUnit: options.pixelsPerUnit } : {}),
    });
    this.name = name;
    this.section = Math.max(0, options.frameSection ?? 0.012);
    this.windowOptions = options.window ? (options.window === true ? {} : options.window) : null;
    this.worldGlowOptions = { ...(this.windowOptions?.glow || {}) };
    this.surfaceOptions = {
      opacity: options.opacity ?? 1,
      // The image of a window is the opening itself.
      fit: this.windowOptions ? "stretch" : (options.fit ?? "stretch"),
      doubleSided: options.doubleSided ?? false,
      // Drawn after the glow whatever its opacity: see the order of the meshes below.
      alwaysBlended: true,
      ...(options.useImageAlpha !== undefined ? { useImageAlpha: options.useImageAlpha } : {}),
      ...(options.chromaKey ? { chromaKey: options.chromaKey } : {}),
      ...(options.border ? { border: options.border } : {}),
    };

    this.root = new TransformNode(name, scene);
    const size = { width: this.width, height: this.height, section: this.section };

    // The glow and the screen are both blended and stand as far from the eye: they are drawn in the order
    // they are built in. The glow comes first, so that the image is drawn over it and the glow shows around
    // the opening only, or through an image that is see-through.
    this.halo = createRectFrameHalo(size);
    this.glowMesh = new Mesh(`${name}.glow`, scene, this.root);
    // Positions and texture coordinates are rewritten at each change of size.
    this.glowMesh.setVerticesData(VertexBuffer.PositionKind, this.halo.positions, true);
    this.glowMesh.setVerticesData(VertexBuffer.NormalKind, this.halo.axes, false);
    this.glowMesh.setVerticesData(VertexBuffer.UVKind, this.halo.uvs, true);
    this.glowMesh.setVerticesData(VertexBuffer.UV2Kind, this.halo.offsets, false);
    this.glowMesh.setIndices(this.halo.indices);
    this.glowMesh.isPickable = false;
    this.neon = new NeonMaterial(`${name}.neon`, scene, { ...options.neon, lineWidth: this.section });
    this.glowMesh.material = this.neon;
    this.glow = this.glowMesh;

    // A unit rectangle, scaled to the opening. Its front reads x to the right and y upward.
    const rightHanded = scene.useRightHandedSystem;
    const front = rightHanded ? 1 : -1;
    const screen = new Mesh(`${name}.screen`, scene, this.root);
    screen.setVerticesData(VertexBuffer.PositionKind, [-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]);
    screen.setVerticesData(VertexBuffer.NormalKind, [0, 0, front, 0, 0, front, 0, 0, front, 0, 0, front]);
    screen.setVerticesData(VertexBuffer.UVKind, [0, 0, 1, 0, 1, 1, 0, 1]);
    screen.setIndices(rightHanded ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]);
    this.screen = screen;

    // The body of the line: an opaque tube, which hides and is hidden as any solid does.
    this.tube = createRectFrame(size);
    this.tubeMesh = new Mesh(`${name}.frame`, scene, this.root);
    this.tubeMesh.setVerticesData(VertexBuffer.PositionKind, this.tube.positions, true);
    this.tubeMesh.setVerticesData(VertexBuffer.NormalKind, this.tube.normals, false);
    this.tubeMesh.setVerticesData(VertexBuffer.UVKind, this.tube.uvs, true);
    this.tubeMesh.setIndices(this.tube.indices);
    this.lineMaterial = new StandardMaterial(`${name}.line`, scene);
    this.lineMaterial.disableLighting = true;
    this.lineMaterial.emissiveColor = Color3.FromArray([this.neon.lineColor.r, this.neon.lineColor.g, this.neon.lineColor.b]);
    this.tubeMesh.material = this.lineMaterial;
    this.frame = this.tubeMesh;

    this.layout();
    this.display = options.display ?? null;
  }

  /** Side of the square section of the frame, in world units. */
  get frameSection(): number {
    return this.section;
  }

  set frameSection(value: number) {
    value = Math.max(0, value);
    if (value === this.section) return;
    this.section = value;
    this.layout();
  }

  /**
   * How far the glow of the frame reaches from its line, in world units; 0
   * for the bare line. Set it here rather than on `neon`: the portal makes
   * room for the glow in the bounds of its frame.
   */
  get glowSize(): number {
    return this.neon.glowSize;
  }

  set glowSize(value: number) {
    this.neon.glowSize = value;
    this.layout();
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
    return this.worldGlowOptions.depth ?? this.neon.glowSize * 2;
  }

  set worldGlowDepth(value: number) {
    this.worldGlowOptions.depth = Math.max(0, value);
    this.layout();
  }

  /** Brightness of the light behind a window. See `IPortalWorldGlowOptions.intensity`. */
  get worldGlowIntensity(): number {
    return this.worldGlowOptions.intensity ?? this.neon.glowIntensity * 0.7;
  }

  set worldGlowIntensity(value: number) {
    this.worldGlowOptions.intensity = Math.max(0, value);
    this.paintWorldGlow();
  }

  /** Brightness of the glow of the frame. */
  get glowIntensity(): number {
    return this.neon.glowIntensity;
  }

  set glowIntensity(value: number) {
    this.neon.glowIntensity = value;
    this.paintWorldGlow();
  }

  /** Color of the glow of the frame. */
  get glowColor(): Readonly<IColor3Like> {
    return this.neon.glowColor;
  }

  set glowColor(value: Readonly<IColor3Like>) {
    this.neon.glowColor = value;
    this.paintWorldGlow();
  }

  /** Color of the line of the frame. */
  get lineColor(): Readonly<IColor3Like> {
    return this.neon.lineColor;
  }

  set lineColor(value: Readonly<IColor3Like>) {
    this.neon.lineColor = value;
    this.lineMaterial.emissiveColor.set(value.r, value.g, value.b);
    this.paintWorldGlow();
  }

  /** What the opening shows; null for an empty frame. The portal does not own its display. */
  get display(): ITextureDisplay | null {
    return this._display;
  }

  set display(value: ITextureDisplay | null) {
    if (value === this._display) return;
    const previous = this._display;
    if (previous && this.displayObserver) previous.onChangedObservable.remove(this.displayObserver);
    this.displayObserver = null;
    if (previous && this.windowOptions) previous.setWindow?.(null);
    this.disposeWorldGlow();
    this._display = value;
    if (!value) {
      this.surface?.dispose();
      this.surface = null;
    } else {
      if (this.surface) this.surface.display = value;
      else this.surface = new DisplaySurface(this.screen, value, { ...this.surfaceOptions, aspect: this.aspect });
      this.displayObserver = value.onChangedObservable.add((change) => {
        if (change.kind === "disposed") this.display = null;
        else if (change.kind === "resolution") this.takeResolution(value);
        // The display shows another scene: the light behind the opening moves there.
        else if (change.kind === "texture") this.buildWorldGlow(value);
      });
      if (this.windowOptions) {
        value.setWindow?.(this, this.windowOptions.anchor ?? null);
        this.buildWorldGlow(value);
      }
      // A portal that keeps a density of pixels gives its resolution to a display that can take it.
      if (this.pixelsPerUnit !== undefined && value.resize) this.onResized();
      this.takeResolution(value);
    }
    this.updateScreen();
  }

  /** Opacity of the image in the opening: 1 opaque, 0 invisible. */
  get opacity(): number {
    return this.surfaceOptions.opacity ?? 1;
  }

  set opacity(value: number) {
    this.surfaceOptions.opacity = Math.min(1, Math.max(0, value));
    if (this.surface) this.surface.opacity = this.surfaceOptions.opacity;
  }

  get fit(): DisplayFit {
    return this.surfaceOptions.fit ?? "stretch";
  }

  set fit(value: DisplayFit) {
    // The image of a window is the opening itself.
    if (this.windowOptions) return;
    this.surfaceOptions.fit = value;
    if (this.surface) this.surface.fit = value;
  }

  /** See `IPortalOptions.useImageAlpha`; undefined when the portal follows what the texture of its display says. */
  get useImageAlpha(): boolean | undefined {
    return this.surfaceOptions.useImageAlpha;
  }

  set useImageAlpha(value: boolean | undefined) {
    if (value === undefined) delete this.surfaceOptions.useImageAlpha;
    else this.surfaceOptions.useImageAlpha = value;
    if (this.surface) this.surface.useImageAlpha = value;
  }

  /** A color of the image to let through; null for none. */
  get chromaKey(): Readonly<IChromaKey> | null {
    return this.surfaceOptions.chromaKey ?? null;
  }

  set chromaKey(value: Readonly<IChromaKey> | null) {
    if (value) this.surfaceOptions.chromaKey = value;
    else delete this.surfaceOptions.chromaKey;
    if (this.surface) this.surface.chromaKey = value;
  }

  /** Releases the meshes and the materials of the portal. Its display is left as it is. */
  override dispose(): void {
    this.display = null;
    this.glowMesh.material = null;
    this.tubeMesh.material = null;
    this.neon.dispose();
    this.lineMaterial.dispose();
    this.root.dispose();
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
    this.layout();
  }

  /** The resolution of a portal is the one of its display. */
  private takeResolution(display: ITextureDisplay): void {
    this.resize(display.resolution.width, display.resolution.height);
  }

  private layout(): void {
    const size = { width: this.width, height: this.height, section: this.section };
    writeRectFrame(size, this.tube.positions, this.tube.uvs);
    this.tubeMesh.updateVerticesData(VertexBuffer.PositionKind, this.tube.positions);
    this.tubeMesh.updateVerticesData(VertexBuffer.UVKind, this.tube.uvs);
    this.tubeMesh.refreshBoundingInfo();

    writeRectFrameHalo(size, this.halo.positions, this.halo.uvs);
    this.glowMesh.updateVerticesData(VertexBuffer.PositionKind, this.halo.positions);
    this.glowMesh.updateVerticesData(VertexBuffer.UVKind, this.halo.uvs);
    this.neon.lineWidth = this.section;
    // The shader spreads the glow from the centre line of the tube, beyond the vertices: the bounds are those of
    // the tube plus what reaches past it, so that the glow is not culled early. New bounds know nothing of where
    // the mesh stands unless they are given its world matrix: without it the glow would be culled, and sorted
    // against the screen, as if it stood at the origin of the world.
    const reach = Math.max(this.neon.glowSize - this.section / 2, 0);
    const bounds = this.tubeMesh.getBoundingInfo();
    this.root.computeWorldMatrix(true);
    this.glowMesh.buildBoundingInfo(
      bounds.minimum.subtractFromFloats(reach, reach, reach),
      bounds.maximum.subtractFromFloats(-reach, -reach, -reach),
      this.glowMesh.computeWorldMatrix(true),
    );

    const world = this.worldGlowState;
    if (world) {
      writeRectTunnel({ width: this.width, height: this.height, depth: this.worldGlowDepth * world.into }, world.geometry.positions, world.geometry.uvs);
      world.mesh.updateVerticesData(VertexBuffer.PositionKind, world.geometry.positions);
      world.mesh.updateVerticesData(VertexBuffer.UVKind, world.geometry.uvs);
      world.mesh.refreshBoundingInfo();
    }

    this.screen.scaling.set(this.width, this.height, 1);
    if (this.surface) this.surface.aspect = this.aspect;
    this.updateScreen();
  }

  private updateScreen(): void {
    this.screen.setEnabled(this.surface !== null && this.width > 0 && this.height > 0);
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
    const anchor = options.anchor && options.anchor.getScene() === scene ? options.anchor : null;
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
    const glow = this.worldGlowOptions.color ?? this.neon.glowColor;
    const line = this.neon.lineColor;
    const intensity = this.worldGlowIntensity;
    const falloff = Math.max(0.01, this.worldGlowOptions.falloff ?? 2);
    const cover = this.neon.cover;
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
