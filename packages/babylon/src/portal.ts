import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import type { IColor4Like } from "@babylonjs/core/Maths/math.like.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { Observer } from "@babylonjs/core/Misc/observable.js";
import type { Scene } from "@babylonjs/core/scene.js";
import {
  METERS_PER_INCH,
  createRectFrame,
  pixelPerUnit,
  writeRectFrame,
  type DisplayFit,
  type IPhysicalDisplay,
  type IRectFrameGeometry,
  type ISize2,
  type IVec2,
} from "@spacexr/spatial-display-core";
import type { IDisplayChange, ITextureDisplay } from "./display.js";
import { NeonMaterial, type INeonMaterialOptions } from "./materials/neon-material.js";
import { DisplaySurface } from "./surface.js";

export interface IPortalOptions {
  /** Size of the opening, in world units. The frame goes around it. */
  width: number;
  height: number;
  /** Side of the square section of the frame, in world units. Default 0.03. */
  frameSection?: number;
  /** Look of the frame. Default: a blue neon. */
  neon?: Readonly<INeonMaterialOptions>;
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
  /** Takes the transparency of the image into account. Default false. */
  useImageAlpha?: boolean;
  /**
   * Pixels of the image per world unit. When given, the display is resized
   * with the portal so that its image keeps that density and the proportions
   * of the opening. Each change of size then allocates a new render target:
   * leave it out for a portal whose size is animated.
   */
  pixelsPerUnit?: number;
}

const NO_RESOLUTION: Readonly<ISize2> = { width: 0, height: 0 };
/** Resolutions follow the size of the portal by steps, so that a small change of size keeps the render target. */
const RESOLUTION_STEP = 8;

/**
 * A rectangular opening in a frame of neon, that shows a display.
 *
 * `root` is what the application places, turns and parents. When facing the
 * front of the portal, the local x axis of `root` reads to the right and its y
 * axis upward: the front looks toward -z in a left-handed scene, as the planes
 * of Babylon.js, and toward +z in a right-handed one. `root` should keep a
 * scale of 1: a portal changes size through `resize`, which keeps the section
 * of the frame.
 */
export class Portal implements IPhysicalDisplay {
  readonly root: TransformNode;
  /** The tube around the opening. */
  readonly frame: Mesh;
  /** The opening: a rectangle in the plane of `root`. */
  readonly screen: Mesh;
  /** Material of the frame: color, intensity, flow of the light. */
  readonly neon: NeonMaterial;

  private readonly geometry: IRectFrameGeometry;
  private readonly size: ISize2;
  private readonly surfaceOptions: { doubleSided: boolean; useImageAlpha: boolean; border?: Readonly<IColor4Like> };
  private section: number;
  private surface: DisplaySurface | null = null;
  private displayObserver: Observer<IDisplayChange> | null = null;
  private _display: ITextureDisplay | null = null;
  private _opacity: number;
  private _fit: DisplayFit;
  private _pixelsPerUnit: number | undefined;

  constructor(name: string, scene: Scene, options: Readonly<IPortalOptions>) {
    this.size = { width: Math.max(0, options.width), height: Math.max(0, options.height) };
    this.section = Math.max(0, options.frameSection ?? 0.03);
    this._opacity = options.opacity ?? 1;
    this._fit = options.fit ?? "stretch";
    this._pixelsPerUnit = options.pixelsPerUnit;
    this.surfaceOptions = {
      doubleSided: options.doubleSided ?? false,
      useImageAlpha: options.useImageAlpha ?? false,
      ...(options.border ? { border: options.border } : {}),
    };

    this.root = new TransformNode(name, scene);

    this.geometry = createRectFrame({ ...this.size, section: this.section });
    this.frame = new Mesh(`${name}.frame`, scene, this.root);
    // Positions and texture coordinates are rewritten at each change of size.
    this.frame.setVerticesData(VertexBuffer.PositionKind, this.geometry.positions, true);
    this.frame.setVerticesData(VertexBuffer.NormalKind, this.geometry.normals, false);
    this.frame.setVerticesData(VertexBuffer.UVKind, this.geometry.uvs, true);
    this.frame.setIndices(this.geometry.indices);
    this.neon = new NeonMaterial(`${name}.neon`, scene, options.neon);
    this.frame.material = this.neon;

    // A unit rectangle, scaled to the opening. Its front reads x to the right and y upward.
    const rightHanded = scene.useRightHandedSystem;
    const front = rightHanded ? 1 : -1;
    this.screen = new Mesh(`${name}.screen`, scene, this.root);
    this.screen.setVerticesData(VertexBuffer.PositionKind, [-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]);
    this.screen.setVerticesData(VertexBuffer.NormalKind, [0, 0, front, 0, 0, front, 0, 0, front, 0, 0, front]);
    this.screen.setVerticesData(VertexBuffer.UVKind, [0, 0, 1, 0, 1, 1, 0, 1]);
    this.screen.setIndices(rightHanded ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]);

    this.layout();
    this.display = options.display ?? null;
  }

  /** Width of the opening, in world units. */
  get width(): number {
    return this.size.width;
  }

  /** Height of the opening, in world units. */
  get height(): number {
    return this.size.height;
  }

  /** Changes the size of the opening, in world units. No mesh is rebuilt: this can be called at every frame. */
  resize(width: number, height: number): void {
    width = Math.max(0, width);
    height = Math.max(0, height);
    if (width === this.size.width && height === this.size.height) return;
    this.size.width = width;
    this.size.height = height;
    this.layout();
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

  /** What the opening shows; null for an empty frame. The portal does not own its display. */
  get display(): ITextureDisplay | null {
    return this._display;
  }

  set display(value: ITextureDisplay | null) {
    if (value === this._display) return;
    if (this._display && this.displayObserver) this._display.onChangedObservable.remove(this.displayObserver);
    this.displayObserver = null;
    this._display = value;
    if (!value) {
      this.surface?.dispose();
      this.surface = null;
    } else {
      if (this.surface) this.surface.display = value;
      else this.surface = new DisplaySurface(this.screen, value, { ...this.surfaceOptions, opacity: this._opacity, fit: this._fit, aspect: this.aspect });
      this.displayObserver = value.onChangedObservable.add((change) => {
        if (change.kind === "disposed") this.display = null;
      });
    }
    this.updateScreen();
    this.fitResolution();
  }

  /** Opacity of the image in the opening: 1 opaque, 0 invisible. */
  get opacity(): number {
    return this._opacity;
  }

  set opacity(value: number) {
    this._opacity = Math.min(1, Math.max(0, value));
    if (this.surface) this.surface.opacity = this._opacity;
  }

  get fit(): DisplayFit {
    return this._fit;
  }

  set fit(value: DisplayFit) {
    this._fit = value;
    if (this.surface) this.surface.fit = value;
  }

  /** See `IPortalOptions.pixelsPerUnit`; undefined to leave the resolution of the display alone. */
  get pixelsPerUnit(): number | undefined {
    return this._pixelsPerUnit;
  }

  set pixelsPerUnit(value: number | undefined) {
    this._pixelsPerUnit = value;
    this.fitResolution();
  }

  /** Resolution of the display shown, in pixels; zero without a display. */
  get resolution(): Readonly<ISize2> {
    return this._display?.resolution ?? NO_RESOLUTION;
  }

  /** Size of the opening, in world units. */
  get dimension(): Readonly<ISize2> {
    return this.size;
  }

  get pixelPerUnit(): IVec2 {
    return pixelPerUnit(this.resolution, this.size);
  }

  get dpi(): number {
    return this.pixelPerUnit.x * METERS_PER_INCH;
  }

  /** Releases the meshes and the materials of the portal. Its display is left as it is. */
  dispose(): void {
    this.display = null;
    this.frame.material = null;
    this.neon.dispose();
    this.root.dispose();
  }

  private get aspect(): number {
    return this.size.height > 0 ? this.size.width / this.size.height : 1;
  }

  private layout(): void {
    const { positions, uvs } = this.geometry;
    writeRectFrame({ ...this.size, section: this.section }, positions, uvs);
    this.frame.updateVerticesData(VertexBuffer.PositionKind, positions);
    this.frame.updateVerticesData(VertexBuffer.UVKind, uvs);
    this.frame.refreshBoundingInfo();
    this.screen.scaling.set(this.size.width, this.size.height, 1);
    if (this.surface) this.surface.aspect = this.aspect;
    this.updateScreen();
    this.fitResolution();
  }

  private updateScreen(): void {
    this.screen.setEnabled(this.surface !== null && this.size.width > 0 && this.size.height > 0);
  }

  private fitResolution(): void {
    const density = this._pixelsPerUnit;
    const display = this._display;
    if (!density || !(density > 0) || !display?.resize || this.size.width <= 0 || this.size.height <= 0) return;
    const limit = this.root.getScene().getEngine().getCaps().maxTextureSize || 4096;
    const pixels = (units: number): number => Math.min(limit, Math.max(RESOLUTION_STEP, Math.round((units * density) / RESOLUTION_STEP) * RESOLUTION_STEP));
    const width = pixels(this.size.width);
    const height = pixels(this.size.height);
    if (width !== display.resolution.width || height !== display.resolution.height) display.resize(width, height);
  }
}
