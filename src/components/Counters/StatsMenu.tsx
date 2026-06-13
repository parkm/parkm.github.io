/**
 * Top-right "Stats & data" panel. Shows at-a-glance numbers, the storage
 * persistence status (with a button to request it), and import / export.
 */

import { useMemo, useRef, useState } from "react";
import {
  BarChart3,
  Download,
  Upload,
  Copy,
  Check,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";
import { Button, Textarea } from "@/components/ui";
import { cn } from "@/lib/utils";
import { storageEstimate as readStorageEstimate } from "./db";
import { downloadExport, ImportError } from "./serialize";
import { formatDateTime, formatNumber } from "./helpers";
import { Modal } from "./Modal";
import type { CountersStore } from "./store";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/50 flex flex-col gap-0.5 rounded-lg border p-3">
      <span className="text-xl font-semibold tabular-nums">{value}</span>
      <span className="text-muted-foreground text-xs">{label}</span>
    </div>
  );
}

export function StatsMenu({ store }: { store: CountersStore }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importMode, setImportMode] = useState<"merge" | "replace">("merge");
  const [importError, setImportError] = useState<string | null>(null);
  const [usage, setUsage] = useState<string | null>(null);
  const [persistMsg, setPersistMsg] = useState<{
    tone: "ok" | "warn" | "err";
    text: string;
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handlePersist() {
    setPersistMsg(null);
    try {
      const result = await store.enablePersistence();
      if (result === null) {
        setPersistMsg({
          tone: "warn",
          text: "This browser doesn't support persistent storage, but your data is still saved locally.",
        });
      } else if (result) {
        setPersistMsg({
          tone: "ok",
          text: "Granted — your data is now marked persistent.",
        });
      } else {
        setPersistMsg({
          tone: "warn",
          text: "Your browser declined for now. It often grants this automatically as you use the app, or once you bookmark or install it.",
        });
      }
    } catch (err) {
      setPersistMsg({
        tone: "err",
        text:
          err instanceof Error
            ? err.message
            : "Something went wrong requesting persistence.",
      });
    }
  }

  const stats = useMemo(() => {
    const changes = store.history.filter((h) => h.type !== "create").length;
    const autoResets = store.history.filter(
      (h) => h.type === "reset" && h.source === "auto",
    ).length;
    const lastChange = store.history.reduce<string | null>(
      (latest, h) => (!latest || h.at > latest ? h.at : latest),
      null,
    );
    return {
      counters: store.counters.length,
      stacks: store.stacks.length,
      changes,
      autoResets,
      lastChange,
    };
  }, [store.history, store.counters.length, store.stacks.length]);

  async function openPanel() {
    setOpen(true);
    const est = await readStorageEstimate();
    if (est?.usage != null) {
      setUsage(`${(est.usage / 1024).toFixed(1)} KB`);
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(store.exportText());
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    file.text().then((text) => {
      setImportText(text);
      setImportError(null);
    });
  }

  async function runImport() {
    try {
      await store.importText(importText, importMode);
      setImportOpen(false);
      setImportText("");
      setImportError(null);
    } catch (err) {
      setImportError(
        err instanceof ImportError ? err.message : "Import failed.",
      );
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="icon"
        onClick={openPanel}
        aria-label="Stats and data"
      >
        <BarChart3 className="size-4" />
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Stats & data"
        description="An overview of your counters and where your data lives."
      >
        <div className="flex flex-col gap-5">
          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Counters" value={formatNumber(stats.counters)} />
            <Stat label="Stacks" value={formatNumber(stats.stacks)} />
            <Stat label="Changes logged" value={formatNumber(stats.changes)} />
            <Stat label="Auto resets" value={formatNumber(stats.autoResets)} />
          </div>
          {stats.lastChange && (
            <p className="text-muted-foreground -mt-2 text-xs">
              Last change {formatDateTime(stats.lastChange)}
            </p>
          )}

          {/* Persistence */}
          <div className="rounded-lg border p-4">
            <div className="flex items-start gap-3">
              {store.persisted ? (
                <ShieldCheck className="mt-0.5 size-5 shrink-0 text-emerald-500" />
              ) : (
                <ShieldAlert className="text-muted-foreground mt-0.5 size-5 shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {store.persisted
                    ? "Storage is persistent"
                    : "Storage is not guaranteed"}
                </p>
                <p className="text-muted-foreground text-xs">
                  {store.persisted
                    ? "Your data is marked persistent and won't be cleared automatically."
                    : "The browser may evict data under storage pressure. Grant persistence to protect it."}
                  {usage && ` Using ${usage}.`}
                </p>
                {!store.persisted && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={handlePersist}
                  >
                    Make storage persistent
                  </Button>
                )}
                {persistMsg && (
                  <p
                    className={cn(
                      "mt-2 text-xs",
                      persistMsg.tone === "ok" && "text-emerald-500",
                      persistMsg.tone === "warn" &&
                        "text-amber-600 dark:text-amber-400",
                      persistMsg.tone === "err" && "text-destructive",
                    )}
                  >
                    {persistMsg.text}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Data management */}
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">Backup & restore</h3>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadExport(store.exportText())}
              >
                <Download className="size-4" />
                Export file
              </Button>
              <Button variant="outline" size="sm" onClick={handleCopy}>
                {copied ? (
                  <Check className="size-4" />
                ) : (
                  <Copy className="size-4" />
                )}
                {copied ? "Copied" : "Copy JSON"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setImportOpen(true);
                  setOpen(false);
                }}
              >
                <Upload className="size-4" />
                Import
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">
              Exports are plain JSON — readable, compact, and easy to back up.
            </p>
          </div>
        </div>
      </Modal>

      {/* Import dialog */}
      <Modal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import data"
        description="Paste an export below, or choose a file."
        footer={
          <>
            <Button variant="ghost" onClick={() => setImportOpen(false)}>
              Cancel
            </Button>
            <Button onClick={runImport} disabled={!importText.trim()}>
              Import
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={handleFile}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="size-4" />
            Choose file…
          </Button>

          <Textarea
            rows={8}
            placeholder='{ "app": "counters", … }'
            value={importText}
            onChange={(e) => {
              setImportText(e.target.value);
              setImportError(null);
            }}
            className="font-mono text-xs"
          />

          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="import-mode"
                checked={importMode === "merge"}
                onChange={() => setImportMode("merge")}
              />
              Merge
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="import-mode"
                checked={importMode === "replace"}
                onChange={() => setImportMode("replace")}
              />
              Replace everything
            </label>
          </div>

          {importError && (
            <p className="text-destructive text-sm">{importError}</p>
          )}
        </div>
      </Modal>
    </>
  );
}
