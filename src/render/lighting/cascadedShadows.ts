/**
 * Cascaded shadow maps, written against three 0.185 directly.
 *
 * Why not three-stdlib's CSM: version 2.36.1 is broken twice over against
 * this three. Its published bundle mangled `get lights_pars_begin()` into a
 * method, so it assigns `undefined` over three's chunk and every lit material
 * stops compiling; and its `lights_fragment_begin` replacement is written
 * against the old `GeometricContext geometry;` API that three removed. Fixing
 * both would mean maintaining a fork of a core lighting chunk with no test
 * coverage. This is a few hundred lines I own, understand, and can pin -- and
 * three's version is exact-pinned, so the one string replacement below is
 * stable.
 *
 * How it works: N directional lights share a direction and colour, each with
 * its own orthographic shadow camera fitted to one slice of the view frustum.
 * The injected shader gives each fragment to exactly one cascade by view
 * depth, so the light is applied once and the shadow comes from the cascade
 * with the right texel density for that distance.
 */

import {
  DirectionalLight,
  Matrix4,
  ShaderChunk,
  Vector3,
  type Camera,
  type Material,
  type Object3D,
  type PerspectiveCamera,
  type IUniform,
} from 'three';

export interface CascadeOptions {
  cascades: number;
  shadowMapSize: number;
  /** Furthest distance that receives a shadow, in metres. */
  maxDistance: number;
  /** Direction light travels, i.e. from the sun towards the ground. */
  direction: Vector3;
  colour: number | string;
  intensity: number;
  /** How far behind the slice the shadow camera sits. */
  lightMargin: number;
  /**
   * Blend between uniform and logarithmic splits. 0 is uniform (wastes texels
   * near the camera), 1 is logarithmic (starves the far cascade). Practical
   * schemes sit around the middle.
   */
  lambda: number;
  bias: number;
  normalBias: number;
  radius: number;
}

interface PatchedMaterial {
  material: Material;
  cascadeUniform: IUniform<Float32Array> | null;
}

/**
 * The one replacement we make in three's lighting chunk.
 *
 * This is the exact directional-light block from three 0.185's
 * `lights_fragment_begin`. If a three upgrade changes it, `patchMaterial`
 * throws rather than silently producing a scene lit three times over.
 */
const DIR_LIGHT_BLOCK = `#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )
	DirectionalLight directionalLight;
	#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {
		directionalLight = directionalLights[ i ];
		getDirectionalLightInfo( directionalLight, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )
		directionalLightShadow = directionalLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif`;

/**
 * The same block, with cascade ownership.
 *
 * `csmDepth` is linear view depth. Each cascade owns a half-open slice, so
 * exactly one of them applies the light -- no double-lighting at a boundary,
 * and no gap between slices. The last cascade's far value is pushed out to
 * infinity by the CPU side, so anything past the shadow distance is still lit,
 * just unshadowed.
 */
const CSM_DIR_LIGHT_BLOCK = `#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )
	DirectionalLight directionalLight;
	#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLightShadow;
	#endif
	// Every local the loop body uses has to be declared out here.
	//
	// three's #pragma unroll_loop_start expands the body N times into the
	// *same* scope -- it strips the for wrapper rather than emitting N braced
	// blocks. Declaring inside the body compiles fine with one cascade and
	// fails with a redefinition error at two or more, which is exactly the
	// kind of bug that hides behind a quality preset. three's own code follows
	// this convention for the same reason: see the DirectionalLight
	// declaration above.
	float csmDepth = - vViewPosition.z;
	float csmOwns;
	vec2 csmRange;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {
		directionalLight = directionalLights[ i ];
		getDirectionalLightInfo( directionalLight, directLight );

		csmOwns = 1.0;
		#if ( UNROLLED_LOOP_INDEX < CSM_CASCADES )
			csmRange = CSM_cascades[ UNROLLED_LOOP_INDEX ];
			csmOwns = step( csmRange.x, csmDepth ) * step( csmDepth, csmRange.y );
		#endif

		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )
		directionalLightShadow = directionalLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
		#endif

		directLight.color *= csmOwns;
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif`;

const CSM_UNIFORM_DECL = `
#if defined( USE_CSM ) && defined( CSM_CASCADES )
uniform vec2 CSM_cascades[ CSM_CASCADES ];
#endif
`;

/**
 * three's lighting chunk with our directional block swapped in, expanded once
 * at module load.
 *
 * `onBeforeCompile` runs *before* three resolves `#include` directives, so a
 * material's `fragmentShader` at that point still contains the literal
 * `#include <lights_fragment_begin>` and not its contents. Patching per
 * material therefore means substituting the whole expanded chunk for the
 * include, which is what this constant is.
 *
 * The alternative -- what three-stdlib does -- is to overwrite
 * `ShaderChunk.lights_fragment_begin` globally. That reaches every material
 * in the process, including ones we never asked to patch, and it is how their
 * version manages to break the entire renderer from one bad assignment. Doing
 * it per material costs one string and touches nothing else.
 *
 * Failing here fails at import, loudly, rather than rendering a scene lit once
 * per cascade.
 */
const CSM_LIGHTS_FRAGMENT_BEGIN = (() => {
  const chunk = ShaderChunk.lights_fragment_begin;
  if (!chunk.includes(DIR_LIGHT_BLOCK)) {
    throw new Error(
      "CascadedShadowMap: three's lights_fragment_begin directional block no " +
        'longer matches the text this patch expects -- three has been upgraded. ' +
        'Update DIR_LIGHT_BLOCK in cascadedShadows.ts.',
    );
  }
  return chunk.replace(DIR_LIGHT_BLOCK, CSM_DIR_LIGHT_BLOCK);
})();

export class CascadedShadowMap {
  readonly lights: DirectionalLight[] = [];
  readonly root: Object3D;

  private readonly options: CascadeOptions;
  private readonly patched: PatchedMaterial[] = [];
  private readonly known = new WeakSet<Material>();
  /** Packed [near, far] per cascade, in view-space metres. */
  private readonly ranges: Float32Array;
  private readonly splits: number[] = [];

  // Scratch. Fitting runs every frame for every cascade.
  private readonly lightView = new Matrix4();
  private readonly lightToWorld = new Matrix4();
  private readonly corner = new Vector3();
  private readonly centre = new Vector3();
  private readonly up = new Vector3(0, 1, 0);
  private readonly origin = new Vector3();
  private readonly target = new Vector3();

  constructor(root: Object3D, options: CascadeOptions) {
    this.root = root;
    this.options = options;
    this.ranges = new Float32Array(options.cascades * 2);

    // Direction is nearly straight down for a high sun; the usual up vector
    // would be degenerate, so lean it sideways.
    if (Math.abs(options.direction.clone().normalize().y) > 0.98) this.up.set(0, 0, 1);

    for (let i = 0; i < options.cascades; i++) {
      const light = new DirectionalLight(options.colour, options.intensity);
      light.castShadow = true;
      light.shadow.mapSize.setScalar(options.shadowMapSize);
      light.shadow.bias = options.bias;
      light.shadow.normalBias = options.normalBias;
      light.shadow.radius = options.radius;
      light.shadow.camera.near = 0.5;
      light.shadow.camera.far = options.maxDistance * 2 + options.lightMargin * 2;
      light.matrixAutoUpdate = true;
      root.add(light);
      root.add(light.target);
      this.lights.push(light);
    }
  }

  /**
   * Refit every cascade to the current view. Call once per frame, after the
   * camera has been moved.
   */
  update(camera: Camera): void {
    const perspective = camera as PerspectiveCamera;
    if (perspective.isPerspectiveCamera !== true) return;

    this.computeSplits(perspective);

    const direction = this.options.direction.clone().normalize();

    for (let i = 0; i < this.options.cascades; i++) {
      const near = this.splits[i]!;
      const far = this.splits[i + 1]!;
      const light = this.lights[i]!;

      /*
       * Fit one cascade.
       *
       * Build a light-space basis, take the AABB of this frustum slice's eight
       * corners in that space, then place the light at the box's centre pushed
       * back along its own direction. The projection is symmetric about that
       * centre, which is the part an earlier version got wrong: it measured
       * the box relative to the world origin and then moved the light
       * somewhere else, so every cascade's shadow frustum pointed at empty
       * space and nothing cast a shadow at all.
       */
      this.origin.set(0, 0, 0);
      this.target.copy(direction);
      this.lightView.lookAt(this.origin, this.target, this.up);
      this.lightView.invert();

      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;

      for (let c = 0; c < 8; c++) {
        this.frustumCorner(perspective, near, far, c, this.corner);
        this.corner.applyMatrix4(this.lightView);
        minX = Math.min(minX, this.corner.x);
        maxX = Math.max(maxX, this.corner.x);
        minY = Math.min(minY, this.corner.y);
        maxY = Math.max(maxY, this.corner.y);
        minZ = Math.min(minZ, this.corner.z);
        maxZ = Math.max(maxZ, this.corner.z);
      }

      let halfWidth = (maxX - minX) / 2;
      let halfHeight = (maxY - minY) / 2;
      // Square the box so the projection does not change shape as the player
      // turns, which would make shadow resolution pulse with the camera.
      const half = Math.max(halfWidth, halfHeight);
      halfWidth = half;
      halfHeight = half;

      /*
       * Texel snapping.
       *
       * Without this the box slides continuously as the player walks and every
       * shadow edge crawls -- far more distracting than a slightly larger box.
       * Quantising the light-space centre to whole shadow-map texels makes the
       * projection move in discrete texel steps instead.
       */
      const worldUnitsPerTexel = (half * 2) / this.options.shadowMapSize;
      const centreX = Math.round((minX + maxX) / 2 / worldUnitsPerTexel) * worldUnitsPerTexel;
      const centreY = Math.round((minY + maxY) / 2 / worldUnitsPerTexel) * worldUnitsPerTexel;
      const centreZ = (minZ + maxZ) / 2;

      // Back to world space, so the light can be placed there.
      this.lightToWorld.copy(this.lightView).invert();
      this.centre.set(centreX, centreY, centreZ).applyMatrix4(this.lightToWorld);

      const depth = maxZ - minZ;
      const back = depth / 2 + this.options.lightMargin;

      const shadowCamera = light.shadow.camera;
      shadowCamera.left = -halfWidth;
      shadowCamera.right = halfWidth;
      shadowCamera.bottom = -halfHeight;
      shadowCamera.top = halfHeight;
      shadowCamera.near = 0.5;
      // Deep enough to catch casters standing behind the visible slice -- a
      // tree just off screen still has to drop its shadow into it.
      shadowCamera.far = back + depth / 2 + this.options.lightMargin;
      shadowCamera.updateProjectionMatrix();

      light.position.copy(this.centre).addScaledVector(direction, -back);
      light.target.position.copy(this.centre);
      light.target.updateMatrixWorld();
      light.updateMatrixWorld();

      this.ranges[i * 2] = near;
      // The last cascade owns everything beyond it, so distant geometry stays
      // lit (just unshadowed) rather than falling into darkness.
      this.ranges[i * 2 + 1] = i === this.options.cascades - 1 ? 1e6 : far;
    }

    for (const entry of this.patched) {
      if (entry.cascadeUniform !== null) entry.cascadeUniform.value = this.ranges;
    }
  }

  /**
   * Practical split scheme.
   *
   * Uniform splits waste resolution near the camera, where the player is
   * looking; logarithmic splits starve the far cascade and make distant
   * shadows blocky. Blending the two is what everyone actually ships.
   */
  private computeSplits(camera: PerspectiveCamera): void {
    const near = camera.near;
    const far = Math.min(camera.far, this.options.maxDistance);
    const n = this.options.cascades;
    this.splits.length = 0;
    this.splits.push(near);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const logSplit = near * Math.pow(far / near, t);
      const uniformSplit = near + (far - near) * t;
      this.splits.push(this.options.lambda * logSplit + (1 - this.options.lambda) * uniformSplit);
    }
    this.splits.push(far);
  }

  /** One of the eight corners of the view frustum slice [near, far]. */
  private frustumCorner(
    camera: PerspectiveCamera,
    near: number,
    far: number,
    index: number,
    out: Vector3,
  ): void {
    const isFar = index >= 4;
    const distance = isFar ? far : near;
    const halfHeight = Math.tan((camera.fov * Math.PI) / 360) * distance;
    const halfWidth = halfHeight * camera.aspect;
    const signX = index % 2 === 0 ? -1 : 1;
    const signY = Math.floor(index / 2) % 2 === 0 ? -1 : 1;
    out.set(signX * halfWidth, signY * halfHeight, -distance);
    out.applyMatrix4(camera.matrixWorld);
  }

  /**
   * Teach a material about the cascades.
   *
   * Idempotent per material, and loud on failure: if three's lighting chunk
   * ever changes shape, this throws instead of quietly producing a scene lit
   * once per cascade.
   */
  setupMaterial(material: Material): void {
    if (this.known.has(material)) return;
    this.known.add(material);

    const withDefines = material as Material & { defines?: Record<string, unknown> };
    withDefines.defines = withDefines.defines ?? {};
    withDefines.defines.USE_CSM = 1;
    withDefines.defines.CSM_CASCADES = this.options.cascades;

    const previousCompile = material.onBeforeCompile.bind(material);
    const entry: PatchedMaterial = { material, cascadeUniform: null };

    material.onBeforeCompile = (shader, renderer) => {
      previousCompile(shader, renderer);

      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${CSM_UNIFORM_DECL}`)
        .replace('#include <lights_fragment_begin>', CSM_LIGHTS_FRAGMENT_BEGIN);

      const uniform: IUniform<Float32Array> = { value: this.ranges };
      shader.uniforms.CSM_cascades = uniform;
      entry.cascadeUniform = uniform;
    };

    const cacheKey = material.customProgramCacheKey.bind(material);
    material.customProgramCacheKey = () => `csm${this.options.cascades}-${cacheKey()}`;
    material.needsUpdate = true;

    this.patched.push(entry);
  }

  setColour(colour: number | string, intensity: number): void {
    for (const light of this.lights) {
      light.color.set(colour);
      light.intensity = intensity;
    }
  }

  dispose(): void {
    for (const light of this.lights) {
      light.shadow.dispose();
      this.root.remove(light);
      this.root.remove(light.target);
    }
    this.lights.length = 0;
    this.patched.length = 0;
  }
}
