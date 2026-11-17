import { Constants } from "@babylonjs/core/Engines/constants.js";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage.js";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import type { IColor3Like, IColor4Like } from "@babylonjs/core/Maths/math.like.js";
import { Matrix, Vector2, Vector3, Vector4 } from "@babylonjs/core/Maths/math.vector.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { IUvTransform } from "@spacexr/spatial-display-core";
import { DISPLAY_FRAGMENT_GLSL, DISPLAY_FRAGMENT_WGSL, DISPLAY_VERTEX_GLSL, DISPLAY_VERTEX_WGSL } from "./shaders.js";

/**
 * A color of the image that a surface lets through, as the green of a green
 * screen. It suits a flat background: the clear color of a rendered scene, the
 * backdrop of a picture or of a video.
 *
 * Each pixel is given a measure, from 0 on the key color to 1 on what holds
 * none of it. For a key with a hue (green, blue, magenta...) the measure is
 * the share of the pixel that is not key color, read from how far its key
 * channels stand above the others: soft edges and translucent parts come out
 * about as they were shot, and the key color is taken out of them. For a gray
 * key (black, white) it is the distance to the key color in the RGB cube.
 */
export interface IChromaKey {
  color: Readonly<IColor3Like>;
  /** Measure under which a pixel is let through entirely. Default 0.05 for a key with a hue, 0.1 for a gray one. */
  threshold?: number;
  /**
   * Width of the band, above the threshold, over which a pixel goes from let
   * through to kept. Narrow it to keep opaque the colors that are akin to the
   * key, at the cost of harder edges. Default 0.9 for a key with a hue, 0.25
   * for a gray one.
   */
  smoothness?: number;
}

/** A key color has a hue when its strongest channels stand this far above the others. */
const HUE_MARGIN = 0.2;

/** What the shader multiplies by while the image is read by the texture coordinates of the mesh. */
const NO_PROJECTOR = Matrix.Identity();

/**
 * Material of a surface that shows a display: the image as it is, with no
 * lighting, placed in the texture space of the mesh by a transform of its own.
 * Two surfaces can so show the same texture with different framings.
 *
 * Transparency composes as layers do: what stands behind the surface shows
 * through by `1 - opacity * alpha of the pixel`, and a pixel that carries
 * light without alpha, as additive materials leave in a render target, adds
 * that light scaled by the opacity.
 *
 * It ignores fog, clip planes and instances. A surface that needs them takes
 * a material of the application and gives it `display.texture`.
 */
export class DisplayMaterial extends ShaderMaterial {
  private readonly uv = new Vector4(1, 1, 0, 0);
  private readonly borderColor = new Color4(0, 0, 0, 1);
  private readonly backTint = new Color4(0, 0, 0, 1);
  private hasBack = false;
  private readonly alphaFlags = new Vector2(0, 0);
  private readonly keyColor = new Color3(0, 1, 0);
  /** A valid range even while the key is off: a shader must not divide by a band of zero width. */
  private readonly keyRange = new Vector3(0, 1, 0);
  private readonly keyMask = new Vector4(0, 0, 0, 0);
  private _opacity = 1;
  private _projector: Matrix | null = null;
  private _chromaKey: Readonly<IChromaKey> | null = null;
  private _alwaysBlended = false;

  constructor(name: string, scene: Scene) {
    const webgpu = scene.getEngine().isWebGPU;
    super(
      name,
      scene,
      webgpu ? { vertexSource: DISPLAY_VERTEX_WGSL, fragmentSource: DISPLAY_FRAGMENT_WGSL } : { vertexSource: DISPLAY_VERTEX_GLSL, fragmentSource: DISPLAY_FRAGMENT_GLSL },
      {
        attributes: ["position", "uv"],
        uniforms: ["world", "worldViewProjection", "projector", "projected", "uvTransform", "opacity", "imageAlpha", "border", "back", "backPlain", "keyColor", "keyRange", "keyMask"],
        samplers: ["displayTexture"],
        shaderLanguage: webgpu ? ShaderLanguage.WGSL : ShaderLanguage.GLSL,
      },
    );
    this.doNotSerialize = true;
    // The shader outputs colors multiplied by their alpha.
    this.alphaMode = Constants.ALPHA_PREMULTIPLIED_PORTERDUFF;
    this.setVector4("uvTransform", this.uv);
    this.setColor4("border", this.borderColor);
    this.setColor4("back", this.backTint);
    this.setFloat("backPlain", 0);
    this.setFloat("opacity", 1);
    this.setVector2("imageAlpha", this.alphaFlags);
    this.setColor3("keyColor", this.keyColor);
    this.setVector3("keyRange", this.keyRange);
    this.setVector4("keyMask", this.keyMask);
    this.setMatrix("projector", NO_PROJECTOR);
    this.setFloat("projected", 0);
  }

  /**
   * How the image is read: by the texture coordinates of the mesh (null), or
   * where each point of the mesh lands once projected with this matrix, from
   * world space to the image. The matrix is kept, not copied: it can be
   * rewritten in place at every frame.
   */
  get projector(): Matrix | null {
    return this._projector;
  }

  set projector(value: Matrix | null) {
    this._projector = value;
    // Without one the shader still multiplies by a matrix, and drops the result.
    this.setMatrix("projector", value ?? NO_PROJECTOR);
    this.setFloat("projected", value ? 1 : 0);
  }

  /** The texture of the display. */
  set image(texture: BaseTexture) {
    this.setTexture("displayTexture", texture);
  }

  /** 1 shows the image opaque, 0 hides it. */
  get opacity(): number {
    return this._opacity;
  }

  set opacity(value: number) {
    this._opacity = Math.min(1, Math.max(0, value));
    this.setFloat("opacity", this._opacity);
    this.refreshDepth();
  }

  /**
   * Draws the surface along with the blended meshes even when it is opaque,
   * so that what is blended and stands as far from the eye, as the glow of the
   * frame of a portal, is drawn before it and never shows over the image. An
   * opaque surface then writes its depth first, and hides what is drawn after
   * it as any opaque mesh does.
   */
  get alwaysBlended(): boolean {
    return this._alwaysBlended;
  }

  set alwaysBlended(value: boolean) {
    this._alwaysBlended = value;
    this.refreshDepth();
  }

  /** Lets the transparent pixels of the image through. Off, the image is opaque wherever it shows. */
  get useImageAlpha(): boolean {
    return this.alphaFlags.x === 1;
  }

  set useImageAlpha(value: boolean) {
    this.alphaFlags.x = value ? 1 : 0;
    this.setVector2("imageAlpha", this.alphaFlags);
    this.refreshDepth();
  }

  /**
   * True when the colors of the image are already multiplied by its alpha, as
   * those of a render target; false for a picture or a video, whose colors are
   * not. A wrong value shows as dark or bright fringes around what is see-through.
   */
  get premultipliedImage(): boolean {
    return this.alphaFlags.y === 1;
  }

  set premultipliedImage(value: boolean) {
    this.alphaFlags.y = value ? 1 : 0;
    this.setVector2("imageAlpha", this.alphaFlags);
  }

  /** A color of the image to let through; null for none. */
  get chromaKey(): Readonly<IChromaKey> | null {
    return this._chromaKey;
  }

  set chromaKey(value: Readonly<IChromaKey> | null) {
    this._chromaKey = value;
    if (value) {
      const { r, g, b } = value.color;
      // The channels the key is strongest in, and how far they stand above the others.
      const top = Math.max(r, g, b);
      const key = [r, g, b].map((c) => (c >= top - 1e-3 ? 1 : 0)) as [number, number, number];
      const others = [r, g, b].filter((_, i) => key[i] === 0);
      const margin = others.length > 0 ? top - Math.max(...others) : 0;
      const hued = margin >= HUE_MARGIN;
      this.keyColor.set(r, g, b);
      this.keyMask.set(key[0], key[1], key[2], hued ? margin : 0);
      this.keyRange.set(Math.max(0, value.threshold ?? (hued ? 0.05 : 0.1)), Math.max(1e-4, value.smoothness ?? (hued ? 0.9 : 0.25)), 1);
    } else {
      this.keyRange.set(0, 1, 0);
    }
    this.setColor3("keyColor", this.keyColor);
    this.setVector3("keyRange", this.keyRange);
    this.setVector4("keyMask", this.keyMask);
    this.refreshDepth();
  }

  /** Color of the surface where the image does not reach ("contain"). Default opaque black. */
  get border(): Readonly<IColor4Like> {
    return this.borderColor;
  }

  set border(value: Readonly<IColor4Like>) {
    this.borderColor.set(value.r, value.g, value.b, value.a);
    this.setColor4("border", this.borderColor);
    this.refreshDepth();
  }

  /**
   * Color of the faces turned away from the eye, which then show no image:
   * the plain back of a screen. null (default) for back faces that show the
   * image as the front ones do. It tells nothing of whether the back faces
   * are drawn: that is the culling of the material.
   */
  get backColor(): Readonly<IColor4Like> | null {
    return this.hasBack ? this.backTint : null;
  }

  set backColor(value: Readonly<IColor4Like> | null) {
    this.hasBack = value !== null;
    if (value) this.backTint.set(value.r, value.g, value.b, value.a);
    this.setColor4("back", this.backTint);
    this.setFloat("backPlain", value ? 1 : 0);
    this.refreshDepth();
  }

  /** Where the image stands in the texture space of the mesh. */
  setUvTransform(transform: Readonly<IUvTransform>): void {
    this.uv.set(transform.uScale, transform.vScale, transform.uOffset, transform.vOffset);
    this.setVector4("uvTransform", this.uv);
  }

  /** True when nothing shows through the surface. */
  get opaque(): boolean {
    return this._opacity >= 1 && this.alphaFlags.x === 0 && this._chromaKey === null && this.borderColor.a >= 1 && (!this.hasBack || this.backTint.a >= 1);
  }

  override needAlphaBlending(): boolean {
    return this._alwaysBlended || !this.opaque;
  }

  /** A blended surface writes no depth of its own: one that is opaque, yet drawn with the blended meshes, writes it in a pass before its colors. */
  private refreshDepth(): void {
    this.needDepthPrePass = this._alwaysBlended && this.opaque;
  }
}
