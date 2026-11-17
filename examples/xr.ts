/// <reference types="vite/client" />
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { WebXRDefaultExperience } from "@babylonjs/core/XR/webXRDefaultExperience.js";
import { WebXRSessionManager } from "@babylonjs/core/XR/webXRSessionManager.js";
import { WebXRState } from "@babylonjs/core/XR/webXRTypes.js";

/** True when the example is served to a headset, with `--mode headset` (see `vite.base.ts`). */
const SERVED_TO_HEADSET = import.meta.env.MODE === "headset";
/** How long the images of a headset are counted before their cadence is told, in milliseconds. */
const MEASURE_MS = 2000;
/** Images a second under which a headset makes its wearer sick: a Quest draws 72, and 36 when it cannot keep up. */
const TOO_SLOW = 45;
/** How many measures in a row may be too slow before the page leaves the headset by itself. */
const SLOW_MEASURES = 2;
/** The second button of a controller, B or Y, in the layout every headset gives its controllers. */
const LEAVE_BUTTON = 5;

/** What a stretch of time says of the cadence of the images. */
export interface ICadence {
  /** Images a second. */
  fps: number;
  /** The longest time between two images, in milliseconds. */
  worstMs: number;
}

/** Counts the images of a headset, a stretch of time after the other. */
export class CadenceMeter {
  private frames = 0;
  private since = -1;
  private last = -1;
  private worst = 0;

  constructor(private readonly stretchMs = MEASURE_MS) {}

  /** Starts a stretch over: after a pause, the time spent in it is not an image that was slow. */
  restart(): void {
    this.since = -1;
  }

  /** One more image, at `now` in milliseconds. Returns the cadence of the stretch that ends with it, else null. */
  tick(now: number): ICadence | null {
    if (this.since < 0) {
      this.since = now;
      this.last = now;
      this.frames = 0;
      this.worst = 0;
      return null;
    }
    this.frames++;
    this.worst = Math.max(this.worst, now - this.last);
    this.last = now;
    const elapsed = now - this.since;
    if (elapsed < this.stretchMs) return null;
    const cadence = { fps: Math.round((this.frames * 10000) / elapsed) / 10, worstMs: Math.round(this.worst) };
    this.since = now;
    this.frames = 0;
    this.worst = 0;
    return cadence;
  }
}

/**
 * Tells the terminal of the developer something of the headset, which has no
 * console to look at. Only a page served with `--mode headset` does: its
 * server writes what it is told (see `vite.base.ts`).
 */
function report(what: string, data: Record<string, unknown> = {}): void {
  if (!SERVED_TO_HEADSET) return;
  const body = JSON.stringify({ what, ...data });
  // A beacon leaves even while the page is busy, or goes away.
  try {
    if (!navigator.sendBeacon("/__headset", body)) void fetch("/__headset", { method: "POST", body, keepalive: true }).catch(() => undefined);
  } catch {
    // Nothing to tell it to.
  }
}

let listening = false;

/** What goes wrong in the page is told too: errors, and what Babylon.js warns about. */
function reportTroubles(): void {
  if (listening || !SERVED_TO_HEADSET) return;
  listening = true;
  window.addEventListener("error", (event) => report("error", { message: event.message, at: `${event.filename}:${event.lineno}` }));
  window.addEventListener("unhandledrejection", (event) => report("error", { message: String(event.reason) }));
  for (const level of ["warn", "error"] as const) {
    const write = console[level].bind(console);
    console[level] = (...values: unknown[]) => {
      write(...values);
      report(level, { text: values.map(String).join(" ").slice(0, 400) });
    };
  }
}

/** The images the displays of the engine draw: their size, and their samples when they have several. */
function targetsOf(scene: Scene): string[] {
  return scene
    .getEngine()
    .scenes.flatMap((each) => each.customRenderTargets)
    .map((target) => {
      const { width, height } = target.getSize();
      return `${target.name} ${width}x${height}${target.samples > 1 ? ` x${target.samples}` : ""}`;
    });
}

/**
 * What the examples share to be seen in a headset: with ?xr in the address,
 * a button on the page enters the scene in the headset, where it is on offer.
 *
 * The viewer then has two eyes, each drawn with a camera of its own: a window
 * and a lens draw an image for each. They walk on `floor` by pointing at it,
 * and leave with the second button of a controller, B or Y.
 *
 * Images that come too slowly make the wearer of a headset sick. The page
 * counts them, and leaves the headset by itself when they stay under
 * `TOO_SLOW` a second; ?xr=stay keeps it in, to look at what is slow.
 *
 * A headset asks for a page it can trust: https, or localhost. Serve the
 * example with `--mode headset` to reach it from the headset (see
 * `vite.base.ts`): the page then tells the terminal its cadence, the size of
 * its images and what goes wrong.
 */
export async function offerHeadset(scene: Scene, floor: AbstractMesh): Promise<WebXRDefaultExperience | null> {
  const asked = new URLSearchParams(location.search).get("xr");
  if (asked === null) return null;
  reportTroubles();
  let xr: WebXRDefaultExperience;
  try {
    xr = await WebXRDefaultExperience.CreateAsync(scene, {
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
  // Where the browser knows no headset at all, Babylon.js hands back an experience with nothing in it.
  const experience = xr.baseExperience as WebXRDefaultExperience["baseExperience"] | undefined;
  const engine = scene.getEngine();
  const onOffer = experience ? await WebXRSessionManager.IsSessionSupportedAsync("immersive-vr").catch(() => false) : false;
  report("page", { engine: engine.name, onOffer, browser: navigator.userAgent.slice(0, 160) });
  if (!experience) return xr;

  const meter = new CadenceMeter();
  let slow = 0;
  let measures = 0;
  let leaving = false;
  const leave = (why: string): void => {
    if (leaving || experience.state !== WebXRState.IN_XR) return;
    leaving = true;
    report("leaving", { why });
    void experience.exitXRAsync().finally(() => (leaving = false));
  };

  experience.onStateChangedObservable.add((state) => {
    report("state", { state: WebXRState[state] });
    meter.restart();
    slow = 0;
    measures = 0;
  });
  experience.sessionManager.onXRSessionInit.add((session) => {
    // "visible-blurred" is the menu of the headset over the scene, "hidden" the headset taken off.
    session.addEventListener("visibilitychange", () => {
      report("visibility", { visibility: session.visibilityState });
      meter.restart();
      slow = 0;
    });
  });

  scene.onAfterRenderObservable.add(() => {
    if (experience.state !== WebXRState.IN_XR) return;
    for (const controller of xr.input.controllers) {
      if (controller.inputSource.gamepad?.buttons[LEAVE_BUTTON]?.pressed) leave("button");
    }
    const cadence = meter.tick(performance.now());
    if (!cadence) return;
    measures++;
    // The first measure holds the shaders the headset compiles as it enters: it tells nothing of what follows.
    slow = measures > 1 && cadence.fps < TOO_SLOW ? slow + 1 : 0;
    report("cadence", {
      ...cadence,
      asked: experience.sessionManager.currentFrameRate ?? null,
      frame: `${engine.getRenderWidth()}x${engine.getRenderHeight()}`,
      eyes: scene.activeCamera?.rigCameras.length ?? 0,
      targets: targetsOf(scene),
    });
    if (slow >= SLOW_MEASURES && asked !== "stay") leave(`under ${TOO_SLOW} images a second`);
  });
  return xr;
}
