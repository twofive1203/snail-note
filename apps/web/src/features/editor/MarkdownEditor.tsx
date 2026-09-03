import { useEffect, useRef } from "react";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { Compartment, EditorState } from "@codemirror/state";
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  placeholder,
} from "@codemirror/view";
import { oneDark } from "@codemirror/theme-one-dark";
import { saveKeyBinding } from "./editor-shortcuts";
import { livePreviewExtensions } from "./live-preview";

interface MarkdownEditorProps {
  value: string;
  disabled?: boolean;
  livePreview?: boolean;
  onChange: (value: string) => void;
  onSave: () => void;
}

function modeExtensions(livePreview: boolean) {
  return livePreview
    ? livePreviewExtensions()
    : [lineNumbers(), highlightActiveLineGutter(), oneDark];
}

export function MarkdownEditor({
  value,
  disabled = false,
  livePreview = true,
  onChange,
  onSave,
}: MarkdownEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);
  const editable = useRef(new Compartment());
  const mode = useRef(new Compartment());
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
          keymap.of([saveKeyBinding(() => onSaveRef.current()), indentWithTab, ...defaultKeymap, ...historyKeymap]),
          editable.current.of(EditorView.editable.of(!disabled)),
          mode.current.of(modeExtensions(livePreview)),
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
    if (!editor || editor.state.doc.toString() === value) return;
    editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } });
  }, [value]);

  useEffect(() => {
    view.current?.dispatch({ effects: editable.current.reconfigure(EditorView.editable.of(!disabled)) });
  }, [disabled]);

  useEffect(() => {
    view.current?.dispatch({ effects: mode.current.reconfigure(modeExtensions(livePreview)) });
  }, [livePreview]);

  return (
    <div
      className={`markdown-editor${livePreview ? " is-live" : ""}`}
      ref={host}
      aria-label={livePreview ? "Markdown 实时预览编辑器" : "Markdown 编辑器"}
    />
  );
}
