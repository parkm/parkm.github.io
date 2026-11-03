/**
 * One requestAnimationFrame loop shared by everything that animates with
 * playback (playheads, clip progress). Callbacks write to the DOM directly
 * instead of going through React state.
 */
const callbacks = new Set<() => void>();
let raf = 0;

function loop() {
  callbacks.forEach((cb) => cb());
  raf = callbacks.size ? requestAnimationFrame(loop) : 0;
}

export function onFrame(cb: () => void) {
  callbacks.add(cb);
  if (!raf) raf = requestAnimationFrame(loop);
  return () => {
    callbacks.delete(cb);
  };
}
