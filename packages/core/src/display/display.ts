import type { IDisplay, ISize2 } from "../types.js";

/**
 * Base of the displays: an image of a given size in pixels.
 *
 * It knows nothing of rendering. A subclass overrides `onResized` to give the
 * image it draws its new size.
 */
export class Display implements IDisplay {
  private readonly size: ISize2;

  /** `onResized` is not called from here: a subclass allocates its image itself once it is built. */
  constructor(resolution: Readonly<ISize2> = { width: 0, height: 0 }) {
    this.size = { width: wholePixels(resolution.width), height: wholePixels(resolution.height) };
  }

  /** Size of the image, in pixels. */
  get resolution(): Readonly<ISize2> {
    return this.size;
  }

  /** Changes the size of the image, in pixels. Sizes are rounded to whole pixels. */
  resize(width: number, height: number): void {
    width = wholePixels(width);
    height = wholePixels(height);
    if (width === this.size.width && height === this.size.height) return;
    this.size.width = width;
    this.size.height = height;
    this.onResized();
  }

  dispose(): void {}

  /** Called after the image changed size. */
  protected onResized(): void {}
}

function wholePixels(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}
