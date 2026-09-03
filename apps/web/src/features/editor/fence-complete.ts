import { EditorSelection, Prec, type EditorState } from "@codemirror/state";
import { type Command, type EditorView, keymap } from "@codemirror/view";

interface FenceLine {
  indent: string;
  marks: string;
  info: string;
}

function parseFenceLine(text: string): FenceLine | null {
  const match = /^(\s{0,3})(`{3,}|~{3,})(.*)$/.exec(text);
  if (!match) return null;
  const indent = match[1] ?? "";
  const marks = match[2] ?? "";
  const rest = (match[3] ?? "").trimEnd();
  const tick = marks[0] ?? "";
  if (tick && rest.includes(tick)) return null;
  return { indent, marks, info: rest.trim() };
}

function isClosingFence(text: string, marks: string) {
  const parsed = parseFenceLine(text);
  if (!parsed || parsed.info) return false;
  return parsed.marks[0] === marks[0] && parsed.marks.length >= marks.length;
}

function hasOpenFenceBefore(state: EditorState, lineNumber: number) {
  let open: string | null = null;
  for (let number = 1; number < lineNumber; number += 1) {
    const text = state.doc.line(number).text;
    const parsed = parseFenceLine(text);
    if (!parsed) continue;
    if (!open) {
      open = parsed.marks;
      continue;
    }
    if (isClosingFence(text, open)) open = null;
  }
  return open !== null;
}

function fenceClosedAfter(state: EditorState, lineNumber: number, marks: string) {
  for (let number = lineNumber + 1; number <= state.doc.lines; number += 1) {
    if (isClosingFence(state.doc.line(number).text, marks)) return true;
  }
  return false;
}

export const completeFencedCodeOnEnter: Command = (view: EditorView) => {
  if (view.state.readOnly) return false;
  const { state } = view;
  const insertions: { from: number; insert: string; cursor: number }[] = [];

  for (const range of state.selection.ranges) {
    if (!range.empty) return false;
    const line = state.doc.lineAt(range.head);
    if (range.head !== line.to) return false;
    const parsed = parseFenceLine(line.text);
    if (!parsed) return false;
    if (!parsed.info && hasOpenFenceBefore(state, line.number)) return false;
    if (fenceClosedAfter(state, line.number, parsed.marks)) return false;
    const insert = `\n${parsed.indent}\n${parsed.indent}${parsed.marks}`;
    insertions.push({ from: line.to, insert, cursor: line.to + 1 + parsed.indent.length });
  }

  view.dispatch({
    changes: insertions.map(({ from, insert }) => ({ from, insert })),
    selection: EditorSelection.create(insertions.map(({ cursor }) => EditorSelection.cursor(cursor))),
    scrollIntoView: true,
    userEvent: "input.complete",
  });
  return true;
};

export function fenceCompleteKeymap() {
  return Prec.highest(keymap.of([{ key: "Enter", run: completeFencedCodeOnEnter }]));
}
