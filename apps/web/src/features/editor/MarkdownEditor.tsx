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
import { saveKeyBinding } from "./editor-shortcuts";
import { fenceCompleteKeymap } from "./fence-complete";
import { livePreviewEnabledEffect, livePreviewExtensions } from "./live-preview";

interface MarkdownEditorProps {
  value: string;
  disabled?: boolean;
  livePreview?: boolean;
  syncKey?: string;
  onChange: (value: string) => void;
  onSave: () => void;
}

function sourceChrome() {
  return [lineNumbers(), highlightActiveLineGutter(), syntaxHighlighting(oneDarkHighlightStyle)];
}

export function MarkdownEditor({
  value,
  disabled = false,
  livePreview = true,
  syncKey,
  onChange,
  onSave,
}: MarkdownEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);
  const editable = useRef(new Compartment());
  const chrome = useRef(new Compartment());
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
          markdown({ base: markdownLanguage }),
          placeholder("开始书写…"),
          fenceCompleteKeymap(),
          keymap.of([saveKeyBinding(() => onSaveRef.current()), indentWithTab, ...defaultKeymap, ...historyKeymap]),
          editable.current.of(EditorView.editable.of(!disabled)),
          oneDarkTheme,
          livePreviewExtensions(livePreview),
          chrome.current.of(livePreview ? [] : sourceChrome()),
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
    const doc = editor.state.doc.toString();
    if (doc === value) {
      if (!disabled) syncedKey.current = syncKey ?? null;
      return;
    }
    if (disabled) return;
    const sameDocument = syncedKey.current === (syncKey ?? null);
    if (sameDocument && doc.length > 0) return;
    editor.dispatch({
      changes: { from: 0, to: editor.state.doc.length, insert: value },
      annotations: [Transaction.addToHistory.of(false)],
    });
    syncedKey.current = syncKey ?? null;
  }, [disabled, syncKey, value]);

  useEffect(() => {
    view.current?.dispatch({ effects: editable.current.reconfigure(EditorView.editable.of(!disabled)) });
  }, [disabled]);

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
            chrome.current.reconfigure(livePreview ? [] : sourceChrome()),
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
