/**
 * Looking through a window: the image an eye sees through a rectangular
 * opening, whatever the place of that eye.
 *
 * The camera stands where the eye is and looks squarely at the plane of the
 * opening, without turning toward its centre: its frustum is skewed instead,
 * so that its four sides pass through the four edges of the opening. The image
 * drawn is then exactly what shows in the opening, and maps onto it with plain
 * texture coordinates. Since the camera faces the plane, its near plane can be
 * the plane of the opening itself: what stands on the side of the eye is cut.
 */

/**
 * Where an eye stands in the frame of a window: x to the right and y upward
 * when facing the window, from its centre, and `distance` in front of its plane.
 */
export interface IWindowEye {
  x: number;
  y: number;
  distance: number;
}

/** Sides of a frustum on its near plane, from the axis of the camera. */
export interface IWindowFrustum {
  left: number;
  right: number;
  bottom: number;
  top: number;
}

/** Frustum of an eye that looks through an opening of `width` by `height`, measured on a near plane at `near`. */
export function windowFrustum(eye: Readonly<IWindowEye>, width: number, height: number, near: number): IWindowFrustum {
  const scale = near / eye.distance;
  return {
    left: (-width / 2 - eye.x) * scale,
    right: (width / 2 - eye.x) * scale,
    bottom: (-height / 2 - eye.y) * scale,
    top: (height / 2 - eye.y) * scale,
  };
}

export interface IWindowProjectionOptions {
  near: number;
  far: number;
  /** True for a camera that looks down its -z axis. Default false: it looks down +z. */
  rightHanded?: boolean;
  /** True when depth goes from 0 to 1 after projection, as in WebGPU; false when it goes from -1 to 1, as in WebGL. */
  halfZRange?: boolean;
}

/**
 * Perspective projection of a frustum that is not centred on the axis of the
 * camera. The 16 numbers are laid out as the matrices of WebGL, of three.js
 * and of Babylon.js (`Matrix.m`) are: column-major for column vectors.
 */
export function windowProjection(frustum: Readonly<IWindowFrustum>, options: Readonly<IWindowProjectionOptions>, out: number[] = new Array<number>(16)): number[] {
  const { left, right, bottom, top } = frustum;
  const { near, far } = options;
  // The camera looks down +z or -z: after projection, w is the depth along that axis.
  const forward = options.rightHanded ? -1 : 1;
  let depthScale = (forward * (far + near)) / (far - near);
  let depthOffset = (-2 * far * near) / (far - near);
  if (options.halfZRange) {
    depthScale = 0.5 * depthScale + 0.5 * forward;
    depthOffset *= 0.5;
  }
  out.fill(0);
  out[0] = (2 * near) / (right - left);
  out[5] = (2 * near) / (top - bottom);
  // The skew: where the axis of the camera stands between the sides of the frustum.
  out[8] = (-forward * (right + left)) / (right - left);
  out[9] = (-forward * (top + bottom)) / (top - bottom);
  out[10] = depthScale;
  out[11] = forward;
  out[14] = depthOffset;
  return out;
}
