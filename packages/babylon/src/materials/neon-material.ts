import { Constants } from "@babylonjs/core/Engines/constants.js";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage.js";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import type { IColor3Like } from "@babylonjs/core/Maths/math.like.js";
import { Vector4 } from "@babylonjs/core/Maths/math.vector.js";
import type { Observer } from "@babylonjs/core/Misc/observable.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { NEON_FRAGMENT_GLSL, NEON_FRAGMENT_WGSL, NEON_VERTEX_GLSL, NEON_VERTEX_WGSL } from "./shaders.js";

/** Light that travels along the frame. */
export interface INeonFlow {
  /** Depth of the waves: 0 for a steady light, 1 for waves that go down to black. */
  amplitude: number;
  /** Number of waves along the frame. A whole number closes the loop without a seam. */
  waves: number;
  /** Speed of the waves, in radians per second; negative to go the other way. */
  speed: number;
}

export interface INeonMaterialOptions {
  /** Color of the line. Default white. */
  lineColor?: Readonly<IColor3Like>;
  /** Width of the line, in world units. The frame of a portal sets it to the section of its tube. Default 0.012. */
  lineWidth?: number;
  /** Smallest width of the line on screen, in pixels: from afar, or with a width of 0, the line stays a hairline. Default 1.5. */
  minLineWidth?: number;
  /** Color of the glow around the line. Default: an electric blue. */
  glowColor?: Readonly<IColor3Like>;
  /** How far the glow reaches from the line, in world units. 0 for the bare line. Default 0.18. */
  glowSize?: number;
  /** Brightness of the glow. It does not widen it: the glow keeps the same soft fade. Default 1.4. */
  glowIntensity?: number;
  /** How fast the glow fades away from the line: 1 for a straight fade, more for a light held close to the line. Default 2.5. */
  glowFalloff?: number;
  /**
   * How much the glow hides what stands behind it, from 0 to 1. At 0 it only
   * adds to the background, as light does, and is lost on a bright one. At 1
   * (default) it tints the background, more and more toward the line, so
   * that it reads on any color. The line itself is opaque.
   */
  cover?: number;
  /** Default: a steady light. */
  flow?: Partial<INeonFlow>;
}

export const NEON_BLUE: Readonly<IColor3Like> = { r: 0.1, g: 0.55, b: 1 };
export const NEON_WHITE: Readonly<IColor3Like> = { r: 1, g: 1, b: 1 };

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/**
 * Material of the glow of a line of light, and of that line as seen from afar.
 *
 * It expects ribbons as the core package builds them along the sides of a
 * frame (`createRectFrameHalo`): their normals and their second set of texture
 * coordinates tell the shader where to spread the light.
 *
 * It is not lit, and ignores fog, clip planes and instances. The glow fades
 * out, so the material is always blended over what stands behind it.
 */
export class NeonMaterial extends ShaderMaterial {
  /** Light that travels along the frame; its members can be changed at any time. */
  readonly flow: INeonFlow;

  private readonly line = new Color3();
  private readonly glow = new Color3();
  /** x width in world units, y smallest width in pixels, z height of the viewport in pixels. */
  private readonly lineShape = new Vector4();
  /** x radius in world units, y intensity, z falloff, w cover. */
  private readonly glowShape = new Vector4();
  private readonly flowUniform = new Vector4();
  private phase = 0;
  private observer: Observer<Scene> | null;

  constructor(name: string, scene: Scene, options: Readonly<INeonMaterialOptions> = {}) {
    const webgpu = scene.getEngine().isWebGPU;
    super(
      name,
      scene,
      webgpu ? { vertexSource: NEON_VERTEX_WGSL, fragmentSource: NEON_FRAGMENT_WGSL } : { vertexSource: NEON_VERTEX_GLSL, fragmentSource: NEON_FRAGMENT_GLSL },
      {
        attributes: ["position", "normal", "uv", "uv2"],
        uniforms: ["worldView", "projection", "lineColor", "glowColor", "lineShape", "glowShape", "neonFlow"],
        shaderLanguage: webgpu ? ShaderLanguage.WGSL : ShaderLanguage.GLSL,
      },
    );
    this.doNotSerialize = true;
    // The shader outputs colors multiplied by their alpha. The ribbons face the eye from either side of the frame.
    this.alphaMode = Constants.ALPHA_PREMULTIPLIED_PORTERDUFF;
    this.backFaceCulling = false;
    const line = options.lineColor ?? NEON_WHITE;
    const glow = options.glowColor ?? NEON_BLUE;
    this.line.set(line.r, line.g, line.b);
    this.glow.set(glow.r, glow.g, glow.b);
    this.lineShape.set(Math.max(0, options.lineWidth ?? 0.012), Math.max(0, options.minLineWidth ?? 1.5), 1, 0);
    this.glowShape.set(Math.max(0, options.glowSize ?? 0.18), Math.max(0, options.glowIntensity ?? 1.4), Math.max(0.01, options.glowFalloff ?? 2.5), clamp01(options.cover ?? 1));
    this.flow = { amplitude: 0, waves: 4, speed: 1.5, ...options.flow };
    this.setColor3("lineColor", this.line);
    this.setColor3("glowColor", this.glow);
    this.setVector4("lineShape", this.lineShape);
    this.setVector4("glowShape", this.glowShape);
    this.setVector4("neonFlow", this.flowUniform);
    this.update(0);
    this.observer = scene.onBeforeRenderObservable.add(() => this.update(scene.getEngine().getDeltaTime() / 1000));
    // The smallest width of the line is counted in pixels of what is drawn into: the canvas, or the image of a display.
    this.onBindObservable.add(() => {
      const shape = this.lineShape;
      this.getEffect()?.setFloat4("lineShape", shape.x, shape.y, scene.getEngine().getRenderHeight(), 0);
    });
  }

  get lineColor(): Readonly<IColor3Like> {
    return this.line;
  }

  set lineColor(value: Readonly<IColor3Like>) {
    this.line.set(value.r, value.g, value.b);
    this.setColor3("lineColor", this.line);
  }

  /** Width of the line, in world units. */
  get lineWidth(): number {
    return this.lineShape.x;
  }

  set lineWidth(value: number) {
    this.lineShape.x = Math.max(0, value);
    this.setVector4("lineShape", this.lineShape);
  }

  /** Smallest width of the line on screen, in pixels. */
  get minLineWidth(): number {
    return this.lineShape.y;
  }

  set minLineWidth(value: number) {
    this.lineShape.y = Math.max(0, value);
    this.setVector4("lineShape", this.lineShape);
  }

  get glowColor(): Readonly<IColor3Like> {
    return this.glow;
  }

  set glowColor(value: Readonly<IColor3Like>) {
    this.glow.set(value.r, value.g, value.b);
    this.setColor3("glowColor", this.glow);
  }

  /** How far the glow reaches from the line, in world units. */
  get glowSize(): number {
    return this.glowShape.x;
  }

  set glowSize(value: number) {
    this.glowShape.x = Math.max(0, value);
    this.setVector4("glowShape", this.glowShape);
  }

  get glowIntensity(): number {
    return this.glowShape.y;
  }

  set glowIntensity(value: number) {
    this.glowShape.y = Math.max(0, value);
    this.setVector4("glowShape", this.glowShape);
  }

  get glowFalloff(): number {
    return this.glowShape.z;
  }

  set glowFalloff(value: number) {
    this.glowShape.z = Math.max(0.01, value);
    this.setVector4("glowShape", this.glowShape);
  }

  /** See `INeonMaterialOptions.cover`. */
  get cover(): number {
    return this.glowShape.w;
  }

  set cover(value: number) {
    this.glowShape.w = clamp01(value);
    this.setVector4("glowShape", this.glowShape);
  }

  override needAlphaBlending(): boolean {
    return true;
  }

  override dispose(forceDisposeEffect?: boolean, forceDisposeTextures?: boolean, notBoundToMesh?: boolean): void {
    if (this.observer) this.getScene().onBeforeRenderObservable.remove(this.observer);
    this.observer = null;
    super.dispose(forceDisposeEffect, forceDisposeTextures, notBoundToMesh);
  }

  /** Once per frame: `flow`, which the application changes in place, and the height of the canvas. */
  private update(deltaSeconds: number): void {
    const flow = this.flow;
    // Kept within one turn so that the phase stays precise after hours of running.
    this.phase = (this.phase + flow.speed * deltaSeconds) % (2 * Math.PI);
    this.flowUniform.set(clamp01(flow.amplitude), flow.waves, this.phase, 0);
    this.setVector4("neonFlow", this.flowUniform);
    this.lineShape.z = Math.max(1, this.getScene().getEngine().getRenderHeight());
    this.setVector4("lineShape", this.lineShape);
  }
}
