import { useEffect, useRef } from "react";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { syntaxHighlighting } from "@codemirror/language";
import { Compartment, EditorState, Transaction } from "@codemirror/state";
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  placeholder,
} from "@codemirror/view";
import { oneDarkHighlightStyle, oneDarkTheme } from "@codemirror/theme-one-dark";
import { fenceCodeLanguage } from "./code-languages";
import { saveKeyBinding } from "./editor-shortcuts";
import { fenceCompleteKeymap } from "./fence-complete";
import type { NoteImageContext } from "./image-url";
import { livePreviewEnabledEffect, livePreviewExtensions } from "./live-preview";
import { noteImageContextFacet } from "./note-image-context";
import { pasteMarkdownExtension } from "./paste-markdown";

interface MarkdownEditorProps {
  value: string;
  disabled?: boolean;
  livePreview?: boolean;
  syncKey?: string;
  notebookId?: string | null;
  notePath?: string | null;
  onChange: (value: string) => void;
  onSave: () => void;
}

function sourceChrome() {
  return [lineNumbers(), highlightActiveLineGutter(), syntaxHighlighting(oneDarkHighlightStyle)];
}

function liveChrome() {
  return [];
}

function imageContext(notebookId?: string | null, notePath?: string | null): NoteImageContext | null {
  return notebookId && notePath ? { notebookId, notePath } : null;
}

export function MarkdownEditor({
  value,
  disabled = false,
  livePreview = true,
  syncKey,
  notebookId,
  notePath,
  onChange,
  onSave,
}: MarkdownEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);
  const editable = useRef(new Compartment());
  const chrome = useRef(new Compartment());
  const noteImage = useRef(new Compartment());
  const syncedKey = useRef<string | null>(null);
  const skipModeEffect = useRef(true);
  onChangeRef.current = onChange;
  onSaveRef.current = onSave;

  useEffect(() => {
    if (!host.current) return;
    const editor = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          drawSelection(),
          highlightActiveLine(),
          markdown({ base: markdownLanguage, codeLanguages: fenceCodeLanguage }),
          placeholder("开始书写…"),
          pasteMarkdownExtension(),
          fenceCompleteKeymap(),
          keymap.of([saveKeyBinding(() => onSaveRef.current()), indentWithTab, ...defaultKeymap, ...historyKeymap]),
          editable.current.of(EditorView.editable.of(!disabled)),
          noteImage.current.of(noteImageContextFacet.of(imageContext(notebookId, notePath))),
          oneDarkTheme,
          livePreviewExtensions(livePreview),
          chrome.current.of(livePreview ? liveChrome() : sourceChrome()),
          EditorView.lineWrapping,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current(update.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = editor;
    return () => {
      editor.destroy();
      view.current = null;
    };
    // The editor instance is intentionally created once; refs keep callbacks current.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const editor = view.current;
    if (!editor) return;
    const nextKey = syncKey ?? null;
    const doc = editor.state.doc.toString();
    const keyChanged = syncedKey.current !== nextKey;

    if (disabled) {
      // Keep the previous document on screen until the new file finishes loading.
      return;
    }

    if (doc === value) {
      // Matching text is only proof of the new file after a key change if we
      // already applied that file, or this is the editor's first document.
      if (!keyChanged || syncedKey.current === null) syncedKey.current = nextKey;
      return;
    }

    if (!keyChanged && doc.length > 0) return;
    editor.dispatch({
      changes: { from: 0, to: editor.state.doc.length, insert: value },
      annotations: [Transaction.addToHistory.of(false)],
    });
    syncedKey.current = nextKey;
  }, [disabled, syncKey, value]);

  useEffect(() => {
    view.current?.dispatch({ effects: editable.current.reconfigure(EditorView.editable.of(!disabled)) });
  }, [disabled]);

  useEffect(() => {
    view.current?.dispatch({
      effects: noteImage.current.reconfigure(noteImageContextFacet.of(imageContext(notebookId, notePath))),
    });
  }, [notebookId, notePath]);

  useEffect(() => {
    if (skipModeEffect.current) {
      skipModeEffect.current = false;
      return;
    }
    const editor = view.current;
    if (!editor) return;
    let cancelled = false;
    const apply = () => {
      if (cancelled || !view.current) return;
      if (view.current.composing) {
        view.current.contentDOM.addEventListener("compositionend", apply, { once: true });
        return;
      }
      try {
        view.current.dispatch({
          effects: [
            livePreviewEnabledEffect(livePreview),
            chrome.current.reconfigure(livePreview ? liveChrome() : sourceChrome()),
          ],
        });
      } catch (error) {
        console.error("Failed to switch editor mode", error);
      }
    };
    const timer = window.setTimeout(apply, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      editor.contentDOM.removeEventListener("compositionend", apply);
    };
  }, [livePreview]);

  return (
    <div
      className={`markdown-editor${livePreview ? " is-live" : ""}`}
      ref={host}
      aria-label={livePreview ? "Markdown 实时预览编辑器" : "Markdown 编辑器"}
    />
  );
}
