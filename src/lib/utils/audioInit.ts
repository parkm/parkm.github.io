// TODO: Maybe make this auto init if browser supports it and only show banner for iOS
/**
 * iOS Safari Audio Initialization Utility
 *
 * iOS Safari requires user interaction before Web Audio API will work.
 * Additionally, an HTML5 audio element must be played first to "unlock" Web Audio.
 *
 * References:
 * - https://github.com/feross/unmute-ios-audio
 * - https://bugs.webkit.org/show_bug.cgi?id=237878
 *
 * Usage:
 * ```ts
 * import { initAudio } from '@/lib/utils/audioInit';
 *
 * const audioContext = await initAudio();
 * // Now you can use audioContext for Web Audio API
 * ```
 */
export async function initAudio(): Promise<AudioContext> {
  return new Promise((resolve, reject) => {
    // Create banner HTML
    const banner = document.createElement("div");
    banner.id = "audio-init-banner";
    banner.className =
      "fixed top-0 left-0 right-0 z-50 transform -translate-y-full transition-transform duration-300";
    banner.innerHTML = `
      <div class="bg-white/95 backdrop-blur-md shadow-lg border-b border-slate-200/80 dark:bg-slate-900/95 dark:border-slate-700/80">
        <div class="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-6">
          <div class="flex-1">
            <p class="text-sm font-medium text-slate-700 dark:text-slate-200" id="audio-status">
              This app requires audio. Would you like to enable audio playback?
            </p>
          </div>
          <div class="flex items-center gap-2 flex-shrink-0">
            <button
              id="audio-cancel-btn"
              class="px-4 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md active:scale-95 transition-all"
            >
              No thanks
            </button>
            <button
              id="audio-init-btn"
              class="px-5 py-1.5 text-sm font-semibold bg-gradient-to-r from-emerald-600 to-emerald-500 text-white rounded-md hover:from-emerald-500 hover:to-emerald-400 active:scale-95 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Enable audio
            </button>
          </div>
        </div>
      </div>
    `;

    // Inject into DOM
    document.body.appendChild(banner);

    // Slide down animation
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        banner.classList.remove("-translate-y-full");
      });
    });

    const statusEl = document.getElementById("audio-status")!;
    const btnEl = document.getElementById(
      "audio-init-btn",
    ) as HTMLButtonElement;
    const cancelBtn = document.getElementById(
      "audio-cancel-btn",
    ) as HTMLButtonElement;

    // Create hidden HTML5 audio element for iOS unlock
    const unlockAudio = document.createElement("audio");
    unlockAudio.style.display = "none";
    unlockAudio.innerHTML =
      '<source src="data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=" type="audio/wav">';
    document.body.appendChild(unlockAudio);

    let audioContext: AudioContext | null = null;

    const cleanup = () => {
      // Slide up animation
      banner.classList.add("-translate-y-full");
      // Remove from DOM after animation
      setTimeout(() => {
        banner.remove();
        unlockAudio.remove();
      }, 300);
    };

    const initWebAudio = async () => {
      try {
        btnEl.disabled = true;
        cancelBtn.disabled = true;
        statusEl.textContent = "Initializing audio...";

        // iOS Fix: Play HTML5 audio first to unlock Web Audio API
        unlockAudio.volume = 0.01;
        unlockAudio.play().catch(() => {});

        // Wait for HTML5 audio unlock
        await new Promise((resolve) => setTimeout(resolve, 200));

        statusEl.textContent = "Creating audio context...";

        const AudioContextConstructor =
          window.AudioContext ||
          (window as Window & { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;

        if (!AudioContextConstructor) {
          throw new Error("AudioContext not supported");
        }

        audioContext = new AudioContextConstructor();

        // iOS requires AudioContext to be resumed on user gesture
        if (audioContext.state === "suspended") {
          statusEl.textContent = "Resuming audio context...";

          // Add 5 second timeout to resume operation
          const resumePromise = audioContext.resume();
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error("Resume timed out after 3 seconds")),
              3000,
            ),
          );

          await Promise.race([resumePromise, timeoutPromise]);
        }

        statusEl.textContent = "✓ Audio enabled successfully!";

        // Setup visibility change handler for iOS
        // iOS suspends AudioContext when page is backgrounded
        document.addEventListener("visibilitychange", () => {
          if (
            document.visibilityState === "visible" &&
            audioContext &&
            audioContext.state === "suspended"
          ) {
            audioContext.resume();
          }
        });

        // Cleanup and resolve
        cleanup();
        resolve(audioContext);
      } catch (error) {
        btnEl.disabled = false;
        cancelBtn.disabled = false;
        statusEl.textContent = `✗ Error: ${error instanceof Error ? error.message : "Unknown error"}`;
        btnEl.textContent = "Retry";

        // Store error for rejection if user closes without retry
        const errorToReject = error;

        // Allow retry
        btnEl.onclick = () => initWebAudio();

        // Reject if banner is removed without success
        setTimeout(() => {
          if (!audioContext) {
            reject(errorToReject);
          }
        }, 100);
      }
    };

    // Handle Enable audio button click
    btnEl.onclick = () => initWebAudio();

    // Handle No thanks button click
    cancelBtn.onclick = () => {
      cleanup();
      reject(new Error("User declined audio permission"));
    };
  });
}
