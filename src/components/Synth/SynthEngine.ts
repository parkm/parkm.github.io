import { PRESETS } from "./presets";
import { createMasterChain, type MasterChain } from "./MasterChain";

export type SynthEngine = {
  triggerAttack: (note: string, time?: number, vel?: number) => void;
  triggerRelease: (note: string) => void;
  releaseAll: () => void;
  dispose: () => void;
  changePreset: (presetId: string) => void;
  getMasterChain: () => MasterChain;
};

export function createSynthEngine(): SynthEngine {
  let currentChain: ReturnType<(typeof PRESETS)[string]["createChain"]> | null =
    null;
  const masterChain = createMasterChain();

  const initializePreset = (presetId: string) => {
    currentChain?.dispose();
    currentChain = null;

    const preset = PRESETS[presetId];
    if (!preset) {
      throw new Error(`Preset ${presetId} not found`);
    }

    currentChain = preset.createChain(masterChain.input);
  };

  const triggerAttack = (note: string, _time?: number, vel = 0.8) => {
    if (!currentChain) return;
    currentChain.instrument.triggerAttack(note, undefined, vel);
  };

  const triggerRelease = (note: string) => {
    if (!currentChain) return;
    currentChain.instrument.triggerRelease(note);
  };

  const releaseAll = () => {
    if (!currentChain) return;
    currentChain.instrument.releaseAll();
  };

  const changePreset = (presetId: string) => {
    releaseAll();
    initializePreset(presetId);
  };

  const dispose = () => {
    currentChain?.dispose();
    currentChain = null;
    masterChain.dispose();
  };

  const getMasterChain = () => masterChain;

  return {
    triggerAttack,
    triggerRelease,
    releaseAll,
    dispose,
    changePreset,
    getMasterChain,
  };
}
