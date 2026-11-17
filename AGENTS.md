# AGENTS.md

Guidance for coding agents. Part 1 is for an agent that integrates a portal, or any display, into an application. Part 2 is for an agent that changes this repository.

`spatial-display` shows an image on a mesh of a Babylon.js scene: the view of a camera of any scene, a picture, a video. A `Portal` is the ready-made surface: a flat rectangle, the wall of a cylinder or a mesh of the application, which wears a frame, a line of light and a glow when asked. [README.md](README.md) explains how each part works; this file says what to reach for, and what not to assume.

## Part 1: integrating a portal in an application

### Packages

| Package | Use it for |
|---|---|
| `@spacexr/spatial-display-babylon` | Everything an application needs: `CameraDisplay`, `TextureDisplay`, `PortalBuilder`, `Portal`, the surface builders, `attachDisplay`. Peer dependency on `@babylonjs/core` 9. |
| `@spacexr/spatial-display-core` | Types and math with no rendering library. An application imports from it only for types (`DisplayFit`, `DisplayRefresh`, `ISize2`, `IOutline`) or to build its own adapter. |

Both are at version 0.1.0. Check that they are on npm before adding them to a manifest; if they are not, build this repository (`npm run build`) and link its two packages.

There is nothing to call in the render loop. A display hooks itself to the engine and to the scenes it needs.

In the Babylon.js Playground, or in any page that loads Babylon.js as the `BABYLON` global, do not import the packages by their names: a CDN would serve them with a Babylon.js of their own, and two of them do not work together. Build the library for that global (`npm run playground:bundle`) and add `examples/playground/out/spatial-display.js` to the snippet as a second file. Two snippets show it: [an x-ray all around an object](https://playground.babylonjs.com/#F9VTYN#0) and [an x-ray screen](https://playground.babylonjs.com/#816LOC#1).

### Pick by intent

| The application wants | Use |
|---|---|
| A framed screen that shows what a camera sees | `CameraDisplay` + `PortalBuilder` with a `RectSurfaceBuilder`, `withFrame()`, `withLight()`, `withGlow()` |
| That camera to belong to a scene the application never renders | the same, with `drive: "display"` on the display |
| An opening that gives onto another scene, with parallax as the viewer moves | `RectSurfaceBuilder` with `window: { anchor }` |
| An opening onto the same scene, drawn differently (x-ray, wireframe, other layers) | one scene, `overrideMaterial` and `layerMask`, `RectSurfaceBuilder` with `window: true` |
| A screen with no frame, or a frame with no light, or a glow alone | leave out `withFrame()`, `withLight()` or `withGlow()`: none is there by default |
| A bent screen, as a curved monitor | `CylinderSurfaceBuilder` with `arc` under 1, and `facing: "inside"` |
| A ring around an object that shows it from every side | `display.setLens({ scene })` and a `CylinderSurfaceBuilder` |
| The image on a mesh the application already has, with a frame or a light on its edges | `PortalBuilder.withSurface(mesh)` or `MeshSurfaceBuilder` |
| The image on such a mesh, and nothing more | `attachDisplay(mesh, display)` |
| The image on a material of its own | `material.emissiveTexture = display.texture` |
| A picture or a video instead of a camera | `TextureDisplay` |
| To avoid a second copy of a costly mesh | one scene and layer masks, never two scenes |

### Recipes

A portal is built step by step. Only the surface is needed; it carries its display. `withFrame`, `withLight` and `withGlow` add what stands on its edges:

```ts
import { CameraDisplay, PortalBuilder, RectSurfaceBuilder } from "@spacexr/spatial-display-babylon";

// `worldCamera` belongs to a scene of the same engine, which the application does not render.
const display = new CameraDisplay({ camera: worldCamera, drive: "display", resolution: { width: 1280, height: 720 } });
const portal = new PortalBuilder("gate", scene)
  .withSurface(new RectSurfaceBuilder({ width: 1.6, height: 0.9, display }))
  .withFrame(true, 0.012)                       // a tube of square section; its side, in world units
  .withLight(true, { r: 1, g: 1, b: 1 })        // the frame is a line of light, of this color
  .withGlow({ color: { r: 0.1, g: 0.55, b: 1 }, size: 0.18, intensity: 1.4 })
  .build();
portal.root.position.set(0, 1.5, 2);
```

The same in one call, without the builder:

```ts
const portal = new Portal("gate", scene, { surface: new RectSurfaceBuilder({ width: 1.6, height: 0.9, display }), frame: true, light: true, glow: { size: 0.18 } });
```

A window onto another scene. The anchor is where the opening stands in that scene; the scene lies behind it. The mode is an option of the rectangle, the one surface that can be a window:

```ts
const anchor = new TransformNode("anchor", world);
anchor.position.set(0, 1.5, -6);
const display = new CameraDisplay({ camera: worldCamera, drive: "display" });
const portal = new PortalBuilder("gate", scene)
  .withSurface(new RectSurfaceBuilder({ width: 2, height: 1.2, display, window: { anchor } }))
  .withFrame()
  .withLight()
  .withGlow()
  .build();
```

An x-ray screen, in one scene. No mesh is copied; the screen also sees a layer the application does not draw:

```ts
const HIDDEN = 0x20000000;
pipes.layerMask = HIDDEN;

// Never the camera of the scene: it lends the display its layers and its far plane.
const scanner = new FreeCamera("scanner", Vector3.Zero(), scene, false);
scanner.layerMask = 0x0fffffff | HIDDEN;

const wire = new StandardMaterial("wire", scene);
wire.wireframe = true;
wire.disableLighting = true;
wire.emissiveColor = new Color3(0.25, 0.95, 1);

const display = new CameraDisplay({ camera: scanner, overrideMaterial: wire, clearColor: { r: 0, g: 0, b: 0, a: 0.8 }, samples: 4 });
const portal = new PortalBuilder("xray", scene)
  .withSurface(new RectSurfaceBuilder({ width: 1.6, height: 1, display, window: true }))
  .withFrame()
  .withLight()
  .build();
```

An x-ray all around an object, in one scene: a ring whose wall shows what the viewer sees through it, drawn as the display draws it. The frame runs along its two rims:

```ts
const display = new CameraDisplay({ camera: scanner, overrideMaterial: wire, clearColor: { r: 0, g: 0, b: 0, a: 0.85 }, samples: 4, include: (mesh) => machine.has(mesh) });
display.setLens({ scene });                          // follow the camera of this scene; setLens(null) undoes it
const ring = new PortalBuilder("ring", scene)
  .withSurface(new CylinderSurfaceBuilder({ diameter: 1.7, height: 0.8, display, doubleSided: true })) // the inside of the wall shows the image too
  .withFrame()
  .withLight()
  .build();
ring.root.position.y = 1.4;
ring.setDimension(2 * Math.PI * 1.2, 0.5);           // the width of a wall is the length of its turn: a radius of 1.2
```

A bent screen, as a curved monitor: a share of the wall of a cylinder, which bends around who faces it. Its frame goes all around it:

```ts
const curve = new PortalBuilder("curve", scene)
  .withSurface(new CylinderSurfaceBuilder({ diameter: 3.2, height: 0.8, arc: 0.18, facing: "inside", display, fit: "cover" }))
  .withFrame()
  .withLight()
  .build();
```

A mesh of the application as the surface of a portal. The portal does not own it; its frame runs along the open edges of the mesh, which the portal finds:

```ts
const panel = new PortalBuilder("panel", scene)
  .withSurface(new MeshSurfaceBuilder(scene.getMeshByName("sheet")!, { display, doubleSided: true }))
  .withLight()
  .withGlow({ size: 0.07 })
  .build();
panel.dispose(); // the mesh stays, with its former material

// The mesh alone, with a display given later.
const other = new PortalBuilder("other", scene).withSurface(mesh).withFrame().build();
other.display = display;
```

Any mesh as a screen with nothing on its edges, and back:

```ts
const surface = attachDisplay(scene.getMeshByName("screen")!, display, { fit: "cover" });
surface.dispose(); // the mesh gets its former material back
```

A picture with transparent parts:

```ts
const picture = new Texture("logo.png", scene);
picture.hasAlpha = true;
portal.display = new TextureDisplay(picture, { ownsTexture: true });
```

Transparency and look, at any time:

```ts
portal.opacity = 0.6;                                // the whole image
display.clearColor = { r: 0, g: 0, b: 0, a: 0 };     // a camera display with a see-through background
portal.chromaKey = { color: { r: 0, g: 1, b: 0 } };  // let a color through, as a green screen

portal.framed = true;                                // put on, or take off, the frame
portal.lit = true;                                   // the light
portal.glowing = false;                              // the glow
portal.frameSection = 0.02;                          // width of the frame, world units
portal.frameColor = { r: 0.2, g: 0.2, b: 0.2 };      // color of a frame that is not lit
portal.lineColor = { r: 1, g: 1, b: 1 };
portal.glowColor = { r: 1, g: 0.4, b: 0.1 };
portal.glowSize = 0.25;                              // world units
portal.glowIntensity = 2;
if (portal.neon) portal.neon.flow.amplitude = 0.4;   // waves of light along the edges; null with neither light nor glow
```

### Facts to rely on

- **Nothing by default.** A portal has no frame, no light and no glow unless it is asked for them, at build time or later (`portal.framed`, `portal.lit`, `portal.glowing`). `portal.frame`, `portal.glow` and `portal.neon` are null for what it does not wear.
- **The surface carries its display.** The display and the way to show it (`opacity`, `fit`, `doubleSided`, `border`, `useImageAlpha`, `chromaKey`, `pixelsPerUnit`) are options of the surface builder, not steps of `PortalBuilder`. `portal.display` changes the display later. `PortalBuilder.build()` throws without a surface.
- **Frame, light, glow.** The frame is a tube along the edges of the surface: around a rectangle, along the two rims of a ring, all around a bent screen, along the open edges of a mesh. Lit, it is a line of light; not lit, a plain solid of `frameColor`. A light with no frame is a hairline on the edges. A surface with no edge, as a sphere, gets none of the three.
- **Two sizes.** `portal.setDimension(width, height)` sizes the surface, in world units. `portal.resize(width, height)` sizes the image, in pixels, and resizes the display. `portal.width` and `portal.height` are in world units; the width of a wall is the length of its turn. Do not scale `portal.root`: it would thicken the frame. A portal on a mesh of the application ignores `setDimension`: scale the mesh.
- **Placement.** Position, rotate and parent `portal.root`; for a mesh of the application, `portal.root` is that mesh. Facing the front of a flat portal, its local x reads to the right and y upward. The front looks toward -z in a left-handed scene and toward +z in a right-handed one. The middle of a wall bulges toward that side; with `facing: "inside"` it stands behind the node. The image shows on the front only, unless `doubleSided`.
- **Faces.** A surface shows the image on the front faces of its mesh. `doubleSided`, an option of every surface, adds the back faces: the back of a flat mesh, where the image reads mirrored, and the inside of a hollow one. It can change at any time: `surface.doubleSided`, `portal.doubleSided`. The back faces are drawn first, in a pass of their own.
- **Ownership.** A portal does not own its display, and a display may feed several surfaces. Dispose of each: `portal.dispose()`, `surface.dispose()`, `display.dispose()`. A portal disposes of the surface it built, never of a mesh of the application, which gets its former material back. Disposing of a display empties the portals and surfaces that showed it. A display disposes of itself when its source scene is disposed.
- **One engine, one scene.** The scene of the camera and the scene of the surface must share an engine. `attachDisplay` and the `camera` setter throw otherwise. A mesh given to a portal must belong to the scene the portal is built in.
- **Who renders the source scene.** `drive: "app"` (default) expects the application to render it. `drive: "display"` renders it off the canvas, once per frame. Use `"display"` for a scene that exists only to be looked at through displays; using it for a scene the application also renders draws that scene twice, and logs a warning.
- **A portal is not in its own image.** Its screen, its frame and its glow are kept out of what its display draws.
- **Blending.** With a light or a glow, the screen of a portal is drawn with the blended meshes, after the glow, so the glow never covers the image. When opaque, it writes its depth first. A portal with neither is drawn as any surface.
- **Windows.** Only a `RectSurfaceBuilder` takes `window`. `display.windowCamera` is the camera the library places; do not move it. The camera given to the display is not moved either: it lends its scene, its `maxZ` and its `layerMask`. The image always fills the opening, so `fit` is ignored. The light behind the opening is there when the portal glows, or when `window.glow` asks for it.
- **Lenses.** `display.setLens({ scene })` makes the display draw what the camera of `scene` sees, with a copy of that camera, `display.lensCamera`; do not move it. A surface then shows the part of the image it covers on screen, whatever its shape: `fit` is ignored, the image takes the size of the canvas (`scale` in the lens changes that) and `display.resize()` does not hold. The mesh can be any that has texture coordinates, closed or open, built by Babylon.js or from the vertices of the application. Nothing is cut in front of a surface: choose what the image holds with `include` and with the layers of the camera given. A display is a screen, a window or a lens, one at a time. For a lens onto another scene, `display.setLens({ scene, root }, anchor)`; both scenes need the same handedness.
- **Large worlds.** A scene with a floating origin (`useLargeWorldRendering` on the engine, `useFloatingOrigin` on the scene) shows windows and lenses as any other: a lens reads its image with positions counted from the eye, as Babylon.js hands them to the shader of the surface. A material of the application that reads `display.imageTransform` itself must give it positions counted the same way.
- **Layers.** `WINDOW_LAYER_MASK` (0x10000000) is taken: it holds the light a window sets behind its opening. Use another bit for layers of the application, above the 28 bits (0x0fffffff) Babylon.js gives cameras and meshes by default.
- **Cost.** Each camera display is one more draw of its source scene. Lower it with `refresh: { hz: 10 }` or `"manual"` plus `display.invalidate()`, with a smaller `resolution`, and leave `pauseWhenHidden` on: a display stops drawing while none of its surfaces is on screen. The edges of a mesh are looked for once, and only for a portal that wears something.
- **Engines.** WebGL2 and WebGPU. The two materials of the library carry their shaders in GLSL and in WGSL.

### What the library adds to a scene

Expect these objects in `scene.cameras`, `scene.meshes` and `scene.materials`; do not remove them, and skip them when iterating over a scene. `<name>` is the name given to the portal.

| Object | Scene | When |
|---|---|---|
| Node `<name>` and mesh `<name>.screen` under it | of the portal | a rectangle or a cylinder; a mesh of the application is its own node and screen |
| Mesh and material `<name>.frame` | of the portal | with a frame |
| Mesh `<name>.glow` and material `<name>.neon` | of the portal | with a light or a glow. The mesh is moved before the screen in `scene.meshes` |
| Material `<screen name>.display` | of the portal | while a display is shown |
| Render target named after the display (`name` option, default `display`) in `customRenderTargets` | of the camera | always |
| Camera `spatial-display.driver`, which draws nothing | of the camera | `drive: "display"` |
| Camera `<display name>.window` | of the camera | window mode |
| Camera `<display name>.lens` | of the camera | lens mode |
| Mesh and material `<name>.worldGlow`, on `WINDOW_LAYER_MASK` | of the camera | window mode, with a glow |

### When something looks wrong

| Symptom | Cause and fix |
|---|---|
| The portal has no frame, no light or no glow | None is there by default. Call `withFrame()`, `withLight()`, `withGlow()`, or set `portal.framed`, `portal.lit`, `portal.glowing`. |
| `portal.frame`, `portal.glow` or `portal.neon` is null | The portal does not wear it, or its surface has no edge (a sphere, a closed mesh). |
| The frame of a mesh runs where it should not, or misses an edge | The edges are the ones only one triangle holds. Give the lines with `MeshSurfaceBuilder(mesh, { outlines })`. |
| The frame of a mesh is thick, or thin | The mesh is scaled: the tube is counted in its space. Set `frameSection` to make up for it, or use a light with no frame. |
| `build()` throws | No surface was given, or the mesh belongs to another scene. |
| The image is empty or frozen | Nothing renders the source scene. Render it in the loop, or set `drive: "display"`. |
| The image lags one frame | The source scene is rendered after the scene of the surface. Render it first, or use `drive: "display"`. |
| A see-through image has dark or bright fringes | The material was told the wrong alpha convention. A display declares it with `premultipliedAlpha`: true for render targets, false for pictures and videos. |
| Transparent parts of a picture show opaque | Set `texture.hasAlpha = true`, or `useImageAlpha: true` on the surface. |
| A window shows nothing new when the viewer goes behind the portal | By design: it keeps its last image. |
| `window` does nothing on a cylinder or on a mesh | Only a flat rectangle can be a window. Use a lens for a surface of another shape. |
| `attachDisplay` throws, or a portal on a mesh does when given a display | The mesh has no texture coordinates, is an instance (use its source mesh), or belongs to another engine. |
| The glow does not show over the image | By design. It shows around the surface, and through a see-through image. |
| The near rim of a ring shows no glow against the inside of the ring | The glow is drawn before the whole wall, and the far wall covers it. It shows with `doubleSided` off. |
| A transparent object behind a portal is drawn over it | Blended meshes are sorted by distance. Move the object, or give it a lower `alphaIndex`. |
| Standard materials fail to compile, with HTML in the shader source | A Vite dev server bundled Babylon.js in several passes. Add `optimizeDeps: { exclude: ["@babylonjs/core"] }`, as `examples/vite.base.ts` does. |
| A lens shows meshes that stand in front of its surface | By design: a lens cuts nothing. Keep those meshes out of the image with `include`, or with a layer the camera given does not have. |
| A surface shows nothing from behind or from the inside, or the far wall of a hollow surface is missing | The image shows on the front faces of a mesh. Set `doubleSided`, at creation or later with `portal.doubleSided = true`. |
| `setLens` throws | The anchor is not in the scene the display shows, or the two scenes differ in handedness or in engine. |
| Wireframe lines of an x-ray are faint | They are one pixel wide in the image of the display. Lower its `resolution` toward the size of the screen on the canvas. |

### Not available

Do not promise these to a user, and do not look for them in the API:

- Pointer input through a surface to the scene behind it.
- A window on a surface that is not a flat rectangle.
- A separate image for each eye in window mode and in lens mode. In a headset both eyes get the image drawn for the camera of the scene.
- A plane that cuts the image of a lens at its surface, as the opening of a window does.
- A portal that shows in itself.
- A glow drawn between the far wall and the near wall of a hollow surface that shows both its faces.
- Fog, clip planes and instances in the materials of the screen and of the frame. For those, give `display.texture` to a material of the application.
- A source scene that uses `scene.activeCameras` with `drive: "display"`.
- Glow and highlight layers of the source scene in the image. The post-processes of the camera do show, with `postProcesses: true`.

Nothing has been run in a headset.

## Part 2: working in this repository

### Commands

```bash
npm install
npm run build          # tsc -b, both packages
npm run typecheck      # packages, tests and examples
npm test               # Vitest
npm run example:portal # http://localhost:5183, add ?window, ?webgpu, ?rh
npm run example:xray   # http://localhost:5184, add ?webgpu, ?rh
npm run example:xray360 # http://localhost:5185, add ?polygon, ?sphere, ?webgpu, ?rh
npm run playground:bundle # examples/playground/out/spatial-display.js, the library for the Playground
```

Run `npm run typecheck` and `npm test` before calling a change done.

### Layout

```
packages/core/src       no dependency, no rendering library, no DOM
  types.ts              IDisplay, IPhysicalDisplay, ISize2
  display/              Display, PhysicalDisplay: the base classes
  geometry/             outline.ts   the lines a frame runs along; the one of a rectangle
                        frame.ts     tube and halo of a frame, along any outline
                        cylinder.ts  wall of a cylinder and its outlines
                        boundary.ts  open edges of a mesh of triangles
                        tunnel.ts    walls of light behind a window
                        fit.ts       image fitting
  projection/           off-axis projection of a window
  temporal/             refresh clock
packages/babylon/src    the Babylon.js adapter
  camera-display.ts     CameraDisplay: screen, window and lens
  texture-display.ts    TextureDisplay
  surface.ts            DisplaySurface, attachDisplay
  portal-surface.ts     IPortalSurface, IPortalSurfaceBuilder; RectSurfaceBuilder, CylinderSurfaceBuilder, MeshSurfaceBuilder
  portal.ts             Portal
  portal-builder.ts     PortalBuilder
  source-hub.ts         per-scene beat of the frame, rendering of driven scenes
  materials/            DisplayMaterial, NeonMaterial, their shaders
packages/*/README.md    what npm shows for each package
tests/core, tests/babylon
examples/portal, examples/xray, examples/xray360, examples/vite.base.ts
examples/playground     xray.js, xray360.js: two examples as snippets of the Babylon.js Playground
                        bundle.mjs: builds the library on the BABYLON global; publish.mjs: saves a snippet
.github/workflows/release.yaml   publishes both packages when a tag vX.Y.Z is pushed
```

### Conventions

- Every interface is named `IXxx`, the options of a class included (`IPortalOptions`). Type aliases and classes take plain names.
- Public APIs take and return the most general Babylon.js type: `AbstractMesh`, not `Mesh`. Keep `Mesh` for private fields that build geometry.
- What does not need a rendering library goes in `packages/core`, and the Babylon.js classes extend or call it: `Display` -> `PhysicalDisplay` -> `Portal`. Do not rewrite in the adapter what the core can hold.
- A portal knows no shape. What depends on the shape of its surface goes in an `IPortalSurface`, which gives the portal a mesh and outlines; the portal sets the frame and the glow on those outlines, whatever they are.
- A step of `PortalBuilder` sets one thing and returns the builder. What belongs to the surface (its display, the way to show it, the window mode) is an option of the surface builder, never a second step.
- Import Babylon.js module by module, with the extension: `@babylonjs/core/Meshes/mesh.js`. Use `import type` for types.
- ESM with NodeNext: relative imports end in `.js`. The compiler options are strict, with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.
- Comments say why, in plain English. No em dash anywhere: code, comments, documentation, commit messages.
- A shader exists twice, in GLSL and in WGSL, side by side in `materials/shaders.ts`. Change both in the same edit.
- A material of the library outputs colors multiplied by their alpha and blends with `ALPHA_PREMULTIPLIED_PORTERDUFF`.
- Never call a hook of a subclass from a constructor of `Display` or `PhysicalDisplay`.

### Checking a change

- Tests run on the null engine of Babylon.js: they check state, order and math, and draw nothing. A change to a shader, to blending or to draw order must also be looked at in an example, on WebGL and with `?webgpu`, and with `?rh`.
- The glow of a portal is drawn before its screen because both have the very same bounding centre and the glow comes first in `scene.meshes`. A change to the bounds of either, or to the order they are made in, must keep both.
- The glow of a curve is looked at from the side too: where a rim turns toward the eye its sides are seen end on, which is where a mitre goes wrong.
- When bounds of a mesh are rebuilt with `buildBoundingInfo`, pass the world matrix of the mesh. Without it the mesh is culled and sorted as if it stood at the origin.
- The examples serve Babylon.js unbundled (`optimizeDeps.exclude`). Do not remove that.

### Playground

- `examples/playground/xray.js` and `xray360.js` follow `examples/xray/main.ts` and `examples/xray360/main.ts`: a change to one is carried to the other.
- `publish.mjs` saves a snippet on the public server of the Playground, where it stays. Do not run it unless asked; when it is run, give it the id of the snippet, so that it saves a new revision, and put the address it prints in `README.md`, in `packages/babylon/README.md` and in this file.

### Releasing

The two packages carry the same version. `README.md` has the steps: set the version in both `packages/*/package.json` and in the peer range of the adapter on the core, commit, tag `vX.Y.Z` and push the tag; the workflow builds, checks, tests and publishes. Do not publish, tag or push unless asked.

### Git

- Commit only when asked, directly on `main`. Do not push unless asked.
- Commits carry the identity of the author only: no co-author trailer, no mention of a tool or of an assistant, in commits, tags or release notes.
- The `.claude/` folder is not tracked.
