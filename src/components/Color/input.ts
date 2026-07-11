// Pointer, touch and wheel input: steers the base hue (two-finger drag / shift
// drag / trackpad scroll) and collects gems by swiping. Drives the wave engine
// and the game through their public surfaces.

import { engine, addRipple, isHueLocked } from "./waves";
import { game } from "./game";

let lastMouseX = -1;
let lastMouseY = -1;
let mouseMoveThrottle = 0;

let isColorControlMode = false;
let colorControlStartX = 0;
let colorControlStartY = 0;
let colorControlStartHue = 0;

// Ignore collection when the gesture starts on a game control (spell bar etc).
function onUI(e: Event): boolean {
  const t = e.target as HTMLElement | null;
  return !!t?.closest?.("#gameToggle, #menuToggle, #menu");
}

function handleMove(e: MouseEvent | TouchEvent): void {
  let clientX: number;
  let clientY: number;

  if (e instanceof TouchEvent && e.touches.length > 0) {
    clientX = e.touches[0].clientX;
    clientY = e.touches[0].clientY;
  } else if (e instanceof MouseEvent) {
    clientX = e.clientX;
    clientY = e.clientY;
  } else {
    return;
  }

  if (game.active && !onUI(e)) {
    const singleFinger = !(e instanceof TouchEvent) || e.touches.length <= 1;
    if (singleFinger) {
      game.setPointer(clientX, clientY);
      game.collectAt(clientX, clientY);
    }
  }

  addRipple(clientX, clientY);
}

function handleMoveThrottled(e: MouseEvent | TouchEvent): void {
  let clientX: number;
  let clientY: number;
  let isTwoFingerTouch = false;

  if (e instanceof TouchEvent) {
    if (e.touches.length === 2) {
      isTwoFingerTouch = true;
      clientX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      clientY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
    } else if (e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      return;
    }
  } else if (e instanceof MouseEvent) {
    clientX = e.clientX;
    clientY = e.clientY;
  } else {
    return;
  }

  const isShiftPressed = e instanceof MouseEvent && e.shiftKey;
  const shouldControlColor = isShiftPressed || isTwoFingerTouch;

  if (shouldControlColor) {
    if (!isColorControlMode) {
      isColorControlMode = true;
      colorControlStartX = clientX;
      colorControlStartY = clientY;
      colorControlStartHue = engine.baseHue;
    }

    if (isHueLocked()) {
      // A big match is holding the hue for a beat — swallow steering and
      // re-anchor so the drag resumes smoothly from here once it releases.
      colorControlStartX = clientX;
      colorControlStartHue = engine.baseHue;
    } else {
      const deltaX = clientX - colorControlStartX;
      const normalizedDeltaX = deltaX / window.innerWidth;

      engine.baseHue = (colorControlStartHue + normalizedDeltaX * 360) % 360;
      if (engine.baseHue < 0) engine.baseHue += 360;

      const deltaY = clientY - colorControlStartY;
      const normalizedDeltaY = deltaY / window.innerHeight;

      engine.baseHueVelocity = Math.max(
        0,
        Math.min(0.5, 0.12 + normalizedDeltaY * 0.4),
      );
    }

    const dist = Math.sqrt(
      Math.pow(clientX - lastMouseX, 2) + Math.pow(clientY - lastMouseY, 2),
    );

    const now = Date.now();
    if (dist > 8 && now - mouseMoveThrottle > 40) {
      addRipple(clientX, clientY);
      lastMouseX = clientX;
      lastMouseY = clientY;
      mouseMoveThrottle = now;
    }
  } else {
    if (isColorControlMode) {
      isColorControlMode = false;
    }

    // Swipe to collect gems when the color is in range
    if (game.active && !onUI(e)) {
      game.setPointer(clientX, clientY);
      game.collectAt(clientX, clientY);
    }

    const dist = Math.sqrt(
      Math.pow(clientX - lastMouseX, 2) + Math.pow(clientY - lastMouseY, 2),
    );

    const now = Date.now();
    const minDist = 8;
    const throttleTime = 40;

    if (dist > minDist && now - mouseMoveThrottle > throttleTime) {
      addRipple(clientX, clientY);
      lastMouseX = clientX;
      lastMouseY = clientY;
      mouseMoveThrottle = now;
    }
  }
}

function handleKeyUp(e: KeyboardEvent): void {
  if (e.key === "Shift" && isColorControlMode) {
    isColorControlMode = false;
  }
}

function handleTouchEnd(e: TouchEvent): void {
  if (e.touches.length < 2 && isColorControlMode) {
    isColorControlMode = false;
  }
}

// Trackpad two-finger scroll (and mouse wheel) steers the hue —
// the desktop equivalent of the two-finger touch drag.
function handleWheel(e: WheelEvent): void {
  if (onUI(e)) return;
  e.preventDefault();
  if (!isHueLocked()) {
    const delta =
      Math.abs(e.deltaX) >= Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    engine.baseHue = (engine.baseHue - delta * 0.3) % 360;
    if (engine.baseHue < 0) engine.baseHue += 360;
  }

  const now = Date.now();
  if (now - mouseMoveThrottle > 40) {
    addRipple(e.clientX, e.clientY);
    mouseMoveThrottle = now;
  }
}

export function initInput(): void {
  window.addEventListener("mousemove", handleMoveThrottled);
  window.addEventListener("click", handleMove);
  window.addEventListener("wheel", handleWheel, { passive: false });
  window.addEventListener("touchmove", handleMoveThrottled, { passive: true });
  window.addEventListener("touchstart", handleMove, { passive: true });
  window.addEventListener("touchend", handleTouchEnd, { passive: true });
  window.addEventListener("keyup", handleKeyUp);
}
