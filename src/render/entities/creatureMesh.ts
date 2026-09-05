/**
 * Parametric creatures.
 *
 * Every species in the game is built from the knobs in `CreatureBody`: a body
 * capsule, legs, ears, a tail and eyes. That is a small vocabulary, but it is
 * enough to make a Mossling and a Fogheron read as clearly different animals
 * at a glance, and it means adding a species is a data change rather than an
 * art pipeline.
 *
 * Eyes are deliberately oversized and set forward. That single decision does
 * more for "appealing to an eight year old" than any amount of shader work.
 */

import {
  CapsuleGeometry,
  ConeGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  type BufferGeometry,
  type Material,
} from 'three';
import type { CreatureBody } from '../../sim/types';

export interface CreatureParts {
  root: Group;
  body: Mesh;
  head: Mesh;
  legs: Group[];
  tail: Group | null;
  /**
   * Small features -- eyes, pupils, ears, belly -- collected so they can be
   * hidden at distance.
   *
   * Each one is its own draw call, and every draw call is paid again for
   * every shadow cascade. Nine guardians with fourteen meshes apiece was
   * comfortably the largest single item in the frame's draw budget, and none
   * of it is visible past about twenty metres.
   */
  detail: Group;
  /** Disposed together when the creature leaves the scene. */
  owned: (BufferGeometry | Material)[];
}

export function buildCreature(body: CreatureBody, scale = 1): CreatureParts {
  const owned: (BufferGeometry | Material)[] = [];
  const [primary, secondary, accent] = body.palette;

  const skin = new MeshStandardMaterial({ color: primary, roughness: 0.72, metalness: 0 });
  const belly = new MeshStandardMaterial({ color: secondary, roughness: 0.78, metalness: 0 });
  const dark = new MeshStandardMaterial({ color: accent, roughness: 0.68, metalness: 0 });
  const eyeWhite = new MeshStandardMaterial({ color: '#f4f2ee', roughness: 0.28 });
  // Not pure black: a pure-black albedo swallows every highlight and the eye
  // dies. A very dark warm grey keeps the catchlight.
  const pupil = new MeshStandardMaterial({ color: '#1a1614', roughness: 0.18 });
  owned.push(skin, belly, dark, eyeWhite, pupil);

  const root = new Group();
  root.scale.setScalar(scale);

  // Everything small enough to disappear at range goes in here.
  const detail = new Group();

  // --- body ---------------------------------------------------------------
  const bodyGeo = new CapsuleGeometry(body.bodyRadius, body.bodyRadius * body.bodyStretch, 6, 14);
  bodyGeo.rotateX(Math.PI / 2);
  owned.push(bodyGeo);
  const bodyMesh = new Mesh(bodyGeo, skin);
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  bodyMesh.position.y = body.bodyRadius + body.legLength;
  root.add(bodyMesh);

  const bellyGeo = new SphereGeometry(body.bodyRadius * 0.82, 12, 10);
  owned.push(bellyGeo);
  const bellyMesh = new Mesh(bellyGeo, belly);
  bellyMesh.position.set(0, -body.bodyRadius * 0.28, body.bodyRadius * 0.18);
  bellyMesh.scale.set(1, 0.72, 1.15);
  bodyMesh.add(bellyMesh);
  detail.attach(bellyMesh);
  bodyMesh.add(detail);

  // --- head ---------------------------------------------------------------
  const headRadius = body.bodyRadius * 0.72;
  const headGeo = new SphereGeometry(headRadius, 14, 12);
  owned.push(headGeo);
  const head = new Mesh(headGeo, skin);
  head.castShadow = true;
  head.position.set(0, body.bodyRadius * 0.55, body.bodyRadius * body.bodyStretch * 0.75);
  bodyMesh.add(head);

  // --- eyes ---------------------------------------------------------------
  const eyeGeo = new SphereGeometry(body.eyeSize, 10, 8);
  const pupilGeo = new SphereGeometry(body.eyeSize * 0.52, 8, 6);
  owned.push(eyeGeo, pupilGeo);
  for (const side of [-1, 1]) {
    const eye = new Mesh(eyeGeo, eyeWhite);
    eye.position.set(side * headRadius * 0.45, headRadius * 0.16, headRadius * 0.76);
    head.add(eye);
    const iris = new Mesh(pupilGeo, pupil);
    iris.position.set(0, 0, body.eyeSize * 0.62);
    eye.add(iris);
    detail.attach(eye);
    head.add(eye);
  }

  // --- ears ---------------------------------------------------------------
  if (body.earStyle !== 'none') {
    const ear = earGeometry(body.earStyle, headRadius);
    owned.push(ear);
    for (const side of [-1, 1]) {
      const mesh = new Mesh(ear, body.earStyle === 'frill' ? dark : skin);
      mesh.castShadow = true;
      mesh.position.set(side * headRadius * 0.52, headRadius * 0.72, -headRadius * 0.1);
      mesh.rotation.z = side * 0.28;
      head.add(mesh);
      detail.attach(mesh);
      head.add(mesh);
    }
  }

  // --- legs ---------------------------------------------------------------
  const legs: Group[] = [];
  if (body.legCount > 0 && body.legLength > 0) {
    const legGeo = new CapsuleGeometry(body.bodyRadius * 0.17, body.legLength, 4, 7);
    owned.push(legGeo);
    const pairs = body.legCount / 2;
    for (let pair = 0; pair < pairs; pair++) {
      // Spread the pairs along the body so a six-legged beetle doesn't have
      // all its legs in one bunch under the middle.
      const along =
        pairs === 1 ? 0 : (pair / (pairs - 1) - 0.5) * body.bodyRadius * body.bodyStretch * 1.5;
      for (const side of [-1, 1]) {
        const hip = new Group();
        hip.position.set(side * body.bodyRadius * 0.68, body.bodyRadius + body.legLength, along);
        const leg = new Mesh(legGeo, dark);
        leg.castShadow = true;
        leg.position.y = -body.legLength * 0.5 - body.bodyRadius * 0.4;
        hip.add(leg);
        root.add(hip);
        legs.push(hip);
      }
    }
  }

  // --- tail ---------------------------------------------------------------
  let tail: Group | null = null;
  if (body.tailStyle !== 'none') {
    tail = new Group();
    const geo = tailGeometry(body.tailStyle, body.bodyRadius);
    owned.push(geo);
    const mesh = new Mesh(geo, body.tailStyle === 'fan' ? belly : skin);
    mesh.castShadow = true;
    tail.add(mesh);
    tail.position.set(0, body.bodyRadius * 0.35, -body.bodyRadius * body.bodyStretch * 0.85);
    bodyMesh.add(tail);
  }

  return { root, body: bodyMesh, head, legs, tail, detail, owned };
}

function earGeometry(style: CreatureBody['earStyle'], headRadius: number): BufferGeometry {
  switch (style) {
    case 'round': {
      const geo = new SphereGeometry(headRadius * 0.34, 8, 6);
      geo.scale(1, 1, 0.5);
      return geo;
    }
    case 'tall': {
      const geo = new CapsuleGeometry(headRadius * 0.17, headRadius * 0.95, 4, 7);
      geo.translate(0, headRadius * 0.5, 0);
      return geo;
    }
    case 'fin': {
      const geo = new ConeGeometry(headRadius * 0.36, headRadius * 0.7, 4);
      geo.rotateX(-0.5);
      return geo;
    }
    case 'frill': {
      const geo = new ConeGeometry(headRadius * 0.52, headRadius * 0.34, 7, 1, true);
      geo.rotateX(Math.PI * 0.42);
      return geo;
    }
    case 'none':
    default:
      return new SphereGeometry(0.001, 3, 2);
  }
}

function tailGeometry(style: CreatureBody['tailStyle'], bodyRadius: number): BufferGeometry {
  switch (style) {
    case 'tuft': {
      const geo = new SphereGeometry(bodyRadius * 0.42, 8, 6);
      geo.scale(1, 1, 1.25);
      return geo;
    }
    case 'long': {
      const geo = new CapsuleGeometry(bodyRadius * 0.14, bodyRadius * 1.5, 4, 7);
      geo.rotateX(Math.PI / 2.3);
      geo.translate(0, bodyRadius * 0.3, -bodyRadius * 0.7);
      return geo;
    }
    case 'fan': {
      const geo = new ConeGeometry(bodyRadius * 0.85, bodyRadius * 0.3, 6, 1, false);
      geo.rotateX(Math.PI * 0.42);
      geo.scale(1, 1, 0.35);
      return geo;
    }
    case 'none':
    default:
      return new SphereGeometry(0.001, 3, 2);
  }
}

export function disposeCreature(parts: CreatureParts): void {
  for (const item of parts.owned) item.dispose();
  parts.owned.length = 0;
}
