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
  isMarked: boolean;
  onKeyDown: () => void;
  onKeyUp: () => void;
  onClick: () => void;
}

export function Key({
  note,
  octave,
  type,
  width,
  height,
  left,
  isActive,
  isMarked,
  onKeyDown,
  onKeyUp,
  onClick,
}: KeyProps) {
  const noteId = `${note}${octave}`;

  const handleMouseDown = () => {
    onKeyDown();
    playNote(note, octave);
    onClick();
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
    background: isMarked
      ? isWhite
        ? "#a0c4ff"
        : "#6082b6"
      : isWhite
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
    paddingBottom: 4,
    userSelect: "none",
    zIndex: isWhite ? 1 : 2,
    transition: "background-color 0.05s",
  };

  return (
    <div
      className={
        type +
        "-key" +
        (isActive ? " active" : "") +
        (isMarked ? " marked" : "")
      }
      style={style}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
    >
      {isWhite ? (
        <span
          className="text-[9px] text-gray-800 font-medium"
          style={{ marginBottom: 2 }}
        >
          {note}
          {octave}
        </span>
      ) : (
        <span
          className="text-[8px] font-medium text-gray-200"
          style={{ marginBottom: 2 }}
        >
          {note.length > 1 ? note : null}
        </span>
      )}
    </div>
  );
}
