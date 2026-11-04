import { newId, updateTrack } from "./ops";
import type { Device, EffectDevice, EffectType, Id, Project } from "./types";

/**
 * Device chain edits. A chain is a track's devices (instrument first, then
 * effects in signal order) or, with the id MASTER, the master's effects.
 */

/** Chain id of the master's effects, used wherever a track id picks a chain. */
export const MASTER = "master";

export const chainOf = (doc: Project, chainId: Id): Device[] | undefined =>
  chainId === MASTER
    ? doc.masterDevices
    : doc.tracks.find((t) => t.id === chainId)?.devices;

function updateChain(
  doc: Project,
  chainId: Id,
  fn: (devices: Device[]) => Device[],
): Project {
  if (chainId === MASTER) {
    const next = fn(doc.masterDevices);
    return next === doc.masterDevices
      ? doc
      : { ...doc, masterDevices: next as EffectDevice[] };
  }
  return updateTrack(doc, chainId, (track) => {
    const next = fn(track.devices);
    return next === track.devices ? track : { ...track, devices: next };
  });
}

const isInstrument = (d: Device | undefined) => !!d && !("bypass" in d);

/** Index of the first device that can move or be removed (after any instrument). */
export const firstEffectIndex = (devices: Device[]) =>
  isInstrument(devices[0]) ? 1 : 0;

function updateDevice(
  doc: Project,
  chainId: Id,
  deviceId: Id,
  fn: (device: Device) => Device,
): Project {
  return updateChain(doc, chainId, (chain) => {
    let changed = false;
    const devices = chain.map((d) => {
      if (d.id !== deviceId) return d;
      const next = fn(d);
      if (next !== d) changed = true;
      return next;
    });
    return changed ? devices : chain;
  });
}

export const setDeviceParam = (
  doc: Project,
  chainId: Id,
  deviceId: Id,
  key: string,
  value: number,
) =>
  updateDevice(doc, chainId, deviceId, (d) =>
    d.type === "drumKit" || d.params[key] === value
      ? d
      : { ...d, params: { ...d.params, [key]: value } },
  );

/** Replace all params (loading a preset). */
export const setDeviceParams = (
  doc: Project,
  chainId: Id,
  deviceId: Id,
  params: Record<string, number>,
) =>
  updateDevice(doc, chainId, deviceId, (d) =>
    d.type === "drumKit" ? d : { ...d, params: { ...params } },
  );

export const toggleBypass = (doc: Project, chainId: Id, deviceId: Id) =>
  updateDevice(doc, chainId, deviceId, (d) =>
    "bypass" in d ? { ...d, bypass: !d.bypass } : d,
  );

/** Point an effect's sidechain at a track (or nothing). */
export const setSidechain = (
  doc: Project,
  chainId: Id,
  deviceId: Id,
  source: Id | null,
) =>
  updateDevice(doc, chainId, deviceId, (d) => {
    if (!("bypass" in d) || (d.sidechain ?? null) === source) return d;
    const { sidechain: _, ...rest } = d;
    return source ? { ...rest, sidechain: source } : rest;
  });

export const addEffect = (doc: Project, chainId: Id, type: EffectType) =>
  updateChain(doc, chainId, (devices) => [
    ...devices,
    { id: newId(), type, params: {}, bypass: false },
  ]);

/** Remove an effect; the instrument stays. */
export const removeDevice = (doc: Project, chainId: Id, deviceId: Id) =>
  updateChain(doc, chainId, (devices) =>
    devices.some((d) => d.id === deviceId && !isInstrument(d))
      ? devices.filter((d) => d.id !== deviceId)
      : devices,
  );

/** Move an effect one place earlier or later; it can't pass the instrument. */
export const moveDevice = (
  doc: Project,
  chainId: Id,
  deviceId: Id,
  by: -1 | 1,
) =>
  updateChain(doc, chainId, (chain) => {
    const first = firstEffectIndex(chain);
    const i = chain.findIndex((d) => d.id === deviceId);
    const j = i + by;
    if (i < first || j < first || j >= chain.length) return chain;
    const devices = [...chain];
    [devices[i], devices[j]] = [devices[j], devices[i]];
    return devices;
  });

/** Swap a device for another (pasted settings), keeping its id and place in the chain. */
export const replaceDevice = (
  doc: Project,
  chainId: Id,
  deviceId: Id,
  next: Device,
) =>
  updateDevice(doc, chainId, deviceId, (old) => {
    // Pasted settings carry params only; keep the routing.
    const sidechain = "sidechain" in old ? old.sidechain : undefined;
    return "bypass" in next && sidechain
      ? { ...next, id: deviceId, sidechain }
      : { ...next, id: deviceId };
  });
