import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import type { Material } from "@babylonjs/core/Materials/material.js";
import type { IColor4Like } from "@babylonjs/core/Maths/math.like.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import type { Observer } from "@babylonjs/core/Misc/observable.js";
import type { Nullable } from "@babylonjs/core/types.js";
import { applyUvBounds, fitUv, uvBoundsOf, type DisplayFit, type IUvBounds, type IUvTransform } from "@spacexr/spatial-display-core";
import type { IDisplayChange, ITextureDisplay } from "./display.js";
import { DisplayMaterial, type IChromaKey } from "./materials/display-material.js";

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
  /**
   * Shows the image on both faces of the mesh: also on the back of a flat
   * mesh, where it reads mirrored, and on the inside of a hollow one, as the
   * far wall of a cylinder. Default false.
   */
  doubleSided?: boolean;
  /**
   * Color of the back faces of the mesh. They are then drawn plain, in that
   * color, and show no image: the back of a flat screen, the inside of a
   * ring, as a solid would have them. With an alpha under 1 the color tints
   * what stands behind. It takes over `doubleSided`: a back is plain or shows
   * the image, not both. Default: none.
   */
  backColor?: Readonly<IColor4Like>;
  /**
   * Color of the surface where the image does not reach ("contain"). Default
   * opaque black, and nothing for a display that is a lens: its image reaches
   * the whole surface wherever its viewer sees it.
   */
  border?: Readonly<IColor4Like>;
  /**
   * Lets the transparent pixels of the image through. Default: what the
   * texture of the display says of itself (`texture.hasAlpha`), which a camera
   * display sets when its background is see-through.
   */
  useImageAlpha?: boolean;
  /** A color of the image to let through, as the green of a green screen. Default: none. */
  chromaKey?: Readonly<IChromaKey>;
  /**
   * Draws the surface along with the blended meshes even when it is opaque,
   * so that a glow around it is drawn before it and never shows over the
   * image (see `DisplayMaterial.alwaysBlended`). Default false.
   */
  alwaysBlended?: boolean;
}

/**
 * A mesh that shows a display. The surface gives the mesh a material of its
 * own, and gives it back its former one when disposed.
 *
 * The image fills the rectangle of the texture space that the mesh uses,
 * whatever that rectangle is: a mesh modelled with its screen mapped on a
 * corner of an atlas shows the whole image on that screen. A display that is a
 * lens is read otherwise: the surface shows the part of its image that it
 * covers on the screen of the viewer, and `fit` does not apply.
 *
 * What stands behind the surface shows through it by
 * `1 - opacity * alpha of the pixel`, the alpha of a pixel being 1 unless the
 * surface lets the transparent pixels of the image through, or one of its colors.
 */
export class DisplaySurface {
  readonly mesh: AbstractMesh;
  readonly material: DisplayMaterial;

  private readonly former: Nullable<Material>;
  private readonly bounds: IUvBounds;
  private readonly transform: IUvTransform = { uScale: 1, vScale: 1, uOffset: 0, vOffset: 0 };
  /** undefined: follows what the texture of the display says. */
  private imageAlpha: boolean | undefined;
  /** null: black, or nothing for a lens. */
  private readonly borderGiven: Readonly<IColor4Like> | null;
  private _display: ITextureDisplay;
  private _doubleSided: boolean;
  private _fit: DisplayFit;
  private _aspect: number;
  private observer: Observer<IDisplayChange> | null = null;
  private disposed = false;

  constructor(mesh: AbstractMesh, display: ITextureDisplay, options: Readonly<IDisplaySurfaceOptions> = {}) {
    // An instance draws with the material of its source: it cannot have one of its own.
    if (mesh.isAnInstance) throw new Error(`spatial-display: "${mesh.name}" is an instance; show the display on its source mesh.`);
    const uvs = mesh.getVerticesData(VertexBuffer.UVKind);
    if (!uvs) throw new Error(`spatial-display: mesh "${mesh.name}" has no texture coordinates, it cannot show a display.`);
    checkSameEngine(mesh, display);
    this.mesh = mesh;
    this.bounds = uvBoundsOf(uvs);
    this._fit = options.fit ?? "stretch";
    this._aspect = options.aspect ?? aspectOf(mesh);
    this.imageAlpha = options.useImageAlpha;
    this.former = mesh.material;
    this.material = new DisplayMaterial(`${mesh.name}.display`, mesh.getScene());
    this._doubleSided = options.doubleSided ?? false;
    this.material.backColor = options.backColor ?? null;
    this.showFaces();
    this.material.opacity = options.opacity ?? 1;
    this.material.chromaKey = options.chromaKey ?? null;
    this.material.alwaysBlended = options.alwaysBlended ?? false;
    this.borderGiven = options.border ?? null;
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

  /** See `IDisplaySurfaceOptions.doubleSided`. */
  get doubleSided(): boolean {
    return this._doubleSided;
  }

  set doubleSided(value: boolean) {
    this._doubleSided = value;
    this.showFaces();
  }

  /** See `IDisplaySurfaceOptions.backColor`; null for a surface whose back is not plain. */
  get backColor(): Readonly<IColor4Like> | null {
    return this.material.backColor;
  }

  set backColor(value: Readonly<IColor4Like> | null) {
    this.material.backColor = value;
    this.showFaces();
  }

  get opacity(): number {
    return this.material.opacity;
  }

  set opacity(value: number) {
    this.material.opacity = value;
  }

  /** See `IDisplaySurfaceOptions.useImageAlpha`. Set to undefined to follow the texture of the display again. */
  get useImageAlpha(): boolean {
    return this.material.useImageAlpha;
  }

  set useImageAlpha(value: boolean | undefined) {
    this.imageAlpha = value;
    this.updateAlpha();
  }

  /** A color of the image to let through; null for none. */
  get chromaKey(): Readonly<IChromaKey> | null {
    return this.material.chromaKey;
  }

  set chromaKey(value: Readonly<IChromaKey> | null) {
    this.material.chromaKey = value;
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

  /** Draws the back faces when they have something to show: the image, or their own color. */
  private showFaces(): void {
    const back = this._doubleSided || this.material.backColor !== null;
    this.material.backFaceCulling = !back;
    // The faces turned away from the eye are drawn first, then those turned toward it:
    // through a see-through image, the far wall of a hollow mesh shows behind the near one.
    this.material.separateCullingPass = back;
  }

  private bind(display: ITextureDisplay): void {
    this.material.image = display.texture;
    this.observer = display.onChangedObservable.add((change) => {
      if (change.kind === "texture") {
        this.material.image = display.texture;
        this.updateEyes();
        this.updateAlpha();
      } else if (change.kind === "resolution" || change.kind === "mapping") this.update();
      else if (change.kind === "alpha") this.updateAlpha();
      // Nothing is left to show: the mesh gets its own material back.
      else if (change.kind === "disposed") this.dispose();
    });
    display.addSurface?.(this.mesh);
    this.updateAlpha();
    this.update();
  }

  private unbind(): void {
    if (this.observer) this._display.onChangedObservable.remove(this.observer);
    this.observer = null;
    this._display.removeSurface?.(this.mesh);
  }

  private updateAlpha(): void {
    const display = this._display;
    this.material.premultipliedImage = display.premultipliedAlpha ?? false;
    this.material.useImageAlpha = this.imageAlpha ?? display.texture.hasAlpha;
  }

  /** A display that draws an image for each eye of its viewer tells which one the right eye reads, and how. */
  private updateEyes(): void {
    this.material.rightImage = this._display.rightTexture ?? null;
    this.material.rightProjector = this._display.rightImageTransform ?? null;
  }

  private update(): void {
    this.updateEyes();
    // A lens tells how its image is read: where each point of the surface lands on the screen of the viewer.
    const projector = this._display.imageTransform ?? null;
    this.material.projector = projector;
    this.material.border = this.borderGiven ?? (projector ? NO_BORDER : BLACK_BORDER);
    if (projector) return;
    const { width, height } = this._display.resolution;
    fitUv(height > 0 ? width / height : 0, this._aspect, this._fit, this.transform);
    this.material.setUvTransform(applyUvBounds(this.transform, this.bounds, this.transform));
  }
}

/** Shows `display` on `mesh`. Dispose of the surface returned to give the mesh its material back. */
export const attachDisplay = (mesh: AbstractMesh, display: ITextureDisplay, options?: Readonly<IDisplaySurfaceOptions>): DisplaySurface =>
  new DisplaySurface(mesh, display, options);

const BLACK_BORDER: Readonly<IColor4Like> = { r: 0, g: 0, b: 0, a: 1 };
const NO_BORDER: Readonly<IColor4Like> = { r: 0, g: 0, b: 0, a: 0 };

function checkSameEngine(mesh: AbstractMesh, display: ITextureDisplay): void {
  const source = display.texture.getScene();
  if (source && source.getEngine() !== mesh.getScene().getEngine()) {
    throw new Error("spatial-display: a display shows only on meshes of its own engine. A texture cannot be shared between two rendering contexts.");
  }
}

function aspectOf(mesh: AbstractMesh): number {
  const extend = mesh.getBoundingInfo().boundingBox.extendSize;
  const epsilon = 1e-6 * Math.max(extend.x, extend.y, extend.z);
  const height = extend.y > epsilon ? extend.y : extend.z;
  return height > epsilon ? extend.x / height : 1;
}
