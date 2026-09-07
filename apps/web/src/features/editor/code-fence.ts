import { syntaxTree } from "@codemirror/language";
import { EditorSelection, type EditorState, type SelectionRange } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

export interface FenceLine {
  indent: string;
  marks: string;
  info: string;
}

export interface FenceRange {
  from: number;
  to: number;
  language: string;
  open: { from: number; to: number };
  close: { from: number; to: number } | null;
  bodyFrom: number;
  bodyTo: number;
  hasBody: boolean;
}

export function parseFenceLine(text: string): FenceLine | null {
  const match = /^(\s{0,3})(`{3,}|~{3,})(.*)$/.exec(text);
  if (!match) return null;
  const indent = match[1] ?? "";
  const marks = match[2] ?? "";
  const rest = (match[3] ?? "").trimEnd();
  const tick = marks[0] ?? "";
  if (tick && rest.includes(tick)) return null;
  return { indent, marks, info: rest.trim() };
}

export function fenceLanguageFromInfo(info: string) {
  return info.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
}

function describeFence(
  state: EditorState,
  node: { from: number; to: number; node: { getChild(name: string): { from: number; to: number } | null; getChildren(name: string): { from: number }[] } },
): FenceRange {
  const open = state.doc.lineAt(node.from);
  const last = state.doc.lineAt(Math.max(node.from, node.to - 1));
  const marks = node.node.getChildren("CodeMark");
  let close: { from: number; to: number } | null = null;
  for (let i = marks.length - 1; i >= 0; i -= 1) {
    const mark = marks[i];
    if (!mark) continue;
    const line = state.doc.lineAt(mark.from);
    if (line.number !== open.number) {
      close = { from: line.from, to: line.to };
      break;
    }
  }
  const firstBody = open.number + 1;
  const lastBody = close ? state.doc.lineAt(close.from).number - 1 : last.number;
  const hasBody = firstBody <= lastBody;
  const info = node.node.getChild("CodeInfo");
  return {
    from: node.from,
    to: node.to,
    language: info ? fenceLanguageFromInfo(state.doc.sliceString(info.from, info.to)) : "",
    open: { from: open.from, to: open.to },
    close,
    bodyFrom: hasBody ? state.doc.line(firstBody).from : open.to,
    bodyTo: hasBody ? state.doc.line(lastBody).to : open.to,
    hasBody,
  };
}

export function findFenceAt(state: EditorState, pos: number): FenceRange | null {
  const tree = syntaxTree(state);
  const sides: (-1 | 1)[] = pos > 0 ? [1, -1] : [1];
  for (const side of sides) {
    let current = tree.resolveInner(pos, side);
    for (let node: typeof current | null = current; node; node = node.parent) {
      if (node.name !== "FencedCode") continue;
      const fence = describeFence(state, node);
      const end = fence.close ? fence.close.to : node.to;
      if (pos >= fence.from && pos <= end) return fence;
    }
  }
  return null;
}

export function fenceLineAt(fence: FenceRange, pos: number) {
  if (pos >= fence.open.from && pos <= fence.open.to) return "open" as const;
  if (fence.close && pos >= fence.close.from && pos <= fence.close.to) return "close" as const;
  return null;
}

export function fenceEndPos(fence: FenceRange) {
  return fence.close ? fence.close.to : fence.to;
}

export function fenceEndsDocument(state: EditorState, fence: FenceRange) {
  return fenceEndPos(fence) >= state.doc.length;
}

export function gapPosBesideFence(state: EditorState, fence: FenceRange, which: "open" | "close") {
  if (which === "open") {
    if (fence.open.from === 0) return fence.bodyFrom;
    return state.doc.lineAt(fence.open.from - 1).to;
  }
  if (!fence.close || fence.close.to >= state.doc.length) return fence.bodyTo;
  const next = Math.min(state.doc.length, fence.close.to + 1);
  return state.doc.lineAt(next).from;
}

export function insertLineAfterFence(view: EditorView, fence: FenceRange) {
  const after = fenceEndPos(fence);
  if (after < view.state.doc.length) {
    const dest = view.state.doc.lineAt(Math.min(view.state.doc.length, after + 1)).from;
    view.dispatch({ selection: EditorSelection.cursor(dest), userEvent: "select" });
    view.focus();
    return true;
  }
  if (view.state.readOnly || view.state.facet(EditorView.editable) === false) return false;
  view.dispatch({
    changes: { from: after, insert: "\n" },
    selection: EditorSelection.cursor(after + 1),
    scrollIntoView: true,
    userEvent: "input",
  });
  view.focus();
  return true;
}

function clampFencePos(state: EditorState, pos: number) {
  const fence = findFenceAt(state, pos);
  if (!fence || !fence.hasBody || fence.language === "mermaid") return pos;
  const line = fenceLineAt(fence, pos);
  if (!line) return pos;
  return gapPosBesideFence(state, fence, line);
}

function clampRange(state: EditorState, range: SelectionRange) {
  if (!range.empty) return range;
  const head = clampFencePos(state, range.head);
  if (head === range.head) return range;
  return EditorSelection.cursor(head, range.assoc);
}

export function clampFencePointerSelection(state: EditorState, selection: EditorSelection) {
  let changed = false;
  const ranges = selection.ranges.map((range) => {
    const next = clampRange(state, range);
    if (next !== range) changed = true;
    return next;
  });
  return changed ? EditorSelection.create(ranges, selection.mainIndex) : selection;
}

export function setFenceLanguage(view: EditorView, fenceFrom: number, language: string) {
  if (view.state.readOnly) return false;
  const line = view.state.doc.lineAt(fenceFrom);
  const parsed = parseFenceLine(line.text);
  if (!parsed) return false;
  const info = language.trim();
  const insert = info ? `${parsed.indent}${parsed.marks}${info}` : `${parsed.indent}${parsed.marks}`;
  if (insert === line.text) return false;
  view.dispatch({
    changes: { from: line.from, to: line.to, insert },
    userEvent: "input.fence-lang",
  });
  return true;
}
