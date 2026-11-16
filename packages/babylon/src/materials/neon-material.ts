import { Constants } from "@babylonjs/core/Engines/constants.js";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage.js";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import type { IColor3Like } from "@babylonjs/core/Maths/math.like.js";
import { Vector4 } from "@babylonjs/core/Maths/math.vector.js";
import type { Observer } from "@babylonjs/core/Misc/observable.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { NEON_FRAGMENT_GLSL, NEON_FRAGMENT_WGSL, NEON_VERTEX_GLSL, NEON_VERTEX_WGSL } from "./shaders.js";

/** Light that travels along the tube. */
export interface INeonFlow {
  /** Depth of the waves: 0 for a steady light, 1 for waves that go down to black. */
  amplitude: number;
  /** Number of waves along the tube. A whole number closes the loop of a frame without a seam. */
  waves: number;
  /** Speed of the waves, in radians per second; negative to go the other way. */
  speed: number;
}

export interface INeonMaterialOptions {
  /** Default: an electric blue. */
  color?: Readonly<IColor3Like>;
  /** Multiplier of the light. Above 1 the centre of the faces burns out toward white. Default 1.5. */
  intensity?: number;
  /** How much each face fades from its centre line to its edges: 0 for flat faces, 1 for edges that vanish. Default 0.85. */
  softness?: number;
  /** White of the centre line of each face, from 0 to 1. Default 0.5. */
  core?: number;
  /**
   * true (default): the tube adds its light to what is behind it, as a
   * glow does, and shows through itself. false: an opaque tube.
   */
  additive?: boolean;
  /** Default: slow, shallow waves. `amplitude: 0` for a steady light. */
  flow?: Partial<INeonFlow>;
}

export const NEON_BLUE: Readonly<IColor3Like> = { r: 0.1, g: 0.55, b: 1 };

/**
 * Emissive material of a neon tube. It expects texture coordinates laid out
 * as those of the frame of a portal: u along the tube, v across each face.
 * It is not lit, and ignores fog, clip planes and instances.
 */
export class NeonMaterial extends ShaderMaterial {
  /** Light that travels along the tube; its members can be changed at any time. */
  readonly flow: INeonFlow;

  private readonly tint = new Color3();
  private readonly shape = new Vector4();
  private readonly flowUniform = new Vector4();
  private readonly additive: boolean;
  private phase = 0;
  private observer: Observer<Scene> | null;

  constructor(name: string, scene: Scene, options: Readonly<INeonMaterialOptions> = {}) {
    const webgpu = scene.getEngine().isWebGPU;
    super(
      name,
      scene,
      webgpu ? { vertexSource: NEON_VERTEX_WGSL, fragmentSource: NEON_FRAGMENT_WGSL } : { vertexSource: NEON_VERTEX_GLSL, fragmentSource: NEON_FRAGMENT_GLSL },
      {
        attributes: ["position", "uv"],
        uniforms: ["worldViewProjection", "neonColor", "neonShape", "neonFlow"],
        shaderLanguage: webgpu ? ShaderLanguage.WGSL : ShaderLanguage.GLSL,
      },
    );
    this.doNotSerialize = true;
    this.additive = options.additive ?? true;
    if (this.additive) {
      // Light adds up: both sides of the tube show, in any order.
      this.alphaMode = Constants.ALPHA_ONEONE;
      this.backFaceCulling = false;
    }
    const color = options.color ?? NEON_BLUE;
    this.tint.set(color.r, color.g, color.b);
    this.shape.set(options.intensity ?? 1.5, options.softness ?? 0.85, options.core ?? 0.5, 0);
    this.flow = { amplitude: 0.25, waves: 4, speed: 1.5, ...options.flow };
    this.setColor3("neonColor", this.tint);
    this.setVector4("neonShape", this.shape);
    this.setVector4("neonFlow", this.flowUniform);
    this.updateFlow(0);
    this.observer = scene.onBeforeRenderObservable.add(() => this.updateFlow(scene.getEngine().getDeltaTime() / 1000));
  }

  get color(): Readonly<IColor3Like> {
    return this.tint;
  }

  set color(value: Readonly<IColor3Like>) {
    this.tint.set(value.r, value.g, value.b);
    this.setColor3("neonColor", this.tint);
  }

  get intensity(): number {
    return this.shape.x;
  }

  set intensity(value: number) {
    this.shape.x = Math.max(0, value);
    this.setVector4("neonShape", this.shape);
  }

  get softness(): number {
    return this.shape.y;
  }

  set softness(value: number) {
    this.shape.y = Math.min(1, Math.max(0, value));
    this.setVector4("neonShape", this.shape);
  }

  get core(): number {
    return this.shape.z;
  }

  set core(value: number) {
    this.shape.z = Math.min(1, Math.max(0, value));
    this.setVector4("neonShape", this.shape);
  }

  override needAlphaBlending(): boolean {
    return this.additive;
  }

  override dispose(forceDisposeEffect?: boolean, forceDisposeTextures?: boolean, notBoundToMesh?: boolean): void {
    if (this.observer) this.getScene().onBeforeRenderObservable.remove(this.observer);
    this.observer = null;
    super.dispose(forceDisposeEffect, forceDisposeTextures, notBoundToMesh);
  }

  private updateFlow(deltaSeconds: number): void {
    const flow = this.flow;
    // Kept within one turn so that the phase stays precise after hours of running.
    this.phase = (this.phase + flow.speed * deltaSeconds) % (2 * Math.PI);
    this.flowUniform.set(Math.min(1, Math.max(0, flow.amplitude)), flow.waves, this.phase, 0);
    this.setVector4("neonFlow", this.flowUniform);
  }
}
