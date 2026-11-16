import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { Observable } from "@babylonjs/core/Misc/observable.js";
import type { IDisplay } from "@spacexr/spatial-display-core";

/**
 * What changed in a display.
 * - "resolution": the size of the image.
 * - "texture": `texture` is another object; what samples it has to take the new one.
 * - "disposed": the display is gone, and its texture with it.
 */
export type DisplayChangeKind = "resolution" | "texture" | "disposed";

export interface IDisplayChange {
  kind: DisplayChangeKind;
}

/**
 * A display whose image is a Babylon.js texture: any material, of any scene of
 * the same engine, shows the display by sampling it.
 *
 * Optional members are the extension points; a display that does not need
 * them leaves them out.
 */
export interface ITextureDisplay extends IDisplay {
  readonly texture: BaseTexture;
  readonly onChangedObservable: Observable<IDisplayChange>;
  /** Changes the size of the image, in pixels. */
  resize?(width: number, height: number): void;
  /**
   * Tells the display that `mesh` shows it. A display uses that to stop
   * drawing while none of its surfaces is on screen, and to keep a surface out
   * of its own image.
   */
  addSurface?(mesh: Mesh): void;
  removeSurface?(mesh: Mesh): void;
}
