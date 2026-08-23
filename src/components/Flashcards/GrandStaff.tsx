import { cn } from "@/lib/utils";
import type { Clef, StaffNote } from "./sheetMusicDeck";

export type Feedback = "idle" | "correct" | "wrong";

const HALF = 7; // vertical distance of one staff position (half a line gap)
const LINE_GAP = HALF * 2;

// The staves are separated by a real gutter, so vertical position depends on
// which staff the note is written against; middle C lands on a ledger line
// near either staff. The gutter is 4.5 line gaps — wide enough that a note
// two ledgers above the bass staff doesn't sit flush under the treble staff.
const TREBLE_TOP = 70;
const BASS_TOP = TREBLE_TOP + 4 * LINE_GAP + 4.5 * LINE_GAP;
const y = (dv: number, clef: Clef) =>
  clef === "treble"
    ? TREBLE_TOP + (38 - dv) * HALF
    : BASS_TOP + (26 - dv) * HALF;

const WIDTH = 320;
const HEIGHT = 314;
const LINE_X1 = 14;
const LINE_X2 = 306;
const NOTE_X = 200;

const TREBLE_LINES = [30, 32, 34, 36, 38];
const BASS_LINES = [18, 20, 22, 24, 26];

// Clef outlines traced from Wikimedia Commons GClef.svg / FClef.svg (public domain).
// The treble glyph is 15.186×40.768 units with the G-curl centered 62.5% down;
// the bass glyph is 18×20 units (after its group translate) with the two dots
// straddling local y≈6.08. Each is scaled and pinned to its reference line.
const TREBLE_PATH =
  "m12.049 3.5296c0.305 3.1263-2.019 5.6563-4.0772 7.7014-0.9349 0.897-0.155 0.148-0.6437 0.594-0.1022-0.479-0.2986-1.731-0.2802-2.11 0.1304-2.6939 2.3198-6.5875 4.2381-8.0236 0.309 0.5767 0.563 0.6231 0.763 1.8382zm0.651 16.142c-1.232-0.906-2.85-1.144-4.3336-0.885-0.1913-1.255-0.3827-2.51-0.574-3.764 2.3506-2.329 4.9066-5.0322 5.0406-8.5394 0.059-2.232-0.276-4.6714-1.678-6.4836-1.7004 0.12823-2.8995 2.156-3.8019 3.4165-1.4889 2.6705-1.1414 5.9169-0.57 8.7965-0.8094 0.952-1.9296 1.743-2.7274 2.734-2.3561 2.308-4.4085 5.43-4.0046 8.878 0.18332 3.334 2.5894 6.434 5.8702 7.227 1.2457 0.315 2.5639 0.346 3.8241 0.099 0.2199 2.25 1.0266 4.629 0.0925 6.813-0.7007 1.598-2.7875 3.004-4.3325 2.192-0.5994-0.316-0.1137-0.051-0.478-0.252 1.0698-0.257 1.9996-1.036 2.26-1.565 0.8378-1.464-0.3998-3.639-2.1554-3.358-2.262 0.046-3.1904 3.14-1.7356 4.685 1.3468 1.52 3.833 1.312 5.4301 0.318 1.8125-1.18 2.0395-3.544 1.8325-5.562-0.07-0.678-0.403-2.67-0.444-3.387 0.697-0.249 0.209-0.059 1.193-0.449 2.66-1.053 4.357-4.259 3.594-7.122-0.318-1.469-1.044-2.914-2.302-3.792zm0.561 5.757c0.214 1.991-1.053 4.321-3.079 4.96-0.136-0.795-0.172-1.011-0.2626-1.475-0.4822-2.46-0.744-4.987-1.116-7.481 1.6246-0.168 3.4576 0.543 4.0226 2.184 0.244 0.577 0.343 1.197 0.435 1.812zm-5.1486 5.196c-2.5441 0.141-4.9995-1.595-5.6343-4.081-0.749-2.153-0.5283-4.63 0.8207-6.504 1.1151-1.702 2.6065-3.105 4.0286-4.543 0.183 1.127 0.366 2.254 0.549 3.382-2.9906 0.782-5.0046 4.725-3.215 7.451 0.5324 0.764 1.9765 2.223 2.7655 1.634-1.102-0.683-2.0033-1.859-1.8095-3.227-0.0821-1.282 1.3699-2.911 2.6513-3.198 0.4384 2.869 0.9413 6.073 1.3797 8.943-0.5054 0.1-1.0211 0.143-1.536 0.143z";

const BASS_BODY_PATH =
  "M 243.97900,540.86798 C 244.02398,543.69258 242.76360,546.43815 240.76469,548.40449 C 238.27527,550.89277 235.01791,552.47534 231.69762,553.53261 C 231.25590,553.77182 230.58970,553.45643 231.28550,553.13144 C 232.62346,552.52289 234.01319,552.00050 235.24564,551.18080 C 237.96799,549.49750 240.26523,546.84674 240.82279,543.61854 C 241.14771,541.65352 241.05724,539.60795 240.56484,537.67852 C 240.20352,536.25993 239.22033,534.79550 237.66352,534.58587 C 236.25068,534.36961 234.74885,534.85905 233.74057,535.88093 C 233.47541,536.14967 232.95916,536.89403 233.04435,537.74747 C 233.64637,537.27468 233.60528,537.32732 234.09900,537.10717 C 235.23573,536.60031 236.74349,537.32105 237.02700,538.57272 C 237.32909,539.72295 237.09551,541.18638 235.96036,541.79960 C 234.77512,542.44413 233.02612,542.17738 232.36450,540.90866 C 231.26916,538.95418 231.87147,536.28193 233.64202,534.92571 C 235.44514,533.42924 238.07609,533.37089 240.19963,534.13862 C 242.38419,534.95111 243.68629,537.21483 243.89691,539.45694 C 243.95419,539.92492 243.97896,540.39668 243.97900,540.86798 z";

const BASS_DOT_1 =
  "M 248.25999,536.80200 C 248.26766,537.17138 248.11044,537.54065 247.82878,537.78185 C 247.46853,538.11076 246.91933,538.17813 246.47048,538.01071 C 246.02563,537.83894 245.69678,537.39883 245.67145,536.92060 C 245.63767,536.54689 245.75685,536.15479 246.02747,535.88867 C 246.28257,535.61680 246.66244,535.48397 247.03147,535.50645 C 247.41131,535.51452 247.77805,535.70601 248.00489,536.01019 C 248.17962,536.23452 248.26238,536.51954 248.25999,536.80200 z";

const BASS_DOT_2 =
  "M 248.25999,542.64502 C 248.26772,543.01469 248.11076,543.38446 247.82878,543.62585 C 247.46853,543.95476 246.91933,544.02213 246.47048,543.85472 C 246.02537,543.68288 245.69655,543.24237 245.67145,542.76389 C 245.63651,542.38990 245.76354,542.00308 246.02700,541.73300 C 246.27663,541.45454 246.66060,541.32790 247.02845,541.34950 C 247.51230,541.36282 247.95159,541.69251 248.15162,542.12465 C 248.22565,542.28740 248.26043,542.46657 248.25999,542.64502 z";

// Treble: glyph height 40.768 units ≙ 7.02 staff spaces. This drawing's spiral
// centers ~66.5% down its bounding box (measured in-browser), pinned to G4.
const TREBLE_SCALE = (7.02 * LINE_GAP) / 40.768;
const TREBLE_X = 26;
const TREBLE_Y = y(32, "treble") - 0.665 * 40.768 * TREBLE_SCALE;

// Bass: glyph height 20 units ≙ 3.5 staff spaces, dots straddle local y=6.08 (F line).
const BASS_SCALE = (3.5 * LINE_GAP) / 20;
const BASS_X = 28;
const BASS_Y = y(24, "bass") - 6.08 * BASS_SCALE;

function ledgerYs({ dv, clef }: StaffNote): number[] {
  const [bottom, top] = clef === "treble" ? [30, 38] : [18, 26];
  const lines: number[] = [];
  for (let line = top + 2; line <= dv; line += 2) lines.push(line);
  for (let line = bottom - 2; line >= dv; line -= 2) lines.push(line);
  return lines.map((line) => y(line, clef));
}

export function GrandStaff({
  note,
  feedback,
}: {
  note: StaffNote;
  feedback: Feedback;
}) {
  const noteY = y(note.dv, note.clef);
  const stemUp = note.dv < (note.clef === "treble" ? 34 : 22);
  const stemX = NOTE_X + (stemUp ? 7 : -7);
  const systemTop = y(38, "treble");
  const systemBottom = y(18, "bass");
  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="w-80 sm:w-96"
      role="img"
      aria-label="Grand staff showing a single note"
    >
      <g stroke="currentColor" strokeWidth={1.1} opacity={0.85}>
        {TREBLE_LINES.map((dv) => (
          <line
            key={dv}
            x1={LINE_X1}
            y1={y(dv, "treble")}
            x2={LINE_X2}
            y2={y(dv, "treble")}
          />
        ))}
        {BASS_LINES.map((dv) => (
          <line
            key={dv}
            x1={LINE_X1}
            y1={y(dv, "bass")}
            x2={LINE_X2}
            y2={y(dv, "bass")}
          />
        ))}
        <line
          x1={LINE_X1}
          y1={systemTop}
          x2={LINE_X1}
          y2={systemBottom}
          strokeWidth={2.5}
        />
        <line
          x1={LINE_X2}
          y1={systemTop}
          x2={LINE_X2}
          y2={systemBottom}
          strokeWidth={2.5}
        />
      </g>
      <g fill="currentColor">
        <path
          d={TREBLE_PATH}
          transform={`translate(${TREBLE_X} ${TREBLE_Y}) scale(${TREBLE_SCALE})`}
        />
        <g transform={`translate(${BASS_X} ${BASS_Y}) scale(${BASS_SCALE})`}>
          <g transform="translate(-230.9546 -533.6597)">
            <path d={BASS_BODY_PATH} />
            <path d={BASS_DOT_1} />
            <path d={BASS_DOT_2} />
          </g>
        </g>
      </g>
      <g
        className={cn(
          "transition-colors",
          feedback === "correct" && "text-emerald-500",
          feedback === "wrong" && "text-red-500",
        )}
      >
        {ledgerYs(note).map((ly) => (
          <line
            key={ly}
            x1={NOTE_X - 15}
            y1={ly}
            x2={NOTE_X + 15}
            y2={ly}
            stroke="currentColor"
            strokeWidth={1.3}
          />
        ))}
        <line
          x1={stemX}
          y1={noteY + (stemUp ? -2 : 2)}
          x2={stemX}
          y2={noteY + (stemUp ? -46 : 46)}
          stroke="currentColor"
          strokeWidth={1.6}
        />
        <ellipse
          cx={NOTE_X}
          cy={noteY}
          rx={8}
          ry={5.5}
          fill="currentColor"
          transform={`rotate(-15 ${NOTE_X} ${noteY})`}
        />
      </g>
    </svg>
  );
}
