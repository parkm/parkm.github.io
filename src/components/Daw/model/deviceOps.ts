import { newId, updateTrack } from "./ops";
import type { Device, EffectType, Id, Project } from "./types";

/** Device chain edits. The instrument is always first; effects follow in signal order. */

function updateDevice(
  doc: Project,
  trackId: Id,
  deviceId: Id,
  fn: (device: Device) => Device,
): Project {
  return updateTrack(doc, trackId, (track) => {
    let changed = false;
    const devices = track.devices.map((d) => {
      if (d.id !== deviceId) return d;
      const next = fn(d);
      if (next !== d) changed = true;
      return next;
    });
    return changed ? { ...track, devices } : track;
  });
}

export const setDeviceParam = (
  doc: Project,
  trackId: Id,
  deviceId: Id,
  key: string,
  value: number,
) =>
  updateDevice(doc, trackId, deviceId, (d) =>
    d.type === "drumKit" || d.params[key] === value
      ? d
      : { ...d, params: { ...d.params, [key]: value } },
  );

/** Replace all params (loading a preset). */
export const setDeviceParams = (
  doc: Project,
  trackId: Id,
  deviceId: Id,
  params: Record<string, number>,
) =>
  updateDevice(doc, trackId, deviceId, (d) =>
    d.type === "drumKit" ? d : { ...d, params: { ...params } },
  );

export const toggleBypass = (doc: Project, trackId: Id, deviceId: Id) =>
  updateDevice(doc, trackId, deviceId, (d) =>
    "bypass" in d ? { ...d, bypass: !d.bypass } : d,
  );

export const addEffect = (doc: Project, trackId: Id, type: EffectType) =>
  updateTrack(doc, trackId, (t) => ({
    ...t,
    devices: [...t.devices, { id: newId(), type, params: {}, bypass: false }],
  }));

export const removeDevice = (doc: Project, trackId: Id, deviceId: Id) =>
  updateTrack(doc, trackId, (t) =>
    t.devices[0]?.id === deviceId
      ? t
      : { ...t, devices: t.devices.filter((d) => d.id !== deviceId) },
  );

/** Move an effect one place earlier or later; it can't pass the instrument. */
export const moveDevice = (
  doc: Project,
  trackId: Id,
  deviceId: Id,
  by: -1 | 1,
) =>
  updateTrack(doc, trackId, (t) => {
    const i = t.devices.findIndex((d) => d.id === deviceId);
    const j = i + by;
    if (i < 1 || j < 1 || j >= t.devices.length) return t;
    const devices = [...t.devices];
    [devices[i], devices[j]] = [devices[j], devices[i]];
    return { ...t, devices };
  });

/** Swap a device for another (pasted settings), keeping its id and place in the chain. */
export const replaceDevice = (
  doc: Project,
  trackId: Id,
  deviceId: Id,
  next: Device,
) => updateDevice(doc, trackId, deviceId, () => ({ ...next, id: deviceId }));
