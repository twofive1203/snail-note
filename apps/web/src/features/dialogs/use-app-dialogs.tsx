import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { NotebookNode } from "@snail-note/shared";
import type { ActiveEntry } from "../file-tree/file-tree-types";
import { ConfirmDialog } from "./ConfirmDialog";
import { MoveEntryDialog } from "./MoveEntryDialog";
import { PromptDialog } from "./PromptDialog";
import { UnsavedChangesDialog } from "./UnsavedChangesDialog";

export type LeaveChoice = "save" | "discard" | "cancel";

interface PromptOptions {
  title: string;
  description?: string;
  defaultValue: string;
  submitLabel: string;
  validate: (value: string) => string | null;
  transform?: (value: string) => string;
}

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
}

type DialogState =
  | { kind: "prompt"; options: PromptOptions; resolve: (value: string | null) => void }
  | { kind: "confirm"; options: ConfirmOptions; resolve: (value: boolean) => void }
  | { kind: "leave"; fileName?: string; resolve: (value: LeaveChoice) => void }
  | { kind: "move"; entry: ActiveEntry; nodes: NotebookNode[]; resolve: (value: string | null) => void };

export function useAppDialogs() {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const dialogRef = useRef<DialogState | null>(null);
  dialogRef.current = dialog;

  const begin = useCallback(<T,>(factory: (resolve: (value: T) => void) => DialogState, busyValue: T): Promise<T> => {
    if (dialogRef.current) return Promise.resolve(busyValue);
    return new Promise<T>((resolve) => {
      const next = factory(resolve);
      dialogRef.current = next;
      setDialog(next);
    });
  }, []);

  const settle = useCallback((apply: (current: DialogState) => void) => {
    const current = dialogRef.current;
    if (!current) return;
    dialogRef.current = null;
    setDialog(null);
    apply(current);
  }, []);

  const promptName = useCallback((options: PromptOptions) => {
    return begin<string | null>((resolve) => ({ kind: "prompt", options, resolve }), null);
  }, [begin]);

  const confirm = useCallback((options: ConfirmOptions) => {
    return begin<boolean>((resolve) => ({ kind: "confirm", options, resolve }), false);
  }, [begin]);

  const confirmLeave = useCallback((fileName?: string) => {
    return begin<LeaveChoice>((resolve) => ({ kind: "leave", fileName, resolve }), "cancel");
  }, [begin]);

  const pickMoveTarget = useCallback((entry: ActiveEntry, nodes: NotebookNode[]) => {
    return begin<string | null>((resolve) => ({ kind: "move", entry, nodes, resolve }), null);
  }, [begin]);

  useEffect(() => () => {
    const current = dialogRef.current;
    if (!current) return;
    dialogRef.current = null;
    if (current.kind === "confirm") current.resolve(false);
    else if (current.kind === "leave") current.resolve("cancel");
    else current.resolve(null);
  }, []);

  let dialogHost: ReactNode = null;
  if (dialog?.kind === "prompt") {
    dialogHost = (
      <PromptDialog
        {...dialog.options}
        onClose={() => settle((current) => current.kind === "prompt" && current.resolve(null))}
        onSubmit={(value) => settle((current) => current.kind === "prompt" && current.resolve(value))}
      />
    );
  } else if (dialog?.kind === "confirm") {
    dialogHost = (
      <ConfirmDialog
        {...dialog.options}
        onClose={() => settle((current) => current.kind === "confirm" && current.resolve(false))}
        onConfirm={() => settle((current) => current.kind === "confirm" && current.resolve(true))}
      />
    );
  } else if (dialog?.kind === "leave") {
    dialogHost = (
      <UnsavedChangesDialog
        fileName={dialog.fileName}
        onCancel={() => settle((current) => current.kind === "leave" && current.resolve("cancel"))}
        onDiscard={() => settle((current) => current.kind === "leave" && current.resolve("discard"))}
        onSave={() => settle((current) => current.kind === "leave" && current.resolve("save"))}
      />
    );
  } else if (dialog?.kind === "move") {
    dialogHost = (
      <MoveEntryDialog
        entry={dialog.entry}
        nodes={dialog.nodes}
        onClose={() => settle((current) => current.kind === "move" && current.resolve(null))}
        onSubmit={(value) => settle((current) => current.kind === "move" && current.resolve(value))}
      />
    );
  }

  return {
    dialogHost,
    dialogOpen: dialog !== null,
    promptName,
    confirm,
    confirmLeave,
    pickMoveTarget,
  };
}
