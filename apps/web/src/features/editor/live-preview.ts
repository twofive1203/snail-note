import { HighlightStyle, syntaxHighlighting, syntaxTree } from "@codemirror/language";
import { StateEffect, StateField, type EditorState, type Range } from "@codemirror/state";
import { BlockWrapper, Decoration, type DecorationSet, EditorView, ViewPlugin, WidgetType } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import { mountMermaid } from "./mermaid-render";

const HIDDEN_MARKS = new Set([
  "HeaderMark",
  "EmphasisMark",
  "CodeMark",
  "StrikethroughMark",
  "LinkMark",
  "QuoteMark",
]);

const HEADING_LINE_CLASS: Record<string, string> = {
  ATXHeading1: "sn-md-h1",
  ATXHeading2: "sn-md-h2",
  ATXHeading3: "sn-md-h3",
  ATXHeading4: "sn-md-h4",
  ATXHeading5: "sn-md-h5",
  ATXHeading6: "sn-md-h6",
  SetextHeading1: "sn-md-h1",
  SetextHeading2: "sn-md-h2",
};

const hideMark = Decoration.replace({});

const setMouseSelecting = StateEffect.define<boolean>();

const mouseSelecting = StateField.define<boolean>({
  create: () => false,
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setMouseSelecting)) return effect.value;
    }
    return value;
  },
});

class CheckboxWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly from: number,
  ) {
    super();
  }

  eq(other: CheckboxWidget) {
    return this.checked === other.checked && this.from === other.from;
  }

  toDOM(view: EditorView) {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = this.checked;
    input.tabIndex = -1;
    input.className = "sn-md-checkbox";
    input.setAttribute("aria-label", this.checked ? "已完成" : "未完成");
    input.addEventListener("change", () => {
      view.dispatch({
        changes: { from: this.from, to: this.from + 3, insert: this.checked ? "[ ]" : "[x]" },
      });
    });
    return input;
  }

  ignoreEvent() {
    return false;
  }
}

class RuleWidget extends WidgetType {
  eq() {
    return true;
  }

  toDOM() {
    const rule = document.createElement("hr");
    rule.className = "sn-md-hr";
    return rule;
  }

  ignoreEvent() {
    return true;
  }
}

class MermaidWidget extends WidgetType {
  constructor(readonly source: string) {
    super();
  }

  eq(other: MermaidWidget) {
    return this.source === other.source;
  }

  toDOM() {
    const host = document.createElement("div");
    host.className = "sn-md-mermaid";
    host.setAttribute("role", "img");
    host.setAttribute("aria-label", "Mermaid 图");
    void mountMermaid(host, this.source);
    return host;
  }

  ignoreEvent() {
    return false;
  }

  get estimatedHeight() {
    return 180;
  }
}

function isRevealed(state: EditorState, from: number, to: number) {
  const revealFrom = state.doc.lineAt(from).from;
  const revealTo = state.doc.lineAt(Math.max(from, to - 1)).to;
  for (const range of state.selection.ranges) {
    if (range.from <= revealTo && range.to >= revealFrom) return true;
  }
  return false;
}

function inCodeBlock(node: { parent: { name: string; parent: unknown } | null }) {
  for (let parent = node.parent; parent; parent = parent.parent as typeof parent) {
    if (parent.name === "FencedCode" || parent.name === "CodeBlock" || parent.name === "IndentedCode") return true;
  }
  return false;
}

function coveringLines(state: EditorState, from: number, to: number) {
  const start = state.doc.lineAt(from).from;
  const endLine = state.doc.lineAt(Math.max(from, to - 1));
  const end = endLine.to < state.doc.length ? endLine.to + 1 : endLine.to;
  return { from: start, to: end };
}

function fenceLanguage(state: EditorState, node: { node: { getChild(name: string): { from: number; to: number } | null } }) {
  const info = node.node.getChild("CodeInfo");
  if (!info) return "";
  return state.doc.sliceString(info.from, info.to).trim().split(/\s+/)[0]?.toLowerCase() ?? "";
}

function fenceBody(state: EditorState, node: { node: { getChildren(name: string): { from: number; to: number }[] } }) {
  const parts = node.node.getChildren("CodeText");
  const first = parts[0];
  const last = parts[parts.length - 1];
  if (!first || !last) return "";
  return state.doc.sliceString(first.from, last.to);
}

type LivePreviewVisuals = {
  deco: DecorationSet;
  wrappers: ReturnType<typeof BlockWrapper.set>;
};

const emptyVisuals: LivePreviewVisuals = {
  deco: Decoration.none,
  wrappers: BlockWrapper.set([]),
};

const codeBlockWrapper = BlockWrapper.create({
  tagName: "div",
  attributes: { class: "sn-md-codeblock" },
});

function closingFenceLine(
  state: EditorState,
  node: { from: number; node: { getChildren(name: string): { from: number }[] } },
) {
  const openNumber = state.doc.lineAt(node.from).number;
  const marks = node.node.getChildren("CodeMark");
  for (let i = marks.length - 1; i >= 0; i -= 1) {
    const mark = marks[i];
    if (!mark) continue;
    const line = state.doc.lineAt(mark.from);
    if (line.number !== openNumber) return line;
  }
  return null;
}

function hideLine(
  state: EditorState,
  line: { from: number; to: number },
  ranges: Range<Decoration>[],
  replacedLines: Set<number>,
) {
  const to = line.to < state.doc.length ? line.to + 1 : line.to;
  if (line.from >= to) return;
  replacedLines.add(line.from);
  ranges.push(Decoration.replace({ block: true }).range(line.from, to));
}

function wrapLines(state: EditorState, fromLine: number, toLine: number, wrappers: Range<BlockWrapper>[]) {
  if (fromLine > toLine) return;
  const start = state.doc.line(fromLine).from;
  const endLine = state.doc.line(toLine);
  const end = endLine.to < state.doc.length ? endLine.to + 1 : state.doc.length;
  if (start >= end) return;
  wrappers.push(codeBlockWrapper.range(start, end));
}

function safeBuildVisuals(state: EditorState) {
  try {
    return buildVisuals(state);
  } catch (error) {
    console.error("Failed to build live preview decorations", error);
    return emptyVisuals;
  }
}

function buildVisuals(state: EditorState): LivePreviewVisuals {
  const ranges: Range<Decoration>[] = [];
  const wrappers: Range<BlockWrapper>[] = [];
  const lineClasses = new Map<number, string[]>();
  const replacedLines = new Set<number>();

  const addLineClass = (pos: number, className: string) => {
    const lineFrom = state.doc.lineAt(pos).from;
    const classes = lineClasses.get(lineFrom) ?? [];
    if (!classes.includes(className)) classes.push(className);
    lineClasses.set(lineFrom, classes);
  };

  const addLineClasses = (from: number, to: number, className: string) => {
    const start = state.doc.lineAt(from).number;
    const end = state.doc.lineAt(Math.max(from, to - 1)).number;
    for (let number = start; number <= end; number += 1) {
      addLineClass(state.doc.line(number).from, className);
    }
  };

  syntaxTree(state).iterate({
    enter(node) {
      const headingClass = HEADING_LINE_CLASS[node.name];
      if (headingClass) addLineClasses(node.from, node.to, headingClass);
      if (node.name === "Blockquote") addLineClasses(node.from, node.to, "sn-md-quote");

      if (node.name === "FencedCode") {
        const revealed = isRevealed(state, node.from, node.to);
        if (fenceLanguage(state, node) === "mermaid" && !revealed) {
          const range = coveringLines(state, node.from, node.to);
          if (range.from < range.to) {
            for (let pos = range.from; pos < range.to; ) {
              const line = state.doc.lineAt(pos);
              replacedLines.add(line.from);
              pos = line.to < state.doc.length ? line.to + 1 : range.to;
            }
            ranges.push(
              Decoration.replace({
                widget: new MermaidWidget(fenceBody(state, node)),
                block: true,
              }).range(range.from, range.to),
            );
          }
          return false;
        }

        const openLine = state.doc.lineAt(node.from);
        const lastLine = state.doc.lineAt(Math.max(node.from, node.to - 1));
        const closeLine = closingFenceLine(state, node);
        let fromLine = openLine.number;
        let toLine = lastLine.number;
        if (!revealed) {
          const bodyFrom = openLine.number + 1;
          const bodyTo = closeLine ? closeLine.number - 1 : lastLine.number;
          if (bodyFrom <= bodyTo) {
            hideLine(state, openLine, ranges, replacedLines);
            if (closeLine) hideLine(state, closeLine, ranges, replacedLines);
            fromLine = bodyFrom;
            toLine = bodyTo;
          }
        }
        wrapLines(state, fromLine, toLine, wrappers);
        return false;
      }

      if (node.name === "CodeBlock") {
        wrapLines(
          state,
          state.doc.lineAt(node.from).number,
          state.doc.lineAt(Math.max(node.from, node.to - 1)).number,
          wrappers,
        );
        return false;
      }

      if (isRevealed(state, node.from, node.to) || inCodeBlock(node.node)) return;

      if (node.name === "TaskMarker") {
        const marker = state.doc.sliceString(node.from, node.to);
        ranges.push(
          Decoration.replace({
            widget: new CheckboxWidget(/\[x\]/i.test(marker), node.from),
            atomic: true,
          }).range(node.from, node.to),
        );
        return;
      }

      if (node.name === "HorizontalRule") {
        ranges.push(Decoration.replace({ widget: new RuleWidget(), atomic: true }).range(node.from, node.to));
        return;
      }

      if (HIDDEN_MARKS.has(node.name)) {
        if (node.name === "CodeMark" && node.node.parent?.name !== "InlineCode") return;
        if (node.from < node.to) ranges.push(hideMark.range(node.from, node.to));
        return;
      }

      if ((node.name === "URL" || node.name === "LinkTitle") && node.node.parent?.name !== "Autolink" && node.from < node.to) {
        ranges.push(hideMark.range(node.from, node.to));
      }
    },
  });

  for (const [from, classes] of lineClasses) {
    if (replacedLines.has(from)) continue;
    ranges.push(Decoration.line({ class: classes.join(" ") }).range(from));
  }

  return {
    deco: Decoration.set(ranges, true),
    wrappers: BlockWrapper.set(wrappers, true),
  };
}

const setLivePreviewEnabled = StateEffect.define<boolean>();

const livePreviewEnabled = StateField.define<boolean>({
  create: () => true,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setLivePreviewEnabled)) return effect.value;
    }
    return value;
  },
});

export function livePreviewEnabledEffect(enabled: boolean) {
  return setLivePreviewEnabled.of(enabled);
}

const livePreviewDecorations = StateField.define<LivePreviewVisuals>({
  create(state) {
    return state.field(livePreviewEnabled, false) === false ? emptyVisuals : safeBuildVisuals(state);
  },
  update(visuals, tr) {
    if (!tr.state.field(livePreviewEnabled)) return emptyVisuals;
    const selecting = tr.state.field(mouseSelecting);
    if (selecting) {
      return {
        deco: visuals.deco.map(tr.changes),
        wrappers: visuals.wrappers.map(tr.changes),
      };
    }
    if (tr.docChanged || !tr.startState.selection.eq(tr.state.selection) || tr.startState.field(mouseSelecting) || !tr.startState.field(livePreviewEnabled)) {
      return safeBuildVisuals(tr.state);
    }
    return visuals;
  },
  provide: (field) => [
    EditorView.decorations.from(field, (value) => value.deco),
    EditorView.blockWrappers.from(field, (value) => value.wrappers),
  ],
});

const livePreviewMouse = ViewPlugin.fromClass(
  class {
    private readonly onMouseDown: () => void;
    private readonly onMouseUp: () => void;

    constructor(private readonly view: EditorView) {
      this.onMouseDown = () => {
        if (!view.state.field(mouseSelecting)) {
          view.dispatch({ effects: setMouseSelecting.of(true) });
        }
      };
      this.onMouseUp = () => {
        if (view.state.field(mouseSelecting)) {
          view.dispatch({ effects: setMouseSelecting.of(false) });
        }
      };
      view.contentDOM.addEventListener("mousedown", this.onMouseDown);
      window.addEventListener("mouseup", this.onMouseUp);
    }

    destroy() {
      this.view.contentDOM.removeEventListener("mousedown", this.onMouseDown);
      window.removeEventListener("mouseup", this.onMouseUp);
    }
  },
);

const liveHighlight = syntaxHighlighting(
  HighlightStyle.define([
    { tag: t.heading1, class: "sn-md-h1" },
    { tag: t.heading2, class: "sn-md-h2" },
    { tag: t.heading3, class: "sn-md-h3" },
    { tag: t.heading4, class: "sn-md-h4" },
    { tag: t.heading5, class: "sn-md-h5" },
    { tag: t.heading6, class: "sn-md-h6" },
    { tag: t.strong, class: "sn-md-strong" },
    { tag: t.emphasis, class: "sn-md-em" },
    { tag: t.strikethrough, class: "sn-md-strike" },
    { tag: t.monospace, class: "sn-md-code" },
    { tag: t.link, class: "sn-md-link" },
    { tag: t.url, class: "sn-md-link" },
    { tag: t.quote, class: "sn-md-quote-text" },
    { tag: t.processingInstruction, class: "sn-md-mark" },
    { tag: t.contentSeparator, class: "sn-md-mark" },
    { tag: t.meta, class: "sn-md-mark" },
    { tag: t.labelName, class: "sn-md-mark" },
  ]),
);

export function livePreviewExtensions(enabled = true) {
  return [mouseSelecting, livePreviewEnabled.init(() => enabled), livePreviewDecorations, liveHighlight, livePreviewMouse];
}
