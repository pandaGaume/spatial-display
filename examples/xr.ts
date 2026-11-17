import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { WebXRDefaultExperience } from "@babylonjs/core/XR/webXRDefaultExperience.js";

/**
 * What the examples share to be seen in a headset: with ?xr in the address,
 * a button on the page enters the scene in the headset, where it is on offer.
 *
 * The viewer then has two eyes, each drawn with a camera of its own: a window
 * and a lens draw an image for each. They walk on `floor` by pointing at it.
 *
 * A headset asks for a page it can trust: https, or localhost. Serve the
 * example with `--mode headset` to reach it from the headset (see
 * `vite.base.ts`).
 */
export async function offerHeadset(scene: Scene, floor: AbstractMesh): Promise<WebXRDefaultExperience | null> {
  if (!new URLSearchParams(location.search).has("xr")) return null;
  try {
    return await WebXRDefaultExperience.CreateAsync(scene, {
      floorMeshes: [floor],
      // The models of the controllers and of the hands are glTF files: the examples do not carry their loader.
      inputOptions: { doNotLoadControllerMeshes: true },
      disableHandTracking: true,
      disableNearInteraction: true,
    });
  } catch (error) {
    console.warn("spatial-display: this page cannot enter a headset.", error);
    return null;
  }
}
