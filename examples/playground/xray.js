// spatial-display: an x-ray screen, in one scene.
//
// The portal is a window onto the very scene it stands in: its display looks at what stands behind the opening
// from the eye of the viewer, and draws every mesh as a wireframe. It sees more layers than the camera of the
// application does: the pipes in the wall and under the floor, which that camera never draws, show in the screen.
//
// A figure walks around the wall. Its bones are meshes of that hidden layer, carried by the same joints as its
// body: the camera of the application draws the body, the screen draws the bones. So the figure shows as a
// skeleton when it passes behind the screen, and still does behind the wall, where the eye has lost it.
//
// No mesh is copied: a mesh is drawn solid by the camera of the application and as a wireframe by the screen,
// from the same vertices.
//
// "spatial-display.js", the other file of this snippet, is the library, built to read Babylon.js from the BABYLON
// global of the Playground. Its sources and its documentation: https://github.com/pandaGaume/spatial-display
import { CameraDisplay, PortalBuilder, RectSurfaceBuilder } from "./spatial-display";

/** A layer the camera of the application does not draw: Babylon.js gives cameras and meshes the 28 bits below it. */
const HIDDEN_LAYER = 0x20000000;
const EVERYDAY_LAYERS = 0x0fffffff;

/** Size of the wall, in meters. */
const WALL = { width: 7, height: 2.8, depth: 0.5, z: 2.2 };

/** Height of the hips of the walker, and the length it covers in two steps, in meters. */
const HIP_HEIGHT = 0.9;
const STRIDE = 1.45;

/** Paints courses of bricks, each laid half a brick off the one under it. */
function createBricks(scene) {
  const width = 1792;
  const height = 720;
  const texture = new BABYLON.DynamicTexture("bricks", { width, height }, scene, true);
  const context = texture.getContext();
  context.fillStyle = "#b9b2a6";
  context.fillRect(0, 0, width, height);
  const courses = 24;
  const course = height / courses;
  const brick = course * 2.9;
  const joint = 4;
  // The same wall at every load: the shade of a brick comes from its place.
  const shade = (row, column) => (Math.sin(row * 12.9898 + column * 78.233) * 43758.5453) % 1;
  for (let row = 0; row < courses; row++) {
    const offset = row % 2 === 0 ? 0 : -brick / 2;
    for (let column = 0; offset + column * brick < width; column++) {
      const tone = Math.abs(shade(row, column));
      context.fillStyle = `rgb(${Math.round(150 + 45 * tone)}, ${Math.round(72 + 26 * tone)}, ${Math.round(56 + 18 * tone)})`;
      context.fillRect(offset + column * brick + joint / 2, row * course + joint / 2, brick - joint, course - joint);
    }
  }
  texture.update();
  return texture;
}

/**
 * Builds a figure out of plain shapes, 1.75 m tall, that looks along its own z. Each part of its body hangs from
 * a joint, with a bone inside it: a mesh of the hidden layer, which follows the joint as the body does.
 */
function createWalker(scene, skin, ivory) {
  const MB = BABYLON.MeshBuilder;
  const body = [];
  const bones = [];
  const root = new BABYLON.TransformNode("walker", scene);
  const joint = (name, parent, x, y) => {
    const node = new BABYLON.TransformNode(`walker.${name}`, scene);
    node.parent = parent;
    node.position.set(x, y, 0);
    return node;
  };
  const flesh = (mesh, parent) => {
    mesh.parent = parent;
    mesh.material = skin;
    body.push(mesh);
    return mesh;
  };
  const bone = (mesh, parent) => {
    mesh.parent = parent;
    mesh.material = ivory;
    mesh.layerMask = HIDDEN_LAYER;
    bones.push(mesh);
    return mesh;
  };
  /** A part of a limb, hanging from its joint: flesh around a bone, and the knob of the joint. */
  const segment = (name, at, length, thickness) => {
    flesh(MB.CreateCapsule(`walker.${name}`, { height: length + thickness, radius: thickness / 2, tessellation: 12 }, scene), at).position.y = -length / 2;
    bone(MB.CreateCylinder(`walker.${name}.bone`, { height: length, diameterTop: 0.05, diameterBottom: 0.032, tessellation: 8 }, scene), at).position.y = -length / 2;
    bone(MB.CreateSphere(`walker.${name}.knob`, { diameter: 0.075, segments: 8 }, scene), at);
  };
  const limb = (name, parent, x, y, upper, lower, thickness) => {
    const top = joint(name, parent, x, y);
    segment(`${name}.upper`, top, upper, thickness);
    const middle = joint(`${name}.middle`, top, 0, -upper);
    segment(`${name}.lower`, middle, lower, thickness * 0.85);
    return { top, middle };
  };

  // --- The trunk, from the hips up.
  const hips = joint("hips", root, 0, HIP_HEIGHT);
  const trunk = flesh(MB.CreateCapsule("walker.trunk", { height: 0.74, radius: 0.17, tessellation: 16 }, scene), hips);
  trunk.position.y = 0.31;
  trunk.scaling.set(1.15, 1, 0.72);
  bone(MB.CreateTorus("walker.pelvis", { diameter: 0.25, thickness: 0.055, tessellation: 16 }, scene), hips).scaling.z = 0.7;
  bone(MB.CreateCylinder("walker.spine", { height: 0.6, diameter: 0.045, tessellation: 8 }, scene), hips).position.y = 0.32;
  for (let rib = 0; rib < 4; rib++) {
    const ring = bone(MB.CreateTorus(`walker.rib${rib}`, { diameter: 0.3 - rib * 0.022, thickness: 0.022, tessellation: 16 }, scene), hips);
    ring.position.y = 0.27 + rib * 0.075;
    ring.scaling.z = 0.68;
  }
  const collar = bone(MB.CreateCylinder("walker.collar", { height: 0.46, diameter: 0.03, tessellation: 8 }, scene), hips);
  collar.rotation.z = Math.PI / 2;
  collar.position.y = 0.56;

  // --- The head.
  const neck = joint("neck", hips, 0, 0.66);
  flesh(MB.CreateSphere("walker.head", { diameter: 0.24, segments: 12 }, scene), neck).position.y = 0.13;
  bone(MB.CreateSphere("walker.skull", { diameter: 0.185, segments: 10 }, scene), neck).position.y = 0.15;
  bone(MB.CreateBox("walker.jaw", { width: 0.1, height: 0.04, depth: 0.1 }, scene), neck).position.set(0, 0.045, 0.035);
  bone(MB.CreateCylinder("walker.neck.bone", { height: 0.12, diameter: 0.04, tessellation: 8 }, scene), neck);

  // --- The limbs: the left ones, then the right ones.
  const legs = [-1, 1].map((side) => limb(side < 0 ? "leg.left" : "leg.right", hips, side * 0.1, -0.02, 0.44, 0.44, 0.13));
  const arms = [-1, 1].map((side) => limb(side < 0 ? "arm.left" : "arm.right", hips, side * 0.26, 0.54, 0.3, 0.28, 0.09));
  legs.forEach((leg, i) => {
    flesh(MB.CreateBox(`walker.foot${i}`, { width: 0.1, height: 0.07, depth: 0.25 }, scene), leg.middle).position.set(0, -0.46, 0.06);
    bone(MB.CreateBox(`walker.foot${i}.bone`, { width: 0.045, height: 0.03, depth: 0.19 }, scene), leg.middle).position.set(0, -0.46, 0.06);
  });

  /** Sets the limbs for a figure that has walked `distance`, in meters. */
  const stride = (distance) => {
    const phase = (distance / STRIDE) * 2 * Math.PI;
    legs.forEach((leg, i) => {
      // The two legs are half a stride apart. A turn about x by a positive angle sends what hangs backward.
      const own = phase + i * Math.PI;
      leg.top.rotation.x = -0.5 * Math.sin(own);
      // The knee bends while its leg swings forward, and is straight when the foot lands.
      leg.middle.rotation.x = 0.85 * Math.max(0, Math.cos(own));
      // An arm swings with the leg of the other side, and its elbow stays bent, forward.
      arms[i].top.rotation.x = 0.42 * Math.sin(own);
      arms[i].middle.rotation.x = -0.35 - 0.2 * Math.max(0, -Math.sin(own));
    });
    // The body sinks a little at each step, and leans into its walk.
    hips.position.y = HIP_HEIGHT - 0.02 * (1 - Math.cos(2 * phase));
    hips.rotation.x = 0.05;
    hips.rotation.z = 0.03 * Math.sin(phase);
  };
  stride(0);
  return { root, body, bones, stride };
}

export const createScene = function (engine, canvas) {
  const MB = BABYLON.MeshBuilder;
  const scene = new BABYLON.Scene(engine);
  scene.clearColor = new BABYLON.Color4(0.05, 0.06, 0.09, 1);
  new BABYLON.HemisphericLight("light", new BABYLON.Vector3(0.3, 1, -0.4), scene);

  // The viewer stands low, about at the height of the screen: the line of sight then runs level through it, and
  // reaches a figure that walks behind the wall. From above it would end on the floor.
  const camera = new BABYLON.ArcRotateCamera("camera", -Math.PI / 2 - 0.35, 1.45, 8.5, new BABYLON.Vector3(0, 1.1, 0.8), scene);
  camera.wheelPrecision = 60;
  camera.minZ = 0.05;
  camera.attachControl(canvas, true);

  const solid = (name, color) => {
    const material = new BABYLON.StandardMaterial(name, scene);
    material.diffuseColor = color;
    material.specularColor = new BABYLON.Color3(0.12, 0.12, 0.12);
    return material;
  };

  // --- What everyone sees.
  const ground = MB.CreateGround("ground", { width: 18, height: 18, subdivisions: 18 }, scene);
  ground.material = solid("ground", new BABYLON.Color3(0.2, 0.21, 0.25));

  // A wall of bricks, with a coping stone on top. Its two long faces show the whole of the bricks, its ends and
  // its top the share of them they are wide.
  const whole = new BABYLON.Vector4(0, 0, 1, 1);
  const end = new BABYLON.Vector4(0, 0, WALL.depth / WALL.width, 1);
  const top = new BABYLON.Vector4(0, 0, 1, WALL.depth / WALL.height);
  const wall = MB.CreateBox("wall", { width: WALL.width, height: WALL.height, depth: WALL.depth, faceUV: [whole, whole, end, end, top, top] }, scene);
  wall.position.set(0, WALL.height / 2, WALL.z);
  const bricks = solid("bricks", new BABYLON.Color3(1, 1, 1));
  bricks.diffuseTexture = createBricks(scene);
  wall.material = bricks;
  const coping = MB.CreateBox("coping", { width: WALL.width + 0.16, height: 0.09, depth: WALL.depth + 0.16 }, scene);
  coping.position.set(0, WALL.height + 0.045, WALL.z);
  coping.material = solid("stone", new BABYLON.Color3(0.72, 0.7, 0.66));

  // A mesh that is costly to draw: 24 576 triangles. It is in the scene once.
  const knot = MB.CreateTorusKnot("knot", { radius: 0.55, tube: 0.18, radialSegments: 256, tubularSegments: 48 }, scene);
  knot.position.set(-1.7, 1.15, 0.9);
  knot.material = solid("knot", new BABYLON.Color3(0.1, 0.55, 0.6));

  const crate = MB.CreateBox("crate", { size: 0.9 }, scene);
  crate.position.set(1.5, 0.45, 0.8);
  crate.rotation.y = 0.5;
  crate.material = solid("crate", new BABYLON.Color3(0.75, 0.5, 0.2));

  // --- What only the screen sees: on a layer the camera of the application does not draw.
  const pipes = solid("pipes", new BABYLON.Color3(0.9, 0.5, 0.1));
  const hide = (mesh) => {
    mesh.layerMask = HIDDEN_LAYER;
    mesh.material = pipes;
    return mesh;
  };
  // Pipes in the thickness of the wall.
  [0.5, 1.3, 2.2].forEach((y, i) => {
    const pipe = hide(MB.CreateCylinder(`wall.pipe${i}`, { diameter: 0.14, height: 6.6, tessellation: 16 }, scene));
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(0, y, WALL.z);
  });
  [-2.4, -0.6, 1.1, 2.7].forEach((x, i) => {
    const riser = hide(MB.CreateCylinder(`wall.riser${i}`, { diameter: 0.1, height: 2.6, tessellation: 12 }, scene));
    riser.position.set(x, 1.4, WALL.z);
    const valve = hide(MB.CreateTorus(`wall.valve${i}`, { diameter: 0.34, thickness: 0.07, tessellation: 20 }, scene));
    valve.rotation.x = Math.PI / 2;
    valve.position.set(x, 1.3, WALL.z);
  });
  // A machine behind the wall, past where the walker goes.
  hide(MB.CreateCylinder("tank", { diameter: 1.3, height: 1.8, tessellation: 28 }, scene)).position.set(-0.8, 0.9, 5.6);
  hide(MB.CreateSphere("dome", { diameter: 1.3, segments: 20 }, scene)).position.set(-0.8, 1.8, 5.6);
  hide(MB.CreateBox("cabinet", { width: 1, height: 1.6, depth: 0.7 }, scene)).position.set(1.4, 0.8, 5.5);
  // Pipes under the floor.
  [-1.8, 0.1, 2].forEach((x, i) => {
    const drain = hide(MB.CreateCylinder(`drain${i}`, { diameter: 0.22, height: 7, tessellation: 16 }, scene));
    drain.rotation.x = Math.PI / 2;
    drain.position.set(x, -0.45, 1.2);
  });

  // --- The walker: a body everyone sees, and bones only the screen sees.
  const walker = createWalker(scene, solid("skin", new BABYLON.Color3(0.22, 0.45, 0.85)), solid("ivory", new BABYLON.Color3(0.93, 0.9, 0.82)));
  const body = new Set(walker.body);
  const bones = new Set(walker.bones);
  // It goes around the wall: in front of it, where it passes behind the screen, then behind it, out of sight.
  const path = { x: 4.7, z: 2.3, centre: 1.7 };
  const along = (angle) => new BABYLON.Vector3(path.x * Math.cos(angle), 0, path.centre + path.z * Math.sin(angle));

  // --- The materials of the x-ray. They are not lit: a wireframe reads by its lines alone.
  const wire = (name, color) => {
    const material = new BABYLON.StandardMaterial(name, scene);
    material.wireframe = true;
    material.disableLighting = true;
    material.diffuseColor = BABYLON.Color3.Black();
    material.specularColor = BABYLON.Color3.Black();
    material.emissiveColor = color;
    return material;
  };
  const seenWire = wire("xray.seen", new BABYLON.Color3(0.25, 0.95, 1));
  const hiddenWire = wire("xray.hidden", new BABYLON.Color3(1, 0.62, 0.15));
  // The body is a faint outline around its bones, which show plain and bright.
  const bodyWire = wire("xray.body", new BABYLON.Color3(0.08, 0.3, 0.38));
  const boneLight = new BABYLON.StandardMaterial("xray.bone", scene);
  boneLight.disableLighting = true;
  boneLight.diffuseColor = BABYLON.Color3.Black();
  boneLight.specularColor = BABYLON.Color3.Black();
  boneLight.emissiveColor = new BABYLON.Color3(0.97, 0.98, 1);
  const xray = (mesh) => {
    if (bones.has(mesh)) return boneLight;
    if (body.has(mesh)) return bodyWire;
    return mesh.layerMask === HIDDEN_LAYER ? hiddenWire : seenWire;
  };

  // --- The screen. This camera is never the camera of the scene: it lends the screen its layers and its far plane.
  const scanner = new BABYLON.FreeCamera("xray.scanner", BABYLON.Vector3.Zero(), scene, false);
  scanner.layerMask = EVERYDAY_LAYERS | HIDDEN_LAYER;
  scanner.maxZ = 60;
  const display = new CameraDisplay({
    camera: scanner,
    resolution: { width: 1360, height: 1040 },
    samples: 4,
    // Not quite opaque: the scene shows through, under the lines drawn of it.
    clearColor: { r: 0, g: 0.035, b: 0.07, a: 0.82 },
    overrideMaterial: xray,
    name: "xray.display",
  });
  // Its display shows the scene it stands in: with no anchor given, the opening gives onto what stands behind it.
  const portal = new PortalBuilder("xray", scene)
    .withSurface(new RectSurfaceBuilder({ width: 1.7, height: 1.3, display, window: { glow: { depth: 0.25 } } }))
    .withFrame()
    .withLight()
    .withGlow({ size: 0.12 })
    .build();
  portal.root.position.set(0, 1.3, -1.4);

  // --- The walker goes around the wall, and the screen sweeps in front of it.
  let walking = true;
  let moving = true;
  let time = 0;
  let angle = -1.2;
  let walked = 0;
  scene.onBeforeRenderObservable.add(() => {
    const seconds = Math.min(engine.getDeltaTime() / 1000, 0.1);
    if (walking) {
      // A step along the path, at the pace of a walk, and the limbs for the length walked.
      const step = 1.25 * seconds;
      angle += step / Math.hypot(path.x * Math.sin(angle), path.z * Math.cos(angle));
      walked += step;
      const here = along(angle);
      const ahead = along(angle + 0.01).subtractInPlace(here);
      walker.root.position.copyFrom(here);
      walker.root.rotation.y = Math.atan2(ahead.x, ahead.z);
      walker.stride(walked);
    }
    if (!moving) return;
    time += seconds;
    portal.root.position.x = 2.4 * Math.sin(time * 0.45);
    portal.root.position.y = 1.3 + 0.15 * Math.sin(time * 0.31);
  });

  // --- Controls. The interface is drawn over the canvas: it is in no image of a display.
  const ui = BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI("ui", true, scene);
  const panel = new BABYLON.GUI.StackPanel("controls");
  panel.width = "230px";
  panel.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
  panel.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
  panel.paddingLeft = "12px";
  panel.paddingTop = "12px";
  ui.addControl(panel);
  const check = (label, checked, onChange) => {
    const box = new BABYLON.GUI.Checkbox(label);
    box.width = "18px";
    box.height = "18px";
    box.color = "#6fb6ff";
    box.background = "#0a1224";
    box.isChecked = checked;
    box.onIsCheckedChangedObservable.add(onChange);
    const row = BABYLON.GUI.Control.AddHeader(box, label, "190px", { isHorizontal: true, controlFirst: true });
    row.height = "28px";
    row.color = "#cfe6ff";
    row.fontSize = 14;
    row.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    panel.addControl(row);
  };
  check("Move the screen", true, (value) => (moving = value));
  check("Walk", true, (value) => (walking = value));
  check("See hidden meshes", true, (value) => (scanner.layerMask = value ? EVERYDAY_LAYERS | HIDDEN_LAYER : EVERYDAY_LAYERS));
  check("Wireframe", true, (value) => (display.overrideMaterial = value ? xray : null));
  check("Frame, light and glow", true, (value) => {
    portal.framed = value;
    portal.lit = value;
    portal.glowing = value;
  });

  return scene;
};
