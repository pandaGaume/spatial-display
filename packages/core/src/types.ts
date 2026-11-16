/** Size of an image in pixels, or of a rectangle in world units. */
export interface ISize2 {
  width: number;
  height: number;
}

export interface IVec2 {
  x: number;
  y: number;
}

/** Something that shows an image: a render target, a video, a canvas... */
export interface IDisplay {
  /** Size of the image, in pixels. */
  readonly resolution: Readonly<ISize2>;
  dispose(): void;
}

/** A display with a place in the world: its image covers a rectangle of known size. */
export interface IPhysicalDisplay extends IDisplay {
  /** Size of the rectangle the image covers, in world units. */
  readonly dimension: Readonly<ISize2>;
  /** Pixels of the image per world unit, along the width and along the height. */
  readonly pixelPerUnit: Readonly<IVec2>;
  /** Pixels per inch along the width, a world unit being a meter. */
  readonly dpi: number;
}

export const METERS_PER_INCH = 0.0254;

/** Pixels per world unit of an image of `resolution` shown on a rectangle of `dimension`. */
export const pixelPerUnit = (resolution: Readonly<ISize2>, dimension: Readonly<ISize2>): IVec2 => ({
  x: dimension.width > 0 ? resolution.width / dimension.width : 0,
  y: dimension.height > 0 ? resolution.height / dimension.height : 0,
});
