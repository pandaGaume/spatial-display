/**
 * How an image fills a surface whose proportions differ from its own.
 * - "stretch": the image covers the whole surface, deformed.
 * - "contain": the whole image shows, with bands on two sides.
 * - "cover": the image covers the whole surface, cropped on two sides.
 */
export type DisplayFit = "stretch" | "contain" | "cover";

/**
 * Texture coordinates of the image from those of the surface:
 * `image = surface * scale + offset`. Outside [0, 1] there is no image.
 */
export interface IUvTransform {
  uScale: number;
  vScale: number;
  uOffset: number;
  vOffset: number;
}

/** Rectangle of the texture coordinates a mesh uses. */
export interface IUvBounds {
  minU: number;
  minV: number;
  maxU: number;
  maxV: number;
}

export const UNIT_UV_BOUNDS: Readonly<IUvBounds> = { minU: 0, minV: 0, maxU: 1, maxV: 1 };

/**
 * Transform that shows an image of ratio `imageAspect` (width over height) on
 * a surface of ratio `surfaceAspect` whose texture coordinates span [0, 1].
 * A ratio that is not a positive number gives "stretch".
 */
export function fitUv(imageAspect: number, surfaceAspect: number, fit: DisplayFit, out: IUvTransform = { uScale: 1, vScale: 1, uOffset: 0, vOffset: 0 }): IUvTransform {
  out.uScale = 1;
  out.vScale = 1;
  if (fit !== "stretch" && imageAspect > 0 && surfaceAspect > 0 && Number.isFinite(imageAspect) && Number.isFinite(surfaceAspect)) {
    // Above 1, the image is wider than the surface.
    const ratio = imageAspect / surfaceAspect;
    const wider = ratio > 1;
    // "cover" crops along the axis where the image is in excess; "contain" leaves bands along the other one.
    if (wider === (fit === "cover")) out.uScale = 1 / ratio;
    else out.vScale = ratio;
  }
  out.uOffset = (1 - out.uScale) / 2;
  out.vOffset = (1 - out.vScale) / 2;
  return out;
}

/** Bounds of a list of texture coordinates (u, v, u, v...); the unit square when the list is empty. */
export function uvBoundsOf(uvs: ArrayLike<number> | null | undefined): IUvBounds {
  if (!uvs || uvs.length < 2) return { ...UNIT_UV_BOUNDS };
  let minU = Infinity;
  let minV = Infinity;
  let maxU = -Infinity;
  let maxV = -Infinity;
  for (let i = 0; i + 1 < uvs.length; i += 2) {
    const u = uvs[i] as number;
    const v = uvs[i + 1] as number;
    if (u < minU) minU = u;
    if (u > maxU) maxU = u;
    if (v < minV) minV = v;
    if (v > maxV) maxV = v;
  }
  return { minU, minV, maxU, maxV };
}

/**
 * Makes `transform` apply to a surface whose texture coordinates span `bounds`
 * instead of [0, 1]: the image then fills the part of the texture space the mesh uses.
 */
export function applyUvBounds(transform: Readonly<IUvTransform>, bounds: Readonly<IUvBounds>, out: IUvTransform = { uScale: 1, vScale: 1, uOffset: 0, vOffset: 0 }): IUvTransform {
  const du = bounds.maxU - bounds.minU;
  const dv = bounds.maxV - bounds.minV;
  const uScale = du > 0 ? transform.uScale / du : transform.uScale;
  const vScale = dv > 0 ? transform.vScale / dv : transform.vScale;
  out.uOffset = transform.uOffset - (du > 0 ? bounds.minU * uScale : 0);
  out.vOffset = transform.vOffset - (dv > 0 ? bounds.minV * vScale : 0);
  out.uScale = uScale;
  out.vScale = vScale;
  return out;
}
