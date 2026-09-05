import type { Plugin } from 'vite';

/**
 * Hoist Rapier's WASM out of its JavaScript bundle.
 *
 * `@dimforge/rapier3d-compat` inlines its 1.5MB WASM binary as a base64
 * string literal. Base64 costs a flat 33% before compression and gzip cannot
 * win most of that back, so the shipped chunk is roughly twice the size it
 * needs to be -- around 450KB of pure encoding overhead on the critical path
 * to first playable.
 *
 * The package already ships the real `.wasm` alongside the JS. This rewrites
 * the loader to fetch that file as a normal Vite asset instead of decoding
 * the literal. Same bytes, half the transfer, and the browser gets to cache
 * the binary separately from the code.
 *
 * If the upstream bundle ever changes shape the pattern stops matching, and
 * this fails the build rather than silently regressing the budget.
 */
export function rapierWasmPlugin(): Plugin {
  // Relative, not a package specifier: the package's `exports` field does not
  // publish the .wasm, but a relative import from inside the package resolves
  // fine because it never goes through exports resolution.
  const WASM_SPECIFIER = './rapier_wasm3d_bg.wasm?url';
  // `<ident>.toByteArray("AGFzbQ...").buffer` -- the base64 decode inside init().
  const PATTERN = /[A-Za-z_$][\w$]*\.toByteArray\("AGFzbQ[A-Za-z0-9+/=]+"\)\.buffer/;

  let matched = false;

  return {
    name: 'egg-heist:rapier-wasm',
    enforce: 'pre',
    apply: 'build',

    transform(code, id) {
      if (!id.includes('rapier3d-compat') || !id.includes('rapier.mjs')) return null;
      const match = PATTERN.exec(code);
      if (match === null) return null;
      matched = true;

      // The call site sits inside a generator driven by a promise runner, so
      // the two awaits have to be spelled as yields.
      const fetched = '(yield (yield fetch(__EGG_RAPIER_WASM_URL)).arrayBuffer())';
      const rewritten = code.replace(match[0], fetched);
      return {
        code: `import __EGG_RAPIER_WASM_URL from ${JSON.stringify(WASM_SPECIFIER)};\n${rewritten}`,
        map: null,
      };
    },

    buildEnd() {
      if (!matched) {
        this.error(
          'rapier-wasm: could not find the inlined base64 WASM in rapier3d-compat. ' +
            'The upstream bundle has changed shape. Update the pattern in ' +
            'scripts/rapierWasmPlugin.ts or remove the plugin -- do not ship ' +
            'the doubled payload silently.',
        );
      }
    },
  };
}
