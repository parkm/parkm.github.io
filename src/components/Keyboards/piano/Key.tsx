import { playNote, stopNote } from "./synth";

type KeyType = "white" | "black";
interface KeyProps {
  note: string;
  octave: number;
  type: KeyType;
  width: number;
  height: number;
  left: number;
  isActive: boolean;
  onKeyDown: () => void;
  onKeyUp: () => void;
}

export function Key({
  note,
  octave,
  type,
  width,
  height,
  left,
  isActive,
  onKeyDown,
  onKeyUp,
}: KeyProps) {
  const noteId = `${note}${octave}`;

  const handleMouseDown = () => {
    onKeyDown();
    playNote(note, octave);
  };
  const handleMouseUp = () => {
    onKeyUp();
    stopNote(noteId);
  };
  const handleMouseLeave = () => {
    if (isActive) {
      onKeyUp();
      stopNote(noteId);
    }
  };

  const isWhite = type === "white";
  const style: React.CSSProperties = {
    width,
    height,
    position: "absolute",
    left,
    top: isWhite ? undefined : 0,
    background: isWhite
      ? isActive
        ? "#e6e6e6"
        : "#fff"
      : isActive
        ? "#444"
        : "#111",
    border: isWhite ? "1px solid #bbb" : "1px solid #000",
    borderTopWidth: 1,
    borderBottomLeftRadius: isWhite ? 4 : 3,
    borderBottomRightRadius: isWhite ? 4 : 3,
    boxShadow: isWhite
      ? isActive
        ? "inset 0 -1px 2px rgba(0,0,0,0.2)"
        : "0 2px 3px rgba(0,0,0,0.1)"
      : isActive
        ? "inset 0 -1px 2px rgba(0,0,0,0.5)"
        : "0 0 5px rgba(0,0,0,0.5)",
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "center",
    paddingBottom: 8,
    userSelect: "none",
    zIndex: isWhite ? 1 : 2,
    transition: "background-color 0.05s",
  };

  return (
    <div
      className={type + "-key" + (isActive ? " active" : "")}
      style={style}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
    >
      {isWhite ? (
        <span
          className="text-xs text-gray-400 font-medium"
          style={{ marginBottom: 4 }}
        >
          {note}
          {octave}
        </span>
      ) : (
        <span
          className="text-xs font-medium"
          style={{ marginBottom: 4, color: "rgba(255,255,255,0.6)" }}
        >
          {note.length > 1 ? note : null}
        </span>
      )}
    </div>
  );
}
