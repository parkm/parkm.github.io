import { PPQ, swingTick } from "../model/time";
import type { Project } from "../model/types";
import {
  chosenClip,
  forEachNoteInRange,
  loopLength,
  type ClipChoice,
} from "../engine/schedule";

/**
 * Standard MIDI File, type 1: a conductor track (tempo, time signature) and
 * one track per DAW track. Drum kits go on channel 10 with General MIDI note
 * numbers. Swing is baked into note times so the file plays like the DAW.
 */

const DRUM_CHANNEL = 9;

function writer() {
  const bytes: number[] = [];
  const vlq = (n: number) => {
    const out = [n & 0x7f];
    while ((n >>= 7)) out.unshift((n & 0x7f) | 0x80);
    bytes.push(...out);
  };
  const u32 = (n: number) =>
    bytes.push(
      (n >>> 24) & 0xff,
      (n >>> 16) & 0xff,
      (n >>> 8) & 0xff,
      n & 0xff,
    );
  const u16 = (n: number) => bytes.push((n >> 8) & 0xff, n & 0xff);
  const text = (s: string) => {
    const encoded = new TextEncoder().encode(s);
    vlq(encoded.length);
    bytes.push(...encoded);
  };
  return { bytes, vlq, u32, u16, text };
}

type Event = { tick: number; order: number; data: number[] };

function trackChunk(
  name: string,
  events: Event[],
  meta: (w: ReturnType<typeof writer>) => void = () => {},
) {
  const w = writer();
  w.vlq(0);
  w.bytes.push(0xff, 0x03);
  w.text(name);
  meta(w);
  events.sort((a, b) => a.tick - b.tick || a.order - b.order);
  let last = 0;
  for (const e of events) {
    w.vlq(e.tick - last);
    w.bytes.push(...e.data);
    last = e.tick;
  }
  w.vlq(0);
  w.bytes.push(0xff, 0x2f, 0x00);

  const chunk = writer();
  chunk.bytes.push(...[..."MTrk"].map((c) => c.charCodeAt(0)));
  chunk.u32(w.bytes.length);
  chunk.bytes.push(...w.bytes);
  return chunk.bytes;
}

export function encodeMidi(
  doc: Project,
  clips: ClipChoice,
  loops = 1,
): Uint8Array {
  const length = loopLength(doc, clips) * loops;
  const chunks: number[][] = [];

  chunks.push(
    trackChunk("Tempo", [], (w) => {
      const usPerQuarter = Math.round(60_000_000 / doc.bpm);
      w.vlq(0);
      w.bytes.push(
        0xff,
        0x51,
        0x03,
        (usPerQuarter >> 16) & 0xff,
        (usPerQuarter >> 8) & 0xff,
        usPerQuarter & 0xff,
      );
      const [num, den] = doc.timeSignature;
      w.vlq(0);
      w.bytes.push(0xff, 0x58, 0x04, num, Math.log2(den), 24, 8);
    }),
  );

  doc.tracks.forEach((track, i) => {
    const clip = chosenClip(doc, track, clips);
    const isDrums = track.devices[0]?.type === "drumKit";
    const channel = isDrums
      ? DRUM_CHANNEL
      : i % 16 === DRUM_CHANNEL
        ? 15
        : i % 16;
    const events: Event[] = [];
    if (clip) {
      forEachNoteInRange(clip, 0, length, (note, at) => {
        const on = Math.round(swingTick(at, doc.swing));
        const off = Math.max(
          on + 1,
          Math.round(swingTick(at + note.duration, doc.swing)),
        );
        const velocity = Math.max(
          1,
          Math.min(127, Math.round(note.velocity * 127)),
        );
        events.push({
          tick: on,
          order: 1,
          data: [0x90 | channel, note.pitch, velocity],
        });
        events.push({
          tick: Math.min(off, length),
          order: 0,
          data: [0x80 | channel, note.pitch, 0],
        });
      });
    }
    chunks.push(trackChunk(track.name, events));
  });

  const header = writer();
  header.bytes.push(...[..."MThd"].map((c) => c.charCodeAt(0)));
  header.u32(6);
  header.u16(1);
  header.u16(chunks.length);
  header.u16(PPQ);
  return new Uint8Array([...header.bytes, ...chunks.flat()]);
}
