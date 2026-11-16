/**
 * Shader sources of the materials of this package, in GLSL for WebGL and in
 * WGSL for WebGPU: neither engine has to translate the other language.
 * The two versions of a shader must be kept in step.
 */

// ---------------------------------------------------------------------------
// Display: an unlit image, placed in the texture space of the surface.
//
// The fragment shader outputs colors multiplied by their alpha, for a blend of
// (ONE, ONE_MINUS_SRC_ALPHA). That is the only blend that composes a render
// target correctly: its colors are premultiplied as soon as its background is
// transparent, its antialiased edges included, and the light that additive
// materials drew into it carries no alpha at all.
//
// imageAlpha: x is 1 to use the alpha of the image, y is 1 when the colors of
// the image are already multiplied by its alpha.
// keyRange: x threshold, y smoothness, z is 1 when the color key is on.
// keyMask: xyz is 1 on the channels the key color is strongest in, w tells by
// how much they stand above the others; w is 0 for a gray key.
//
// Color key. A pixel shot on the key color is a mix of what was in front and
// of the key color. For a key with a hue, the share of key color in the pixel
// is read from how far its key channels stand above the others, which holds
// for soft edges and translucent parts; for a gray key the only measure is the
// distance to the key color. That share is then taken out of the color.

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
uniform vec2 imageAlpha;
uniform vec4 border;
uniform vec3 keyColor;
uniform vec3 keyRange;
uniform vec4 keyMask;
void main(void) {
  vec2 inside = step(vec2(0.0), vUV) * step(vUV, vec2(1.0));
  vec4 texel = texture2D(displayTexture, vUV);
  float alpha = mix(1.0, texel.a, imageAlpha.x);
  vec3 color = texel.rgb * mix(1.0, texel.a, imageAlpha.x * (1.0 - imageAlpha.y));
  vec3 straight = color / max(alpha, 0.0001);
  vec3 lifted = straight + (1.0 - keyMask.xyz) * 2.0;
  vec3 dropped = straight - keyMask.xyz * 2.0;
  float share = clamp((min(lifted.r, min(lifted.g, lifted.b)) - max(dropped.r, max(dropped.g, dropped.b))) / max(keyMask.w, 0.0001), 0.0, 1.0);
  float hued = step(0.0001, keyMask.w);
  float away = mix(distance(straight, keyColor), 1.0 - share, hued);
  float keep = clamp((away - keyRange.x) / keyRange.y, 0.0, 1.0);
  share = mix(1.0 - keep, share, hued);
  vec3 body = clamp((straight - share * keyColor) / max(1.0 - share, 0.001), vec3(0.0), vec3(1.0));
  color = mix(color, body * keep * alpha, keyRange.z);
  alpha *= mix(1.0, keep, keyRange.z);
  vec4 shown = mix(vec4(border.rgb * border.a, border.a), vec4(color, alpha), inside.x * inside.y);
  gl_FragColor = shown * opacity;
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
uniform imageAlpha: vec2f;
uniform border: vec4f;
uniform keyColor: vec3f;
uniform keyRange: vec3f;
uniform keyMask: vec4f;
@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let inside: vec2f = step(vec2f(0.0), input.vUV) * step(input.vUV, vec2f(1.0));
  let texel: vec4f = textureSample(displayTexture, displayTextureSampler, input.vUV);
  var alpha: f32 = mix(1.0, texel.a, uniforms.imageAlpha.x);
  var color: vec3f = texel.rgb * mix(1.0, texel.a, uniforms.imageAlpha.x * (1.0 - uniforms.imageAlpha.y));
  let straight: vec3f = color / max(alpha, 0.0001);
  let lifted: vec3f = straight + (vec3f(1.0) - uniforms.keyMask.xyz) * 2.0;
  let dropped: vec3f = straight - uniforms.keyMask.xyz * 2.0;
  var share: f32 = clamp((min(lifted.r, min(lifted.g, lifted.b)) - max(dropped.r, max(dropped.g, dropped.b))) / max(uniforms.keyMask.w, 0.0001), 0.0, 1.0);
  let hued: f32 = step(0.0001, uniforms.keyMask.w);
  let away: f32 = mix(distance(straight, uniforms.keyColor), 1.0 - share, hued);
  let keep: f32 = clamp((away - uniforms.keyRange.x) / uniforms.keyRange.y, 0.0, 1.0);
  share = mix(1.0 - keep, share, hued);
  let body: vec3f = clamp((straight - share * uniforms.keyColor) / max(1.0 - share, 0.001), vec3f(0.0), vec3f(1.0));
  color = mix(color, body * keep * alpha, uniforms.keyRange.z);
  alpha = alpha * mix(1.0, keep, uniforms.keyRange.z);
  let shown: vec4f = mix(vec4f(uniforms.border.rgb * uniforms.border.a, uniforms.border.a), vec4f(color, alpha), inside.x * inside.y);
  fragmentOutputs.color = shown * uniforms.opacity;
}`;

// ---------------------------------------------------------------------------
// Neon: the glow of a line of light, and that line as seen from afar.
//
// The mesh is a ribbon along each side of a frame. uv2.x is -1 at the start of
// the side and 1 at its end, uv2.y is -1 on one edge of the ribbon and 1 on
// the other, `normal` holds the direction of the side and uv.y its length. The
// vertex shader moves the vertices in view space: the ribbon turns about its
// side to face the eye, so that the glow keeps its width from every angle, and
// reaches beyond both ends of the side. The fragment shader measures the
// distance to the side itself, which rounds those ends: two ribbons meet on a
// corner with the same round end.
//
// The ribbon also draws the line, never under a width given in pixels: where
// the tube that gives the line its body gets thinner than a pixel, the line
// still shows.
//
// uv.x runs along the frame, for the light that travels along it.
// lineShape: x width of the line in world units, y its smallest width in
// pixels, z height of the viewport in pixels.
// glowShape: x radius in world units, y intensity, z falloff, w cover.
// neonFlow: x amplitude, y number of waves along the frame, z phase in radians.
//
// As the display, it outputs colors multiplied by their alpha. The glow hides
// what stands behind it by its falloff alone, times the cover: it stays a
// gradient from the line outward, whatever its intensity, which only makes its
// light brighter. With a cover of 0 the glow only adds to the background. The
// line is opaque.

export const NEON_VERTEX_GLSL = `precision highp float;
attribute vec3 position;
attribute vec3 normal;
attribute vec2 uv;
attribute vec2 uv2;
uniform mat4 worldView;
uniform mat4 projection;
uniform vec4 lineShape;
uniform vec4 glowShape;
varying float vAlong;
varying vec3 vRibbon;
void main(void) {
  vec4 center = worldView * vec4(position, 1.0);
  vec3 axis = (worldView * vec4(normal, 0.0)).xyz;
  vec3 across = cross(axis, center.xyz);
  float reach = length(across);
  vec3 side = reach > 0.00001 ? across / reach : vec3(0.0, 1.0, 0.0);
  // World units a pixel covers at this depth, for a perspective or an orthographic camera.
  float pixel = mix(abs(center.z), 1.0, projection[3][3]) * 2.0 / (abs(projection[1][1]) * max(lineShape.z, 1.0));
  // The ribbon is wide enough for the glow, and for the line with a pixel to smooth its edge.
  float spread = max(glowShape.x, max(lineShape.x, lineShape.y * pixel) * 0.5 + pixel);
  gl_Position = projection * vec4(center.xyz + (side * uv2.y + axis * uv2.x) * spread, 1.0);
  vAlong = uv.x;
  // Along the side from its start, and across it, in world units; then the length of the side.
  vRibbon = vec3(mix(-spread, uv.y + spread, uv2.x * 0.5 + 0.5), uv2.y * spread, uv.y);
}`;

export const NEON_FRAGMENT_GLSL = `#extension GL_OES_standard_derivatives : enable
precision highp float;
varying float vAlong;
varying vec3 vRibbon;
uniform vec3 lineColor;
uniform vec3 glowColor;
uniform vec4 lineShape;
uniform vec4 glowShape;
uniform vec4 neonFlow;
void main(void) {
  float wave = 1.0 - neonFlow.x * (0.5 + 0.5 * sin(6.28318530718 * neonFlow.y * vAlong - neonFlow.z));
  // Distance to the side, ends included.
  float beyond = max(max(-vRibbon.x, vRibbon.x - vRibbon.z), 0.0);
  float distanceToLine = length(vec2(vRibbon.y, beyond));
  // The glow: a wide light in its own color, and a tight one against the line that burns toward the color of the line.
  float near = 1.0 - min(distanceToLine / max(glowShape.x, 0.000001), 1.0);
  float wide = pow(near, glowShape.z) * wave;
  float tight = pow(near, glowShape.z * 6.0) * wave;
  vec3 light = (glowColor * wide + lineColor * tight * 0.6) * glowShape.y;
  vec4 glow = vec4(min(light, vec3(1.0)), wide * glowShape.w);
  // The line: never thinner than its smallest width in pixels, with a smooth edge.
  float pixel = max(fwidth(vRibbon.y), 0.0000001);
  float halfLine = max(lineShape.x, lineShape.y * pixel) * 0.5;
  float line = 1.0 - smoothstep(halfLine - pixel * 0.5, halfLine + pixel * 0.5, distanceToLine);
  gl_FragColor = mix(glow, vec4(lineColor, 1.0), line);
}`;

export const NEON_VERTEX_WGSL = `attribute position: vec3f;
attribute normal: vec3f;
attribute uv: vec2f;
attribute uv2: vec2f;
uniform worldView: mat4x4f;
uniform projection: mat4x4f;
uniform lineShape: vec4f;
uniform glowShape: vec4f;
varying vAlong: f32;
varying vRibbon: vec3f;
@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  let center: vec4f = uniforms.worldView * vec4f(vertexInputs.position, 1.0);
  let axis: vec3f = (uniforms.worldView * vec4f(vertexInputs.normal, 0.0)).xyz;
  let across: vec3f = cross(axis, center.xyz);
  let reach: f32 = length(across);
  let side: vec3f = select(vec3f(0.0, 1.0, 0.0), across / max(reach, 0.00001), reach > 0.00001);
  let pixel: f32 = mix(abs(center.z), 1.0, uniforms.projection[3][3]) * 2.0 / (abs(uniforms.projection[1][1]) * max(uniforms.lineShape.z, 1.0));
  let spread: f32 = max(uniforms.glowShape.x, max(uniforms.lineShape.x, uniforms.lineShape.y * pixel) * 0.5 + pixel);
  vertexOutputs.position = uniforms.projection * vec4f(center.xyz + (side * vertexInputs.uv2.y + axis * vertexInputs.uv2.x) * spread, 1.0);
  vertexOutputs.vAlong = vertexInputs.uv.x;
  vertexOutputs.vRibbon = vec3f(mix(-spread, vertexInputs.uv.y + spread, vertexInputs.uv2.x * 0.5 + 0.5), vertexInputs.uv2.y * spread, vertexInputs.uv.y);
}`;

export const NEON_FRAGMENT_WGSL = `varying vAlong: f32;
varying vRibbon: vec3f;
uniform lineColor: vec3f;
uniform glowColor: vec3f;
uniform lineShape: vec4f;
uniform glowShape: vec4f;
uniform neonFlow: vec4f;
@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let wave: f32 = 1.0 - uniforms.neonFlow.x * (0.5 + 0.5 * sin(6.28318530718 * uniforms.neonFlow.y * input.vAlong - uniforms.neonFlow.z));
  let beyond: f32 = max(max(-input.vRibbon.x, input.vRibbon.x - input.vRibbon.z), 0.0);
  let distanceToLine: f32 = length(vec2f(input.vRibbon.y, beyond));
  let near: f32 = 1.0 - min(distanceToLine / max(uniforms.glowShape.x, 0.000001), 1.0);
  let wide: f32 = pow(near, uniforms.glowShape.z) * wave;
  let tight: f32 = pow(near, uniforms.glowShape.z * 6.0) * wave;
  let light: vec3f = (uniforms.glowColor * wide + uniforms.lineColor * tight * 0.6) * uniforms.glowShape.y;
  let glow: vec4f = vec4f(min(light, vec3f(1.0)), wide * uniforms.glowShape.w);
  let pixel: f32 = max(fwidth(input.vRibbon.y), 0.0000001);
  let halfLine: f32 = max(uniforms.lineShape.x, uniforms.lineShape.y * pixel) * 0.5;
  let line: f32 = 1.0 - smoothstep(halfLine - pixel * 0.5, halfLine + pixel * 0.5, distanceToLine);
  fragmentOutputs.color = mix(glow, vec4f(uniforms.lineColor, 1.0), line);
}`;
