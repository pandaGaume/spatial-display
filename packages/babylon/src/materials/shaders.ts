/**
 * Shader sources of the materials of this package, in GLSL for WebGL and in
 * WGSL for WebGPU: neither engine has to translate the other language.
 * The two versions of a shader must be kept in step.
 */

// ---------------------------------------------------------------------------
// Display: an unlit image, placed in the texture space of the surface.

export const DISPLAY_VERTEX_GLSL = `precision highp float;
attribute vec3 position;
attribute vec2 uv;
uniform mat4 worldViewProjection;
uniform vec4 uvTransform;
varying vec2 vUV;
void main(void) {
  vUV = uv * uvTransform.xy + uvTransform.zw;
  gl_Position = worldViewProjection * vec4(position, 1.0);
}`;

export const DISPLAY_FRAGMENT_GLSL = `precision highp float;
varying vec2 vUV;
uniform sampler2D displayTexture;
uniform float opacity;
uniform float imageAlpha;
uniform vec4 border;
void main(void) {
  vec2 inside = step(vec2(0.0), vUV) * step(vUV, vec2(1.0));
  vec4 texel = texture2D(displayTexture, vUV);
  vec4 shown = vec4(texel.rgb, mix(1.0, texel.a, imageAlpha));
  vec4 color = mix(border, shown, inside.x * inside.y);
  gl_FragColor = vec4(color.rgb, color.a * opacity);
}`;

export const DISPLAY_VERTEX_WGSL = `attribute position: vec3f;
attribute uv: vec2f;
uniform worldViewProjection: mat4x4f;
uniform uvTransform: vec4f;
varying vUV: vec2f;
@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  vertexOutputs.vUV = vertexInputs.uv * uniforms.uvTransform.xy + uniforms.uvTransform.zw;
  vertexOutputs.position = uniforms.worldViewProjection * vec4f(vertexInputs.position, 1.0);
}`;

export const DISPLAY_FRAGMENT_WGSL = `varying vUV: vec2f;
var displayTexture: texture_2d<f32>;
var displayTextureSampler: sampler;
uniform opacity: f32;
uniform imageAlpha: f32;
uniform border: vec4f;
@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let inside: vec2f = step(vec2f(0.0), input.vUV) * step(input.vUV, vec2f(1.0));
  let texel: vec4f = textureSample(displayTexture, displayTextureSampler, input.vUV);
  let shown: vec4f = vec4f(texel.rgb, mix(1.0, texel.a, uniforms.imageAlpha));
  let color: vec4f = mix(uniforms.border, shown, inside.x * inside.y);
  fragmentOutputs.color = vec4f(color.rgb, color.a * uniforms.opacity);
}`;

// ---------------------------------------------------------------------------
// Neon: an emissive tube. v runs across a face, u along the tube.
// neonShape: x intensity, y softness, z white core.
// neonFlow: x amplitude, y number of waves along u, z phase in radians.

export const NEON_VERTEX_GLSL = `precision highp float;
attribute vec3 position;
attribute vec2 uv;
uniform mat4 worldViewProjection;
varying vec2 vUV;
void main(void) {
  vUV = uv;
  gl_Position = worldViewProjection * vec4(position, 1.0);
}`;

export const NEON_FRAGMENT_GLSL = `precision highp float;
varying vec2 vUV;
uniform vec3 neonColor;
uniform vec4 neonShape;
uniform vec4 neonFlow;
void main(void) {
  float across = abs(vUV.y - 0.5) * 2.0;
  float body = 1.0 - neonShape.y * smoothstep(0.0, 1.0, across);
  float wave = 1.0 - neonFlow.x * (0.5 + 0.5 * sin(6.28318530718 * neonFlow.y * vUV.x - neonFlow.z));
  float glow = body * wave;
  float core = neonShape.z * pow(1.0 - across, 3.0);
  vec3 rgb = mix(neonColor, vec3(1.0), core) * neonShape.x;
  gl_FragColor = vec4(rgb * glow, glow);
}`;

export const NEON_VERTEX_WGSL = `attribute position: vec3f;
attribute uv: vec2f;
uniform worldViewProjection: mat4x4f;
varying vUV: vec2f;
@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  vertexOutputs.vUV = vertexInputs.uv;
  vertexOutputs.position = uniforms.worldViewProjection * vec4f(vertexInputs.position, 1.0);
}`;

export const NEON_FRAGMENT_WGSL = `varying vUV: vec2f;
uniform neonColor: vec3f;
uniform neonShape: vec4f;
uniform neonFlow: vec4f;
@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let across: f32 = abs(input.vUV.y - 0.5) * 2.0;
  let body: f32 = 1.0 - uniforms.neonShape.y * smoothstep(0.0, 1.0, across);
  let wave: f32 = 1.0 - uniforms.neonFlow.x * (0.5 + 0.5 * sin(6.28318530718 * uniforms.neonFlow.y * input.vUV.x - uniforms.neonFlow.z));
  let glow: f32 = body * wave;
  let core: f32 = uniforms.neonShape.z * pow(1.0 - across, 3.0);
  let rgb: vec3f = mix(uniforms.neonColor, vec3f(1.0), core) * uniforms.neonShape.x;
  fragmentOutputs.color = vec4f(rgb * glow, glow);
}`;
