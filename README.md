# spatial-display

Displays for 3D scenes. A display shows the view of a camera, of any scene, as a texture: any mesh surface can show it, in the scene of that camera or in another one. A `Portal` is the ready-made surface: a rectangular opening in a frame of neon, resizable at run time, with an image that can be made see-through.

| Package | Contents |
|---|---|
| `@spacexr/spatial-display-core` | display interfaces, geometry of the frame, image fitting, refresh scheduling. No dependencies, no rendering library. |
| `@spacexr/spatial-display-babylon` | Babylon.js: `CameraDisplay`, `attachDisplay`, `Portal`, and the materials of the screen and of the neon. Peer dependency on `@babylonjs/core` 9. |

## Getting started

Requires Node 20 or later. The repository is an npm workspace.

```bash
npm install
```

```bash
npm test
```

```bash
npm run example:portal
```

The example opens on http://localhost:5183. Add `?webgpu` for the WebGPU engine and `?rh` for right-handed scenes.

## Use

```ts
import { CameraDisplay, Portal, attachDisplay } from "@spacexr/spatial-display-babylon";

// The view of a camera. `world` is a scene the application never renders:
// the display renders it itself, and nothing of it reaches the canvas.
const display = new CameraDisplay({ camera: world.activeCamera!, drive: "display", resolution: { width: 1280, height: 720 } });

// 1. In a portal.
const portal = new Portal("gate", scene, { width: 1.6, height: 0.9, display, opacity: 0.85 });
portal.root.position.set(0, 1.5, 2);
portal.resize(2, 1.2);
portal.opacity = 0.5;

// 2. On any mesh that has texture coordinates.
attachDisplay(wall, display, { fit: "cover" });

// 3. As a plain texture, on a material of the application.
tvMaterial.emissiveTexture = display.texture;
```

## How a display is drawn

A `CameraDisplay` owns a render target in the scene of its camera, the source scene. That scene and the scene of the surface must belong to the same engine, since a texture cannot be shared between two rendering contexts; nothing else ties them.

`drive` tells who renders the source scene:

- `"app"` (default): the application does. This is the case of a display shown in the very scene it films, and of a scene that is drawn on the canvas as well. A source scene rendered after the scene of the surface shows one frame late.
- `"display"`: the display does, once per frame of the engine, before the render loop of the application. The scene runs as in any render (animations, physics, shadow maps, observables) and nothing reaches the canvas. Several displays of one such scene share a single render.

A surface of a display is kept out of the image of that display: a texture cannot be sampled while it is drawn into. A portal therefore does not show in itself, but two portals facing each other do show one another.

`refresh` is `"frame"` (default), `{ hz }` or `"manual"` with `display.invalidate()`. A display also stops drawing while none of its surfaces is on screen (`pauseWhenHidden`, on by default): a driven scene is then not rendered at all. A surface seen through another display counts as on screen. When a surface comes back into view, it shows its last image for one frame.

The image is the one of a screen: it does not depend on who looks at it, so one draw serves every viewer, both eyes of a headset included.

## Surfaces

`attachDisplay(mesh, display, options)` gives the mesh an unlit material, and gives it back its former one when the surface is disposed. The image fills the rectangle of the texture space that the mesh uses. `fit` is `"stretch"`, `"contain"` (bands of the `border` color) or `"cover"`, and belongs to the surface: two surfaces can frame the same display differently. `opacity` goes from 0 to 1.

## Portal

`width` and `height` are those of the opening; the frame goes around it. The frame is a tube of square section with mitred corners, 64 vertices whatever its size. `resize()` and `frameSection` rewrite vertex positions and rebuild nothing, so a portal can change size at every frame.

`portal.root` is the node the application places and parents. Facing the front of a portal, the local x axis reads to the right and y upward: the front looks toward -z in a left-handed scene, as the planes of Babylon.js, and toward +z in a right-handed one.

`portal.neon` is the material of the frame: `color` (an electric blue by default), `intensity`, `softness`, `core`, and `flow` for the waves of light that travel along the tube (`flow.amplitude = 0` for a steady light). By default it adds its light to what stands behind it.

A portal is an `IPhysicalDisplay`: `dimension` in world units, `resolution` in pixels, `pixelPerUnit` and `dpi`. With `pixelsPerUnit`, the display is resized along with the portal to keep that density; each change then allocates a new render target, so leave it out for a portal whose size is animated and choose a `fit` instead.

## WebGL and WebGPU

The two materials are written in GLSL and in WGSL, and pick their language from the engine: WebGPU does not have to translate GLSL. The two versions of each shader live side by side in `packages/babylon/src/materials/shaders.ts`.

## Scripts

| Command | |
|---|---|
| `npm run build` | compile the packages (`tsc -b`) |
| `npm run typecheck` | packages plus tests and examples |
| `npm test` | Vitest, with the null engine of Babylon.js |
| `npm run example:portal` | the example, served by Vite from the sources |

## State and limits

The example has been checked by eye in a browser, on WebGL2 and on WebGPU, in left- and right-handed scenes (right-handed on WebGL2 only). Nothing has run in a headset.

- The image is that of a screen. A window mode, where the camera of the source follows the eye of the viewer through the frame, is planned for 0.1.1.
- No pointer input goes through a surface to the scene behind it yet.
- A portal does not show in itself.
- The materials of the screen and of the neon ignore fog, clip planes and instances. For those, give `display.texture` to a material of the application.
- A source scene that uses `activeCameras` cannot be driven by a display.
- Layers of the source scene that are not drawn in render targets (glow, highlight) do not show in a display. The post-processes of the camera do, with `postProcesses: true`.

## License

Apache-2.0. See [LICENSE](LICENSE).
