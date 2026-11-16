import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import type { Material } from "@babylonjs/core/Materials/material.js";
import type { IColor4Like } from "@babylonjs/core/Maths/math.like.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { Observer } from "@babylonjs/core/Misc/observable.js";
import type { Nullable } from "@babylonjs/core/types.js";
import { applyUvBounds, fitUv, uvBoundsOf, type DisplayFit, type IUvBounds, type IUvTransform } from "@spacexr/spatial-display-core";
import type { IDisplayChange, ITextureDisplay } from "./display.js";
import { DisplayMaterial } from "./materials/display-material.js";

export interface IDisplaySurfaceOptions {
  /** 1 (default) shows the image opaque, 0 hides it. */
  opacity?: number;
  /** How the image fills the surface when their proportions differ. Default "stretch". */
  fit?: DisplayFit;
  /**
   * Width over height of the area of the mesh that its texture coordinates
   * cover, which "contain" and "cover" need. Default: read from the bounding
   * box of the mesh, its extent along x over its extent along y (along z for a
   * mesh that is flat along y).
   */
  aspect?: number;
  /** Shows the image on both faces of the mesh. Default false. */
  doubleSided?: boolean;
  /** Color of the surface where the image does not reach ("contain"). Default opaque black. */
  border?: Readonly<IColor4Like>;
  /** Takes the transparency of the image into account. Default false: the image is opaque wherever it shows. */
  useImageAlpha?: boolean;
}

/**
 * A mesh that shows a display. The surface gives the mesh a material of its
 * own, and gives it back its former one when disposed.
 *
 * The image fills the rectangle of the texture space that the mesh uses,
 * whatever that rectangle is: a mesh modelled with its screen mapped on a
 * corner of an atlas shows the whole image on that screen.
 */
export class DisplaySurface {
  readonly mesh: Mesh;
  readonly material: DisplayMaterial;

  private readonly former: Nullable<Material>;
  private readonly bounds: IUvBounds;
  private readonly transform: IUvTransform = { uScale: 1, vScale: 1, uOffset: 0, vOffset: 0 };
  private _display: ITextureDisplay;
  private _fit: DisplayFit;
  private _aspect: number;
  private observer: Observer<IDisplayChange> | null = null;
  private disposed = false;

  constructor(mesh: Mesh, display: ITextureDisplay, options: Readonly<IDisplaySurfaceOptions> = {}) {
    const uvs = mesh.getVerticesData(VertexBuffer.UVKind);
    if (!uvs) throw new Error(`spatial-display: mesh "${mesh.name}" has no texture coordinates, it cannot show a display.`);
    checkSameEngine(mesh, display);
    this.mesh = mesh;
    this.bounds = uvBoundsOf(uvs);
    this._fit = options.fit ?? "stretch";
    this._aspect = options.aspect ?? aspectOf(mesh);
    this.former = mesh.material;
    this.material = new DisplayMaterial(`${mesh.name}.display`, mesh.getScene());
    this.material.backFaceCulling = !(options.doubleSided ?? false);
    this.material.opacity = options.opacity ?? 1;
    this.material.useImageAlpha = options.useImageAlpha ?? false;
    if (options.border) this.material.border = options.border;
    mesh.material = this.material;
    this._display = display;
    this.bind(display);
  }

  get display(): ITextureDisplay {
    return this._display;
  }

  /** Shows another display on the same mesh. */
  set display(value: ITextureDisplay) {
    if (this.disposed || value === this._display) return;
    checkSameEngine(this.mesh, value);
    this.unbind();
    this._display = value;
    this.bind(value);
  }

  get opacity(): number {
    return this.material.opacity;
  }

  set opacity(value: number) {
    this.material.opacity = value;
  }

  get fit(): DisplayFit {
    return this._fit;
  }

  set fit(value: DisplayFit) {
    this._fit = value;
    this.update();
  }

  /** Width over height of the area the image is shown on. */
  get aspect(): number {
    return this._aspect;
  }

  set aspect(value: number) {
    this._aspect = value;
    this.update();
  }

  /** Gives the mesh its former material back. The display is left as it is: it may feed other surfaces. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unbind();
    if (this.mesh.material === this.material) this.mesh.material = this.former;
    this.material.dispose();
  }

  private bind(display: ITextureDisplay): void {
    this.material.image = display.texture;
    this.observer = display.onChangedObservable.add((change) => {
      if (change.kind === "texture") this.material.image = display.texture;
      else if (change.kind === "resolution") this.update();
      // Nothing is left to show: the mesh gets its own material back.
      else this.dispose();
    });
    display.addSurface?.(this.mesh);
    this.update();
  }

  private unbind(): void {
    if (this.observer) this._display.onChangedObservable.remove(this.observer);
    this.observer = null;
    this._display.removeSurface?.(this.mesh);
  }

  private update(): void {
    const { width, height } = this._display.resolution;
    fitUv(height > 0 ? width / height : 0, this._aspect, this._fit, this.transform);
    this.material.setUvTransform(applyUvBounds(this.transform, this.bounds, this.transform));
  }
}

/** Shows `display` on `mesh`. Dispose of the surface returned to give the mesh its material back. */
export const attachDisplay = (mesh: Mesh, display: ITextureDisplay, options?: Readonly<IDisplaySurfaceOptions>): DisplaySurface =>
  new DisplaySurface(mesh, display, options);

function checkSameEngine(mesh: Mesh, display: ITextureDisplay): void {
  const source = display.texture.getScene();
  if (source && source.getEngine() !== mesh.getScene().getEngine()) {
    throw new Error("spatial-display: a display shows only on meshes of its own engine. A texture cannot be shared between two rendering contexts.");
  }
}

function aspectOf(mesh: Mesh): number {
  const extend = mesh.getBoundingInfo().boundingBox.extendSize;
  const epsilon = 1e-6 * Math.max(extend.x, extend.y, extend.z);
  const height = extend.y > epsilon ? extend.y : extend.z;
  return height > epsilon ? extend.x / height : 1;
}
