import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { Play, Pause } from "lucide-react";
import { parseNotes } from "./parser/noteParser";

export function MelodyApp() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [text, setText] = useState("");
  const [parsedNotes, setParsedNotes] = useState<Array<{note: string, frequency: number}>>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const stopPlaybackRef = useRef<boolean>(false);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, []);

  useEffect(() => {
    const notes = parseNotes(text);
    setParsedNotes(notes);
  }, [text]);

  const playNotes = async () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }

    const ctx = audioContextRef.current;
    const notes = parseNotes(text);

    if (notes.length === 0) {
      setIsPlaying(false);
      return;
    }

    stopPlaybackRef.current = false;

    const noteDuration = 0.5;

    for (let i = 0; i < notes.length; i++) {
      if (stopPlaybackRef.current) {
        break;
      }

      const note = notes[i];
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(note.frequency, ctx.currentTime);

      gainNode.gain.setValueAtTime(0.5, ctx.currentTime);

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      const startTime = ctx.currentTime;
      oscillator.start(startTime);
      oscillator.stop(startTime + noteDuration);

      await new Promise((resolve) => setTimeout(resolve, noteDuration * 1000));
    }

    setIsPlaying(false);
  };

  const stopPlayback = () => {
    stopPlaybackRef.current = true;
  };

  const togglePlay = () => {
    if (isPlaying) {
      stopPlayback();
      setIsPlaying(false);
    } else {
      setIsPlaying(true);
      playNotes();
    }
  };

  useEffect(() => {
    return () => {
      stopPlaybackRef.current = true;
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-4xl h-full flex flex-col gap-4 py-8">
        <div className="flex flex-col items-center gap-2">
          <Button
            onClick={togglePlay}
            variant="outline"
            size="lg"
            className="min-w-32"
          >
            {isPlaying ? (
              <>
                <Pause className="size-4" />
                Pause
              </>
            ) : (
              <>
                <Play className="size-4" />
                Play
              </>
            )}
          </Button>
          {parsedNotes.length > 0 && (
            <div className="text-sm text-muted-foreground font-mono">
              {parsedNotes.map((n, i) => (
                <span key={i} className="mr-3">
                  {n.note}: {n.frequency.toFixed(2)}Hz
                </span>
              ))}
            </div>
          )}
        </div>

        <Textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Write your melody..."
          className="flex-1 resize-none text-lg"
          autoFocus
        />
      </div>
    </div>
  );
}
