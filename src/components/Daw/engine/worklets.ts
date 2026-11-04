import { PROCESSORS_SOURCE } from "./worklet/processors";

/**
 * AudioWorklet processors: DSP the native nodes can't do (sample-by-sample
 * gain computers). They're written in worklet/processors.ts; their source
 * text is loaded from a Blob URL so it works the same live, offline and in
 * tests, with no bundler config.
 *
 * A context needs the module loaded before it can create these nodes. The
 * session starts loading when it creates its context; offline renders await
 * it before building the graph. Devices built before it's ready wait with
 * whenWorklets().
 */

const loading = new WeakMap<BaseAudioContext, Promise<void>>();
const loaded = new WeakSet<BaseAudioContext>();

/** Load the processors into a context (once). Resolves when nodes can be made. */
export function loadWorklets(ctx: BaseAudioContext): Promise<void> {
  let promise = loading.get(ctx);
  if (!promise) {
    const url = URL.createObjectURL(
      new Blob([PROCESSORS_SOURCE], { type: "text/javascript" }),
    );
    promise = ctx.audioWorklet.addModule(url).then(
      () => {
        loaded.add(ctx);
        URL.revokeObjectURL(url);
      },
      (error: unknown) => {
        URL.revokeObjectURL(url);
        console.error("DAW: couldn't load audio worklets", error);
      },
    );
    loading.set(ctx, promise);
  }
  return promise;
}

/** Run `fn` as soon as the context's processors are loaded (now, if they are). */
export function whenWorklets(ctx: BaseAudioContext, fn: () => void) {
  if (loaded.has(ctx)) fn();
  else void loadWorklets(ctx).then(() => loaded.has(ctx) && fn());
}
