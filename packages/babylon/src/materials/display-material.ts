import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage.js";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture.js";
import { Color4 } from "@babylonjs/core/Maths/math.color.js";
import type { IColor4Like } from "@babylonjs/core/Maths/math.like.js";
import { Vector4 } from "@babylonjs/core/Maths/math.vector.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { IUvTransform } from "@spacexr/spatial-display-core";
import { DISPLAY_FRAGMENT_GLSL, DISPLAY_FRAGMENT_WGSL, DISPLAY_VERTEX_GLSL, DISPLAY_VERTEX_WGSL } from "./shaders.js";

/**
 * Material of a surface that shows a display: the image as it is, with no
 * lighting, placed in the texture space of the mesh by a transform of its own.
 * Two surfaces can so show the same texture with different framings.
 *
 * It ignores fog, clip planes and instances. A surface that needs them takes
 * a material of the application and gives it `display.texture`.
 */
export class DisplayMaterial extends ShaderMaterial {
  private readonly uv = new Vector4(1, 1, 0, 0);
  private readonly borderColor = new Color4(0, 0, 0, 1);
  private _opacity = 1;
  private _useImageAlpha = false;

  constructor(name: string, scene: Scene) {
    const webgpu = scene.getEngine().isWebGPU;
    super(
      name,
      scene,
      webgpu ? { vertexSource: DISPLAY_VERTEX_WGSL, fragmentSource: DISPLAY_FRAGMENT_WGSL } : { vertexSource: DISPLAY_VERTEX_GLSL, fragmentSource: DISPLAY_FRAGMENT_GLSL },
      {
        attributes: ["position", "uv"],
        uniforms: ["worldViewProjection", "uvTransform", "opacity", "imageAlpha", "border"],
        samplers: ["displayTexture"],
        shaderLanguage: webgpu ? ShaderLanguage.WGSL : ShaderLanguage.GLSL,
      },
    );
    this.doNotSerialize = true;
    this.setVector4("uvTransform", this.uv);
    this.setColor4("border", this.borderColor);
    this.setFloat("opacity", 1);
    this.setFloat("imageAlpha", 0);
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
  }

  /** Takes the transparency of the image into account. Off, the image is opaque wherever it shows. */
  get useImageAlpha(): boolean {
    return this._useImageAlpha;
  }

  set useImageAlpha(value: boolean) {
    this._useImageAlpha = value;
    this.setFloat("imageAlpha", value ? 1 : 0);
  }

  /** Color of the surface where the image does not reach ("contain"). Default opaque black. */
  get border(): Readonly<IColor4Like> {
    return this.borderColor;
  }

  set border(value: Readonly<IColor4Like>) {
    this.borderColor.set(value.r, value.g, value.b, value.a);
    this.setColor4("border", this.borderColor);
  }

  /** Where the image stands in the texture space of the mesh. */
  setUvTransform(transform: Readonly<IUvTransform>): void {
    this.uv.set(transform.uScale, transform.vScale, transform.uOffset, transform.vOffset);
    this.setVector4("uvTransform", this.uv);
  }

  override needAlphaBlending(): boolean {
    return this._opacity < 1 || this._useImageAlpha || this.borderColor.a < 1;
  }
}
