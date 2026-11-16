# spatial-display

Displays for 3D scenes. A display shows an image, such as the view of a camera of any scene, as a texture: any mesh surface can show it, in the scene of that camera or in another one. A `Portal` is the ready-made surface: a rectangular opening in a frame of light, resizable at run time, with an image that can be made see-through.

| Package | Contents |
|---|---|
| `@spacexr/spatial-display-core` | display interfaces, the `Display` and `PhysicalDisplay` base classes, geometry of the frame and of its halo, image fitting, refresh scheduling. No dependencies, no rendering library. |
| `@spacexr/spatial-display-babylon` | Babylon.js: `CameraDisplay`, `TextureDisplay`, `attachDisplay`, `Portal`, and the materials of the screen and of the neon. Peer dependency on `@babylonjs/core` 9. |

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

```bash
npm run example:xray
```

```bash
npm run example:xray360
```

The portal example opens on http://localhost:5183; add `?window` for the window mode. The x-ray example opens on http://localhost:5184, the x-ray 360 example on http://localhost:5185. All take `?webgpu` for the WebGPU engine and `?rh` for right-handed scenes.

## Use

```ts
import { CameraDisplay, Portal, attachDisplay } from "@spacexr/spatial-display-babylon";

// The view of a camera. `world` is a scene the application never renders:
// the display renders it itself, and nothing of it reaches the canvas.
const display = new CameraDisplay({ camera: world.activeCamera!, drive: "display", resolution: { width: 1280, height: 720 } });

// 1. In a portal.
const portal = new Portal("gate", scene, { width: 1.6, height: 0.9, display, opacity: 0.85 });
portal.root.position.set(0, 1.5, 2);
portal.setDimension(2, 1.2);
portal.opacity = 0.5;

// 2. On any mesh that has texture coordinates.
attachDisplay(scene.getMeshByName("screen")!, display, { fit: "cover" });

// 3. As a plain texture, on a material of the application.
tvMaterial.emissiveTexture = display.texture;
```

## The classes

```
core      Display             an image of a given size in pixels: resolution, resize()
core        PhysicalDisplay   and a rectangle of the world: dimension, setDimension(), pixelPerUnit, dpi
babylon       Portal          and the meshes that draw it: frame, screen, the display it shows
babylon     CameraDisplay     the view of a camera, as a render target: a screen, a window, or a lens
babylon   TextureDisplay      a texture the application already has: a picture, a video
```

Two sizes change apart. `resize(width, height)` is for the image, in pixels. `setDimension(width, height)` is for the rectangle, in world units. Interfaces are named `IDisplay`, `IPhysicalDisplay`, `ITextureDisplay`, and so on for the options of each class.

## How a camera display is drawn

A `CameraDisplay` owns a render target in the scene of its camera, the source scene. That scene and the scene of the surface must belong to the same engine, since a texture cannot be shared between two rendering contexts; nothing else ties them.

`drive` tells who renders the source scene:

- `"app"` (default): the application does. This is the case of a display shown in the very scene it films, and of a scene that is drawn on the canvas as well. A source scene rendered after the scene of the surface shows one frame late.
- `"display"`: the display does, once per frame of the engine, before the render loop of the application. The scene runs as in any render (animations, physics, shadow maps, observables) and nothing reaches the canvas. Several displays of one such scene share a single render.

A surface of a display is kept out of the image of that display: a texture cannot be sampled while it is drawn into. A portal therefore does not show in itself, but two portals facing each other do show one another.

`refresh` is `"frame"` (default), `{ hz }` or `"manual"` with `display.invalidate()`. A display also stops drawing while none of its surfaces is on screen (`pauseWhenHidden`, on by default): a driven scene is then not rendered at all. A surface seen through another display counts as on screen. When a surface comes back into view, it shows its last image for one frame.

The image is the one of a screen: it does not depend on who looks at it, so one draw serves every viewer, both eyes of a headset included.

## Surfaces

`attachDisplay(mesh, display, options)` takes any mesh of Babylon.js that has texture coordinates and a material of its own (not an instance). It gives the mesh an unlit material, and gives it back its former one when the surface is disposed. The image fills the rectangle of the texture space that the mesh uses. `fit` is `"stretch"`, `"contain"` (bands of the `border` color) or `"cover"`, and belongs to the surface: two surfaces can frame the same display differently. A display that is a lens is read otherwise, by the place of the surface on screen: see the lens mode below.

The image shows on the front faces of the mesh. With `doubleSided`, an option of the surface and a property that can change at any time (`surface.doubleSided`, `portal.doubleSided`), it shows on the back faces too: on the back of a flat mesh, where it reads mirrored, and on the inside of a hollow one. The faces turned away from the eye are then drawn first, so through a see-through image the far wall of a cylinder shows behind the near one.

## Transparency

What stands behind a surface shows through it by `1 - opacity * alpha of the pixel`:

- `opacity`, from 0 to 1, applies to the whole image.
- The alpha of a pixel is 1 unless the surface lets the transparent pixels of the image through (`useImageAlpha`). By default a surface follows what the texture says of itself, `texture.hasAlpha`: set it on a picture that has transparent parts, as for any material of Babylon.js. A camera display sets it when it is given a `clearColor` whose alpha is under 1.
- `chromaKey: { color }` lets a color of the image through, as the green of a green screen. For a key with a hue, the share of key color in each pixel is measured, so soft edges and white or gray translucent parts come out as they were shot, with no fringe. Colors akin to the key thin out; narrow `smoothness` to keep them. A translucent part that has a color of its own comes out tinted: a key cannot tell its color from the one behind it.

```ts
// A picture with transparent parts.
const picture = new Texture("logo.png", scene);
picture.hasAlpha = true;
portal.display = new TextureDisplay(picture);

// The world behind the portal, with nothing where it is empty.
const display = new CameraDisplay({ camera, clearColor: { r: 0, g: 0, b: 0, a: 0 } });
```

The colors of a render target are multiplied by their alpha, those of a picture are not; a display says which with `premultipliedAlpha`, and the material blends in premultiplied alpha either way. Light that additive materials drew into a see-through render target, which carries no alpha, is added to what stands behind the surface.

## Portal

`width` and `height` are those of the opening; the frame goes around it. `setDimension()`, `frameSection` and `glowSize` rewrite vertex positions and rebuild nothing, so a portal can change size at every frame.

The frame is a line of light and the glow around it:

- The line (`portal.frame`) is an opaque tube of square section with mitred corners. `frameSection` is its width, `lineColor` its color (white by default). However thin or far, it never shows under `neon.minLineWidth` pixels (1.5 by default): with a section of 0 the line is a hairline.
- The glow (`portal.glow`) spreads on both sides of the line: `glowColor` (an electric blue by default), `glowSize` in world units, `glowIntensity`. With a size of 0 the line stands bare. The glow is made of ribbons that turn to face the eye and whose ends are rounded on the corners, so it keeps its width from every angle and needs no post-process.
- The image of the opening is always drawn over the glow, from every angle: the glow shows around the opening, and through an image that is see-through, never on top of it.

Those four are properties of the portal; `portal.neon`, the material of the frame, holds them too, with `glowFalloff`, `cover` and `flow` for waves of light that travel along the frame. The glow fades from the line outward whatever its intensity. With a `cover` of 1 (default) it tints what stands behind it, so it reads on any color; with 0 it only adds to the background, and is lost on a bright one.

`portal.root` is the node the application places and parents. Facing the front of a portal, the local x axis reads to the right and y upward: the front looks toward -z in a left-handed scene, as the planes of Babylon.js, and toward +z in a right-handed one.

The resolution of a portal is the one of its display: showing a display takes its resolution, and `portal.resize()` resizes that display. With `pixelsPerUnit`, the display is resized along with the opening to keep that density; each change then allocates a new render target, so leave it out for a portal whose size is animated and choose a `fit` instead.

## Window mode

A portal is a screen by default: its image is glued to the opening, whoever looks at it. With `window`, the opening gives onto the scene of its display instead, and the image follows the eye of the viewer:

```ts
// Where the opening stands in the world: a node of that scene. The world lies behind it.
const anchor = new TransformNode("anchor", world);
anchor.position.set(0, 1.5, -6);

const display = new CameraDisplay({ camera: world.activeCamera!, drive: "display" });
const portal = new Portal("gate", scene, { width: 2, height: 1.2, display, window: { anchor } });
```

- The two scenes stay apart. The portal and its viewer are in one; the display draws the other with a camera of its own, which it places where the viewer stands as seen from the opening. The frustum of that camera is skewed so that its sides pass through the edges of the opening: what it draws is exactly what shows in the opening, from any place. Its near plane is the plane of the opening, so nothing of the world shows in front of it.
- The camera given to the display only lends its scene, its far plane and its layer mask. It is not moved.
- The anchor is the frame of the opening in the world: x to the right and y upward when looking into the world, which lies toward +z in a left-handed scene and toward -z in a right-handed one. Its scale sizes the world against the opening. Without an anchor the opening stands at the origin of the world.
- The image is drawn after Babylon.js has updated the camera of the viewer, in the same frame: it does not lag behind the viewer.
- The image always fills the opening: `fit` does not apply.

The glow of the frame carries on behind the opening. Four walls of light run from the edges of the opening straight into the world, as the inside of a box, and fade with depth: `window.glow` sets their `depth`, `intensity`, `falloff` and `color`, and `portal.worldGlowDepth` and `portal.worldGlowIntensity` change them later; `glow: false` leaves them out. Being in the world, they are drawn with it: the wall away from the viewer shows more than the one on their side, and what stands in front of a wall hides it. Only the camera of the window draws them (`WINDOW_LAYER_MASK`); the other cameras of the world do not see them.

`display.setWindow(window, anchor)` does the same for a display shown on a surface of the application, `window` being any object with a `root` node and the `width` and `height` of an opening centred on it.

## One scene: layers and an x-ray

A mesh of Babylon.js belongs to one scene, and so does a camera. To show in a window an object that is costly to draw, without a copy of it in a second scene, keep one scene and tell its cameras apart by layers: a mesh is drawn by a camera when their `layerMask` share a bit.

A display can show the scene its portal stands in. As a window, the portal then needs no anchor: its opening gives onto what stands behind it, seen from the eye of the viewer, and drawn as its display draws it.

```ts
const HIDDEN = 0x20000000;               // a layer the camera of the application does not draw
pipes.layerMask = HIDDEN;

// Never the camera of the scene: it lends the display its layers and its far plane.
const scanner = new FreeCamera("scanner", Vector3.Zero(), scene, false);
scanner.layerMask = 0x0fffffff | HIDDEN;

const wire = new StandardMaterial("wire", scene);
wire.wireframe = true;

const display = new CameraDisplay({ camera: scanner, overrideMaterial: wire, clearColor: { r: 0, g: 0, b: 0, a: 0.8 } });
const portal = new Portal("xray", scene, { width: 1.6, height: 1, display, window: true });
```

- `overrideMaterial` draws the meshes with another material in the image of the display, and with their own everywhere else: one material for all, or a function that picks one for each mesh. Nothing is copied: a mesh is drawn solid by the camera of the application and as a wireframe by the screen, from the same vertices.
- The camera of the window draws the layers of the camera the display was given, so the screen can see what the application does not show, or less than it shows.
- A portal does not show in the image of its own display: neither its screen nor its frame.
- What the scene sets for all its cameras is shared by the two views: fog, environment, image processing. A light can be kept to some layers (`includeOnlyWithLayerMask`).
- An object seen both around the screen and in it is drawn twice, once for each view.

## Lens mode: an x-ray all around

A window is flat: its camera starts drawing at the plane of its opening. A lens has no such plane, so its surface can have any shape. The display draws what the viewer sees, the way the display draws it, and a surface shows the part of that image it covers on screen:

```ts
const display = new CameraDisplay({
  camera: scanner,
  overrideMaterial: wire,
  clearColor: { r: 0, g: 0, b: 0, a: 0.85 },
  include: (mesh) => machine.has(mesh),
});
display.setLens({ scene }); // follow the camera of this scene

// An open cylinder around the machine: its wall shows the machine as a wireframe, from every side.
attachDisplay(ring, display);
```

- The display draws with a camera of its own, a copy of the one of the viewer: same place, same direction, same projection. The copy is made after Babylon.js has updated the camera of the viewer, in the same frame. The camera given to the display lends its scene and its layer mask, as for a window, and is not moved.
- The image takes the size of the canvas, so a surface is as sharp as the rest of the screen; `scale` in the lens asks for less, or for more. `resize()` does not hold.
- A surface reads the image where each of its points lands on screen, not by its texture coordinates: `fit` does not apply. Several surfaces can share a lens, and a portal shows one as any surface does.
- With `doubleSided`, the inside of the surface shows the image too: the far wall of the cylinder, seen over the near one, and the whole wall for a viewer who stands inside. Both faces read the same image, so where they overlap the glass is twice as dark.
- Nothing is cut in front of a surface, nor behind it: the image holds whatever the copy draws along the line of sight. Choose it with the layers of the camera given and with `include`.
- A lens can show another scene: `display.setLens({ scene, root }, anchor)` places the copy in the scene of the display, at the place the viewer has against `root`, taken from `anchor`. The two scenes must have the same handedness.

## WebGL and WebGPU

The two materials are written in GLSL and in WGSL, and pick their language from the engine: WebGPU does not have to translate GLSL. The two versions of each shader live side by side in `packages/babylon/src/materials/shaders.ts`.

## Scripts

| Command | |
|---|---|
| `npm run build` | compile the packages (`tsc -b`) |
| `npm run typecheck` | packages plus tests and examples |
| `npm test` | Vitest, with the null engine of Babylon.js |
| `npm run example:portal` | the portal example, served by Vite from the sources |
| `npm run example:xray` | the x-ray example: a window onto its own scene |
| `npm run example:xray360` | the x-ray 360 example: a lens on a cylinder |

## State and limits

The example has been checked in a browser on WebGL2 and on WebGPU, in left- and right-handed scenes. On WebGL2, in both handednesses, the pixels of the canvas were compared with what the transparency rule above predicts, for a picture with alpha and for a camera display with a see-through background: they agree within 1/255 away from edges. In window mode, also on WebGL2 and in both handednesses, objects of the world were found on the canvas where their place behind the opening predicts, from three places of the viewer. On WebGPU the checks were by eye. The lens of the x-ray 360 example was checked by eye on WebGL2 and on WebGPU, in both handednesses; the tests compare the camera of a lens with the one of its viewer. Nothing has run in a headset.

The example serves Babylon.js unbundled (`optimizeDeps.exclude` in its Vite configuration). Bundled ahead by Vite 7, the shaders that Babylon.js materials import on demand came with a second copy of its shader store, and those materials failed to compile.

- A window draws one image, for the camera of the scene its opening stands in. In a headset both eyes get that same image: the world behind the opening shifts as the head moves, but has no depth of its own. A portal seen through another display, or by a second camera, shows the image drawn for the first.
- A window keeps its last image when the viewer goes behind its opening.
- A lens draws one image too, for the camera of the scene it follows, with the same limits in a headset and for a second camera. It cuts nothing in front of its surfaces.
- A mesh needs texture coordinates to be a surface, even for a lens, which does not use them.
- The scale of the anchor of a window is taken as the same along its three axes.
- No pointer input goes through a surface to the scene behind it yet.
- A portal does not show in itself.
- The materials of the screen and of the neon ignore fog, clip planes and instances. For those, give `display.texture` to a material of the application.
- A source scene that uses `activeCameras` cannot be driven by a display.
- Layers of the source scene that are not drawn in render targets (glow, highlight) do not show in a display. The post-processes of the camera do, with `postProcesses: true`.
- Babylon.js adds up the alpha of blended materials in a render target. Where several translucent objects overlap over a see-through background, the image is more opaque than it should be.

## License

Apache-2.0. See [LICENSE](LICENSE).
