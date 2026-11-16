import { METERS_PER_INCH, pixelPerUnit, type IPhysicalDisplay, type ISize2, type IVec2 } from "../types.js";
import { Display } from "./display.js";

export interface IPhysicalDisplayOptions {
  /** Size of the rectangle the image covers, in world units. */
  width: number;
  height: number;
  /** Size of the image, in pixels. Default: none yet, or what `pixelsPerUnit` gives. */
  resolution?: Readonly<ISize2>;
  /**
   * Pixels of the image per world unit. When given, the image is resized
   * along with the rectangle, so that it keeps that density and the
   * proportions of the rectangle. Each change of size then allocates a new
   * image: leave it out for a rectangle whose size is animated.
   */
  pixelsPerUnit?: number;
  /** Largest width or height `pixelsPerUnit` may give the image, in pixels. Default 4096. */
  maxResolution?: number;
}

const DEFAULT_MAX_RESOLUTION = 4096;

/**
 * Resolutions follow the size of the rectangle by steps of this many pixels,
 * so that a small change of size keeps the image.
 */
export const RESOLUTION_STEP = 8;

/**
 * A display with a place in the world: its image covers a rectangle whose size
 * is known in world units. Two sizes change apart: `resize` is for the image,
 * in pixels, and `setDimension` for the rectangle, in world units.
 *
 * It knows nothing of rendering. A subclass adds the objects that draw the
 * rectangle, and overrides `onDimensionChanged` and `onResized` to keep them
 * in step.
 */
export class PhysicalDisplay extends Display implements IPhysicalDisplay {
  /** Size of the rectangle, in world units. */
  private readonly extent: ISize2;
  private _pixelsPerUnit: number | undefined;
  private _maxResolution: number;

  /** No hook is called from here. */
  constructor(options: Readonly<IPhysicalDisplayOptions>) {
    const size = { width: worldUnits(options.width), height: worldUnits(options.height) };
    const limit = options.maxResolution ?? DEFAULT_MAX_RESOLUTION;
    super(fitted(size, options.pixelsPerUnit, limit) ?? options.resolution);
    this.extent = size;
    this._pixelsPerUnit = options.pixelsPerUnit;
    this._maxResolution = limit;
  }

  /** Width of the rectangle, in world units. */
  get width(): number {
    return this.extent.width;
  }

  set width(value: number) {
    this.setDimension(value, this.extent.height);
  }

  /** Height of the rectangle, in world units. */
  get height(): number {
    return this.extent.height;
  }

  set height(value: number) {
    this.setDimension(this.extent.width, value);
  }

  /** Width over height of the rectangle; 1 for a rectangle with no height. */
  get aspect(): number {
    return this.extent.height > 0 ? this.extent.width / this.extent.height : 1;
  }

  /** Size of the rectangle, in world units. */
  get dimension(): Readonly<ISize2> {
    return this.extent;
  }

  /** Pixels of the image per world unit, as they are now. */
  get pixelPerUnit(): IVec2 {
    return pixelPerUnit(this.resolution, this.extent);
  }

  get dpi(): number {
    return this.pixelPerUnit.x * METERS_PER_INCH;
  }

  /** Changes the size of the rectangle, in world units. */
  setDimension(width: number, height: number): void {
    width = worldUnits(width);
    height = worldUnits(height);
    if (width === this.extent.width && height === this.extent.height) return;
    this.extent.width = width;
    this.extent.height = height;
    this.onDimensionChanged();
    this.fitResolution();
  }

  /** See `IPhysicalDisplayOptions.pixelsPerUnit`; undefined to leave the resolution alone. */
  get pixelsPerUnit(): number | undefined {
    return this._pixelsPerUnit;
  }

  set pixelsPerUnit(value: number | undefined) {
    this._pixelsPerUnit = value;
    this.fitResolution();
  }

  get maxResolution(): number {
    return this._maxResolution;
  }

  set maxResolution(value: number) {
    this._maxResolution = value;
    this.fitResolution();
  }

  /** Called after the rectangle changed size. */
  protected onDimensionChanged(): void {}

  /** Gives the image the resolution that keeps `pixelsPerUnit` on the rectangle, when one is asked for. */
  protected fitResolution(): void {
    const resolution = fitted(this.extent, this._pixelsPerUnit, this._maxResolution);
    if (resolution) this.resize(resolution.width, resolution.height);
  }
}

function worldUnits(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

/** Resolution of an image of `density` pixels per unit on a rectangle; undefined when no density is asked for. */
function fitted(size: Readonly<ISize2>, density: number | undefined, limit: number): ISize2 | undefined {
  if (density === undefined || !(density > 0) || size.width <= 0 || size.height <= 0) return undefined;
  const max = limit > 0 ? limit : DEFAULT_MAX_RESOLUTION;
  const pixels = (units: number): number => Math.min(max, Math.max(RESOLUTION_STEP, Math.round((units * density) / RESOLUTION_STEP) * RESOLUTION_STEP));
  return { width: pixels(size.width), height: pixels(size.height) };
}
