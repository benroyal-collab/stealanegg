/**
 * Bridges the pure movement solver to Rapier and the camera.
 *
 * The player is a kinematic-position rigid body. Rapier's character
 * controller turns the solver's desired displacement into a legal one; the
 * solver never sees a collider. Everything in here that runs per frame reuses
 * preallocated objects -- there are no allocations in this hot path.
 */

import { useFrame } from '@react-three/fiber';
import { CapsuleCollider, RigidBody, useRapier, type RapierRigidBody } from '@react-three/rapier';
import { useEffect, useRef } from 'react';
import { PerspectiveCamera, Vector3 } from 'three';
import { MOVEMENT } from '../../data/balance';
import { noiseRadiusFor } from '../../sim/guardian';
import {
  addShake,
  applyLook,
  createCameraOutput,
  createCameraState,
  stepCamera,
  type CameraOptions,
  type CameraOutput,
  type CameraState,
  type CameraTarget,
} from '../../systems/camera';
import type { InputManager } from '../../systems/input';
import {
  beginTumble,
  createMovementState,
  stepMovement,
  type Displacement,
  type MovementEnvironment,
  type MovementInput,
  type MovementState,
} from '../../systems/movement';
import { useGame } from '../../state/store';
import { playerRef, type PlayerRuntime } from './playerRuntime';

export interface PlayerControllerProps {
  input: InputManager;
  spawn: readonly [number, number, number];
  /** Water plane height for this biome, or null when it is dry. */
  waterLevel: number | null;
  /** Pace already reduced by whatever the player is carrying. */
  pace: number;
  onFrame?: (runtime: PlayerRuntime, dt: number) => void;
}

const UP_OFFSET = MOVEMENT.capsuleHeight / 2 + MOVEMENT.capsuleRadius;

/**
 * Mutable per-frame pool.
 *
 * Held in a ref rather than useMemo. These are written from inside useFrame,
 * which is not render -- but React's compiler lint cannot know that, and a
 * ref is the sanctioned escape hatch. Pooling is not optional: allocating a
 * vector per frame per entity is the difference between holding the frame
 * budget and not.
 */
interface Pool {
  movement: MovementState;
  cameraState: CameraState;
  cameraOut: CameraOutput;
  displacement: Displacement;
  moveInput: MovementInput;
  environment: MovementEnvironment;
  cameraOptions: CameraOptions;
  desired: Vector3;
  next: Vector3;
  rayOrigin: Vector3;
  rayDir: Vector3;
}

function createPool(pace: number): Pool {
  return {
    movement: createMovementState(),
    cameraState: createCameraState(),
    cameraOut: createCameraOutput(),
    displacement: { x: 0, y: 0, z: 0 },
    moveInput: {
      moveX: 0,
      moveY: 0,
      cameraYaw: 0,
      sprintHeld: false,
      crouchHeld: false,
      pursuitPressure: 0,
      jumpPressed: false,
      dt: 0,
    },
    environment: {
      grounded: false,
      groundNormalY: 1,
      vaultHeight: null,
      waterDepth: 0,
      pace,
      ceilingBlocked: false,
    },
    cameraOptions: { reducedMotion: false, shakeEnabled: true, distanceBias: 0 },
    desired: new Vector3(),
    next: new Vector3(),
    rayOrigin: new Vector3(),
    rayDir: new Vector3(),
  };
}

/**
 * Steepest thing we are standing on this frame.
 *
 * Rapier reports each contact separately; the flattest normal is the one the
 * solver should treat as ground, otherwise brushing a wall while standing on
 * a flat floor reads as an unstandable slope.
 */
interface GroundQuery {
  numComputedCollisions: () => number;
  computedCollision: (i: number) => { normal1: { x: number; y: number; z: number } } | null;
  computedGrounded: () => boolean;
}

function groundNormalY(controller: GroundQuery): number {
  if (!controller.computedGrounded()) return 1;
  let best = 0;
  for (let i = 0; i < controller.numComputedCollisions(); i++) {
    const c = controller.computedCollision(i);
    if (c === null) continue;
    best = Math.max(best, Math.abs(c.normal1.y));
  }
  return best === 0 ? 1 : best;
}

export function PlayerController({
  input,
  spawn,
  waterLevel,
  pace,
  onFrame,
}: PlayerControllerProps): React.ReactElement {
  const body = useRef<RapierRigidBody>(null);
  const { world, rapier } = useRapier();
  const settings = useGame((s) => s.save.settings);

  const poolRef = useRef<Pool | null>(null);
  poolRef.current ??= createPool(pace);

  const controllerRef = useRef<ReturnType<typeof world.createCharacterController> | null>(null);
  if (controllerRef.current === null) {
    const c = world.createCharacterController(0.02);
    c.enableAutostep(MOVEMENT.stepHeight, MOVEMENT.capsuleRadius * 0.6, true);
    c.enableSnapToGround(0.35);
    c.setMaxSlopeClimbAngle((MOVEMENT.maxSlopeDegrees * Math.PI) / 180);
    c.setMinSlopeSlideAngle((58 * Math.PI) / 180);
    c.setApplyImpulsesToDynamicBodies(true);
    c.setCharacterMass(70);
    controllerRef.current = c;
  }

  useEffect(() => {
    const controller = controllerRef.current;
    return () => {
      if (controller !== null) world.removeCharacterController(controller);
    };
  }, [world]);

  useEffect(() => {
    const rb = body.current;
    const pool = poolRef.current;
    if (rb === null || pool === null) return;
    rb.setTranslation({ x: spawn[0], y: spawn[1] + UP_OFFSET, z: spawn[2] }, true);
    playerRef.position.set(spawn[0], spawn[1], spawn[2]);
    pool.cameraState.focusX = spawn[0];
    pool.cameraState.focusY = spawn[1];
    pool.cameraState.focusZ = spawn[2];
  }, [spawn]);

  // The camera comes from the frame state rather than useThree: this loop
  // drives it imperatively, which is the whole job of a third-person camera
  // controller, and a hook return value is not ours to mutate.
  useFrame((state, rawDelta) => {
    const camera = state.camera;
    const rb = body.current;
    const pool = poolRef.current;
    const controller = controllerRef.current;
    if (rb === null || pool === null || controller === null) return;

    const dt = Math.min(rawDelta, 1 / 20);
    const { movement, cameraState, cameraOut, displacement, moveInput, environment } = pool;

    const frame = input.consume();
    applyLook(cameraState, frame.lookX, frame.lookY);

    // Gameplay asks for shake; the camera decides whether to give it. Under
    // reduced motion, stepCamera ignores it entirely.
    if (playerRef.shakeRequest > 0) {
      addShake(cameraState, playerRef.shakeRequest);
      playerRef.shakeRequest = 0;
    }

    // A catch puts the solver into its tumble, which is what makes the
    // recovery read as comic rather than punishing.
    if (playerRef.tumbleRemaining > 0 && movement.stance !== 'tumbling') {
      beginTumble(movement, playerRef.tumbleRemaining);
    }

    const translation = rb.translation();
    const feetY = translation.y - UP_OFFSET;

    /** Spring-arm collision: how far back can the camera go before it clips? */
    const traceArm = (
      fromX: number,
      fromY: number,
      fromZ: number,
      dirX: number,
      dirY: number,
      dirZ: number,
      maxDistance: number,
    ): number => {
      pool.rayOrigin.set(fromX, fromY, fromZ);
      pool.rayDir.set(dirX, dirY, dirZ);
      const ray = new rapier.Ray(pool.rayOrigin, pool.rayDir);
      const hit = world.castRay(ray, maxDistance, true, undefined, undefined, undefined, rb);
      return hit === null ? maxDistance : hit.timeOfImpact;
    };

    const probeCeiling = (): boolean => {
      pool.rayOrigin.set(translation.x, translation.y, translation.z);
      pool.rayDir.set(0, 1, 0);
      const ray = new rapier.Ray(pool.rayOrigin, pool.rayDir);
      const hit = world.castRay(
        ray,
        MOVEMENT.capsuleHeight * 0.75,
        true,
        undefined,
        undefined,
        undefined,
        rb,
      );
      return hit !== null;
    };

    /**
     * Look for a ledge directly ahead inside the vaultable band.
     *
     * Two rays: one at shin height to confirm something is there, one
     * straight down from just past it to find its top. Cheap, and good enough
     * that the vault only ever offers itself on things you can actually climb.
     */
    const probeVault = (): number | null => {
      if (Math.hypot(frame.moveX, frame.moveY) < 0.3) return null;

      const sin = Math.sin(cameraState.yaw);
      const cos = Math.cos(cameraState.yaw);
      let dx = frame.moveX * cos - frame.moveY * sin;
      let dz = frame.moveX * sin + frame.moveY * cos;
      const len = Math.hypot(dx, dz) || 1;
      dx /= len;
      dz /= len;

      pool.rayOrigin.set(translation.x, feetY + 0.35, translation.z);
      pool.rayDir.set(dx, 0, dz);
      const forward = new rapier.Ray(pool.rayOrigin, pool.rayDir);
      const wall = world.castRay(
        forward,
        MOVEMENT.capsuleRadius + 0.55,
        true,
        undefined,
        undefined,
        undefined,
        rb,
      );
      if (wall === null) return null;

      const probeDistance = wall.timeOfImpact + 0.3;
      pool.rayOrigin.set(
        translation.x + dx * probeDistance,
        feetY + MOVEMENT.vaultMaxHeight + 0.6,
        translation.z + dz * probeDistance,
      );
      pool.rayDir.set(0, -1, 0);
      const down = new rapier.Ray(pool.rayOrigin, pool.rayDir);
      const top = world.castRay(
        down,
        MOVEMENT.vaultMaxHeight + 0.9,
        true,
        undefined,
        undefined,
        undefined,
        rb,
      );
      if (top === null) return null;

      const height = pool.rayOrigin.y - top.timeOfImpact - feetY;
      return height > 0 ? height : null;
    };

    // --- environment probes ------------------------------------------------
    environment.pace = pace;
    environment.waterDepth = waterLevel === null ? 0 : Math.max(0, waterLevel - feetY);
    environment.grounded = controller.computedGrounded();
    environment.groundNormalY = groundNormalY(controller);
    environment.ceilingBlocked = probeCeiling();
    environment.vaultHeight = probeVault();

    // --- solve ---------------------------------------------------------------
    moveInput.moveX = frame.moveX;
    moveInput.moveY = frame.moveY;
    moveInput.cameraYaw = cameraState.yaw;
    moveInput.sprintHeld = frame.sprint;
    // Written by the loop each frame: how close the nearest pursuer is.
    moveInput.pursuitPressure = playerRef.pursuitPressure;
    moveInput.crouchHeld = frame.crouch;
    moveInput.jumpPressed = frame.jumpPressed;
    moveInput.dt = dt;

    stepMovement(movement, moveInput, environment, displacement);

    // --- collide and slide ---------------------------------------------------
    pool.desired.set(displacement.x, displacement.y, displacement.z);
    controller.computeColliderMovement(rb.collider(0), pool.desired);
    const corrected = controller.computedMovement();

    // If the solver wanted to move and the controller returned nothing, we are
    // against a wall. Zero that axis so we don't build a phantom charge that
    // fires the moment the wall ends.
    if (Math.abs(displacement.x) > 1e-5 && Math.abs(corrected.x) < 1e-6) movement.velocityX = 0;
    if (Math.abs(displacement.z) > 1e-5 && Math.abs(corrected.z) < 1e-6) movement.velocityZ = 0;
    if (displacement.y < -1e-5 && corrected.y > displacement.y + 1e-6) movement.velocityY = 0;

    pool.next.set(
      translation.x + corrected.x,
      translation.y + corrected.y,
      translation.z + corrected.z,
    );
    rb.setNextKinematicTranslation(pool.next);

    // --- publish runtime -----------------------------------------------------
    playerRef.position.set(pool.next.x, pool.next.y - UP_OFFSET, pool.next.z);
    playerRef.facing = movement.facing;
    playerRef.gait = movement.gait;
    playerRef.stance = movement.stance;
    playerRef.stamina = movement.stamina;
    playerRef.speed = Math.hypot(movement.velocityX, movement.velocityZ);
    playerRef.grounded = movement.grounded;
    playerRef.inWater = environment.waterDepth > 0.15;
    playerRef.noiseRadius = noiseRadiusFor(movement.gait, playerRef.inWater);
    playerRef.pace = pace;
    playerRef.cameraYaw = cameraState.yaw;
    playerRef.justLanded = movement.justLanded;
    playerRef.justJumped = movement.justJumped;
    playerRef.justVaulted = movement.justVaulted;
    playerRef.justSlid = movement.justSlid;
    playerRef.interactPressed = frame.interactPressed;
    playerRef.toolPressed = frame.toolPressed;
    playerRef.state = movement;

    // --- camera ---------------------------------------------------------------
    pool.cameraOptions.reducedMotion = settings.reducedMotion;
    pool.cameraOptions.shakeEnabled = settings.cameraShake;
    const target: CameraTarget = {
      x: playerRef.position.x,
      y: playerRef.position.y,
      z: playerRef.position.z,
      sprinting: movement.gait === 'sprint',
      crouching: movement.stance === 'crouched' || movement.stance === 'sliding',
      pursuitPressure: playerRef.pursuitPressure,
    };
    stepCamera(cameraState, target, pool.cameraOptions, traceArm, dt, cameraOut);

    camera.position.set(cameraOut.posX, cameraOut.posY, cameraOut.posZ);
    camera.lookAt(cameraOut.lookX, cameraOut.lookY, cameraOut.lookZ);
    if (camera instanceof PerspectiveCamera && Math.abs(camera.fov - cameraOut.fov) > 0.01) {
      camera.fov = cameraOut.fov;
      camera.updateProjectionMatrix();
    }

    onFrame?.(playerRef, dt);
  });

  return (
    <RigidBody
      ref={body}
      type="kinematicPosition"
      colliders={false}
      position={[spawn[0], spawn[1] + UP_OFFSET, spawn[2]]}
      enabledRotations={[false, false, false]}
      userData={{ tag: 'player' }}
    >
      <CapsuleCollider args={[MOVEMENT.capsuleHeight / 2, MOVEMENT.capsuleRadius]} />
    </RigidBody>
  );
}
