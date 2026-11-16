import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { Observable } from "@babylonjs/core/Misc/observable.js";
import type { IDisplay } from "@spacexr/spatial-display-core";

/**
 * What changed in a display.
 * - "resolution": the size of the image.
 * - "texture": `texture` is another object; what samples it has to take the new one.
 * - "alpha": the image got see-through parts, or lost them (`texture.hasAlpha`).
 * - "disposed": the display is gone, and its texture with it.
 */
export type DisplayChangeKind = "resolution" | "texture" | "alpha" | "disposed";

export interface IDisplayChange {
  kind: DisplayChangeKind;
}

/**
 * The opening a display is looked at through, in window mode: a rectangle
 * centred on the origin of `root`, in its xy plane. Facing its front, the x
 * axis of `root` reads to the right and its y axis upward. A portal is one.
 */
export interface IDisplayWindow {
  readonly root: TransformNode;
  /** Size of the opening, in the units of `root`. */
  readonly width: number;
  readonly height: number;
}

/**
 * Layer of what only the camera of a window draws: the light a portal sets on
 * the far side of its opening. The other cameras of that scene, with the
 * layer mask Babylon.js gives them, do not see it.
 */
export const WINDOW_LAYER_MASK = 0x10000000;

/**
 * A display whose image is a Babylon.js texture: any material, of any scene of
 * the same engine, shows the display by sampling it.
 *
 * Optional members, those of `IDisplay` included, are the extension points;
 * a display that does not need them leaves them out.
 */
export interface ITextureDisplay extends IDisplay {
  readonly texture: BaseTexture;
  readonly onChangedObservable: Observable<IDisplayChange>;
  /**
   * True when the colors of the texture are already multiplied by its alpha,
   * as those of a render target. Default false: the colors of a picture or of
   * a video are not. A surface needs it to let transparent pixels through.
   */
  readonly premultipliedAlpha?: boolean;
  /**
   * Makes the display a window: its image becomes what the viewer of `window`
   * sees through it, as if the opening gave onto the scene of the display.
   * `anchor` is where the opening stands in that scene: a node whose frame is
   * the one of the opening, the scene lying behind it. Without an anchor the
   * opening stands at the origin of the scene, unturned. null for `window`
   * turns the display back into a screen.
   */
  setWindow?(window: IDisplayWindow | null, anchor?: TransformNode | null): void;
  /**
   * Tells the display that `mesh` shows it. A display uses that to stop
   * drawing while none of its surfaces is on screen, and to keep a surface out
   * of its own image.
   */
  addSurface?(mesh: AbstractMesh): void;
  removeSurface?(mesh: AbstractMesh): void;
}
