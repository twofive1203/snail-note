import { HighlightStyle, syntaxHighlighting, syntaxTree } from "@codemirror/language";
import { EditorSelection, EditorState, Prec, RangeSet, StateEffect, StateField, type Range } from "@codemirror/state";
import { BlockWrapper, Decoration, type DecorationSet, EditorView, keymap, ViewPlugin, WidgetType } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import { FenceLangWidget, closeFenceLangMenu } from "./code-block-lang";
import {
  clampFencePointerSelection,
  fenceEndsDocument,
  fenceLineAt,
  findFenceAt,
  gapPosBesideFence,
  insertLineAfterFence,
  type FenceRange,
} from "./code-fence";
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
  atoms: RangeSet<Decoration>;
};

const emptyVisuals: LivePreviewVisuals = {
  deco: Decoration.none,
  wrappers: BlockWrapper.set([]),
  atoms: RangeSet.empty,
};

const codeBlockWrapper = BlockWrapper.create({
  tagName: "div",
  attributes: { class: "sn-md-codeblock" },
});

function fencedCodeWrapper(active: boolean, from: number) {
  return BlockWrapper.create({
    tagName: "div",
    attributes: {
      class: active ? "sn-md-codeblock is-active" : "sn-md-codeblock",
      "data-sn-fence": String(from),
    },
  });
}

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
  atoms?: Range<Decoration>[],
) {
  const to = line.to < state.doc.length ? line.to + 1 : line.to;
  if (line.from >= to) return;
  replacedLines.add(line.from);
  const deco = Decoration.replace({ block: true }).range(line.from, to);
  ranges.push(deco);
  atoms?.push(deco);
}

function wrapLines(
  state: EditorState,
  fromLine: number,
  toLine: number,
  wrappers: Range<BlockWrapper>[],
  wrapper = codeBlockWrapper,
) {
  if (fromLine > toLine) return;
  const start = state.doc.line(fromLine).from;
  const endLine = state.doc.line(toLine);
  const end = endLine.to < state.doc.length ? endLine.to + 1 : state.doc.length;
  if (start >= end) return;
  wrappers.push(wrapper.range(start, end));
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
  const atoms: Range<Decoration>[] = [];
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
        const lang = fenceLanguage(state, node);
        const hideFences = lang !== "mermaid";
        const bodyFrom = openLine.number + 1;
        const bodyTo = closeLine ? closeLine.number - 1 : lastLine.number;
        const hasBody = bodyFrom <= bodyTo;
        let fromLine = openLine.number;
        let toLine = lastLine.number;
        if (hideFences && hasBody) {
          hideLine(state, openLine, ranges, replacedLines, atoms);
          if (closeLine) hideLine(state, closeLine, ranges, replacedLines, atoms);
          fromLine = bodyFrom;
          toLine = bodyTo;
          ranges.push(
            Decoration.widget({ widget: new FenceLangWidget(node.from, lang), side: 1 }).range(state.doc.line(bodyTo).to),
          );
        }
        wrapLines(state, fromLine, toLine, wrappers, fencedCodeWrapper(revealed, node.from));
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
    atoms: RangeSet.of(atoms, true),
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
        atoms: visuals.atoms.map(tr.changes),
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
    EditorView.atomicRanges.of((view) => view.state.field(field).atoms),
  ],
});

function visualCodeBlockAt(view: EditorView, x: number, y: number) {
  for (const el of view.contentDOM.querySelectorAll<HTMLElement>(".sn-md-codeblock")) {
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 && rect.height <= 0) continue;
    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return el;
  }
  return null;
}

function gapBetweenCodeBlocks(view: EditorView, y: number) {
  const blocks = [...view.contentDOM.querySelectorAll<HTMLElement>(".sn-md-codeblock")]
    .map((el) => ({ el, rect: el.getBoundingClientRect() }))
    .filter((item) => item.rect.height > 0)
    .sort((a, b) => a.rect.top - b.rect.top);
  for (let i = 0; i < blocks.length - 1; i += 1) {
    const above = blocks[i];
    const below = blocks[i + 1];
    if (!above || !below) continue;
    if (y > above.rect.bottom && y < below.rect.top) return { above: above.el, below: below.el };
  }
  return null;
}

function lastVisualCodeBlock(view: EditorView) {
  const blocks = [...view.contentDOM.querySelectorAll<HTMLElement>(".sn-md-codeblock")]
    .map((el) => ({ el, rect: el.getBoundingClientRect() }))
    .filter((item) => item.rect.height > 0)
    .sort((a, b) => a.rect.top - b.rect.top);
  return blocks[blocks.length - 1] ?? null;
}

function clickAfterLastFence(view: EditorView, clientY: number) {
  const last = lastVisualCodeBlock(view);
  if (!last || clientY <= last.rect.bottom) return false;
  const raw = last.el.getAttribute("data-sn-fence");
  if (raw == null) return false;
  const fenceFrom = Number(raw);
  if (!Number.isFinite(fenceFrom)) return false;
  const fence = findFenceAt(view.state, fenceFrom);
  if (!fence || !fenceEndsDocument(view.state, fence)) return false;
  return insertLineAfterFence(view, fence);
}

function exitTrailingFenceOnArrowDown(view: EditorView) {
  if (view.state.field(livePreviewEnabled, false) === false) return false;
  const range = view.state.selection.main;
  if (!range.empty) return false;
  const fence = findFenceAt(view.state, range.head);
  if (!fence?.hasBody || !fenceEndsDocument(view.state, fence)) return false;
  const lastBody = view.state.doc.lineAt(fence.bodyTo);
  if (view.state.doc.lineAt(range.head).number !== lastBody.number) return false;
  const coords = view.coordsAtPos(range.head);
  const endCoords = view.coordsAtPos(lastBody.to);
  if (coords && endCoords && coords.bottom < endCoords.top - 1) return false;
  return insertLineAfterFence(view, fence);
}

function gapPosForOutsideClick(view: EditorView, clientY: number, fence: FenceRange) {
  const el = view.contentDOM.querySelector<HTMLElement>(`.sn-md-codeblock[data-sn-fence="${fence.from}"]`);
  const rect = el?.getBoundingClientRect();
  if (rect && rect.height > 0) {
    if (clientY < rect.top) return gapPosBesideFence(view.state, fence, "open");
    if (clientY > rect.bottom) return gapPosBesideFence(view.state, fence, "close");
    return gapPosBesideFence(view.state, fence, Math.abs(clientY - rect.top) <= Math.abs(clientY - rect.bottom) ? "open" : "close");
  }
  return gapPosBesideFence(view.state, fence, "open");
}

function placeCursorInFenceBody(view: EditorView, clientX: number, clientY: number, fence: FenceRange) {
  const firstLine = view.state.doc.lineAt(fence.bodyFrom);
  const lastLine = view.state.doc.lineAt(fence.bodyTo);
  const firstCoords = view.coordsAtPos(firstLine.from);
  const line = firstCoords && clientY <= (firstCoords.top + firstCoords.bottom) / 2 ? firstLine : lastLine;
  const coords = view.coordsAtPos(line.from);
  if (!coords) {
    view.dispatch({
      selection: EditorSelection.cursor(line.to),
      userEvent: "select.pointer",
    });
    return true;
  }
  const mapped = view.posAtCoords({ x: clientX, y: (coords.top + coords.bottom) / 2 });
  const cursor =
    mapped != null && mapped >= line.from && mapped <= line.to ? mapped : mapped != null && mapped < line.from ? line.from : line.to;
  view.dispatch({ selection: EditorSelection.cursor(cursor), userEvent: "select.pointer" });
  return true;
}

function remapFencePaddingClick(event: MouseEvent, view: EditorView) {
  if (event.button !== 0 || event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return false;
  if (view.state.field(livePreviewEnabled, false) === false) return false;
  const target = event.target as HTMLElement | null;
  if (!target || target.closest(".sn-md-code-lang, .sn-md-code-lang-host, .sn-md-code-lang-menu")) return false;
  const x = event.clientX;
  const y = event.clientY;
  const block = target.closest(".sn-md-codeblock");
  const visual = visualCodeBlockAt(view, x, y);
  const onBlock = visual ?? (block && view.contentDOM.contains(block) ? block : null);
  if (onBlock) {
    const fenceFrom = Number(onBlock.getAttribute("data-sn-fence"));
    const fence = Number.isFinite(fenceFrom) ? findFenceAt(view.state, fenceFrom) : null;
    if (!fence?.hasBody || fence.language === "mermaid") return false;
    const pos = view.posAtCoords({ x, y });
    if (pos != null && pos >= fence.bodyFrom && pos <= fence.bodyTo) return false;
    return placeCursorInFenceBody(view, x, y, fence);
  }
  const between = gapBetweenCodeBlocks(view, y);
  if (between) {
    const belowFence = findFenceAt(view.state, Number(between.below.getAttribute("data-sn-fence")));
    const aboveFence = findFenceAt(view.state, Number(between.above.getAttribute("data-sn-fence")));
    const precise = view.posAtCoords({ x, y });
    let dest: number | null = null;
    if (precise != null) {
      const inAbove = aboveFence != null && precise >= aboveFence.bodyFrom && precise <= aboveFence.bodyTo;
      const inBelow = belowFence != null && precise >= belowFence.bodyFrom && precise <= belowFence.bodyTo;
      const onFence = Boolean(
        (aboveFence && fenceLineAt(aboveFence, precise)) || (belowFence && fenceLineAt(belowFence, precise)),
      );
      if (!inAbove && !inBelow && !onFence) dest = precise;
    }
    if (dest == null && belowFence?.hasBody) dest = gapPosBesideFence(view.state, belowFence, "open");
    if (dest == null && aboveFence?.hasBody) dest = gapPosBesideFence(view.state, aboveFence, "close");
    if (dest == null) return false;
    view.dispatch({ selection: EditorSelection.cursor(dest), userEvent: "select" });
    return true;
  }
  if (clickAfterLastFence(view, y)) return true;
  const pos = view.posAtCoords({ x, y }) ?? view.posAtCoords({ x, y }, false);
  if (pos == null) return false;
  const fence = findFenceAt(view.state, pos);
  if (!fence?.hasBody || fence.language === "mermaid") return false;
  const inBody = pos >= fence.bodyFrom && pos <= fence.bodyTo;
  if (!inBody && !fenceLineAt(fence, pos)) return false;
  view.dispatch({
    selection: EditorSelection.cursor(gapPosForOutsideClick(view, y, fence)),
    userEvent: "select",
  });
  return true;
}

const clampFencePointer = EditorState.transactionFilter.of((tr) => {
  if (!tr.selection || tr.docChanged || !tr.isUserEvent("select.pointer")) return tr;
  if (tr.startState.field(livePreviewEnabled, false) === false) return tr;
  const next = clampFencePointerSelection(tr.startState, tr.newSelection);
  if (next.eq(tr.newSelection)) return tr;
  return [tr, { selection: next }];
});

const fencePointerClick = Prec.highest(
  EditorView.domEventHandlers({
    mousedown(event, view) {
      return remapFencePaddingClick(event, view);
    },
  }),
);

const exitTrailingFenceKeymap = Prec.high(
  keymap.of([{ key: "ArrowDown", run: exitTrailingFenceOnArrowDown }]),
);

const livePreviewMouse = ViewPlugin.fromClass(
  class {
    private readonly onMouseDown: () => void;
    private readonly onMouseUp: () => void;
    private readonly onScrollerMouseDown: (event: MouseEvent) => void;

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
      this.onScrollerMouseDown = (event) => {
        const target = event.target as Node | null;
        if (!target || view.contentDOM.contains(target)) return;
        if (remapFencePaddingClick(event, view)) event.preventDefault();
      };
      view.contentDOM.addEventListener("mousedown", this.onMouseDown);
      view.scrollDOM.addEventListener("mousedown", this.onScrollerMouseDown);
      window.addEventListener("mouseup", this.onMouseUp);
    }

    destroy() {
      this.view.contentDOM.removeEventListener("mousedown", this.onMouseDown);
      this.view.scrollDOM.removeEventListener("mousedown", this.onScrollerMouseDown);
      window.removeEventListener("mouseup", this.onMouseUp);
      closeFenceLangMenu();
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

const liveCodeHighlight = syntaxHighlighting(
  HighlightStyle.define([
    { tag: t.keyword, class: "sn-md-tok-keyword" },
    { tag: t.moduleKeyword, class: "sn-md-tok-keyword" },
    { tag: t.controlKeyword, class: "sn-md-tok-keyword" },
    { tag: t.operatorKeyword, class: "sn-md-tok-keyword" },
    { tag: t.definitionKeyword, class: "sn-md-tok-keyword" },
    { tag: t.comment, class: "sn-md-tok-comment" },
    { tag: t.lineComment, class: "sn-md-tok-comment" },
    { tag: t.blockComment, class: "sn-md-tok-comment" },
    { tag: t.docComment, class: "sn-md-tok-comment" },
    { tag: t.string, class: "sn-md-tok-string" },
    { tag: t.special(t.string), class: "sn-md-tok-string" },
    { tag: t.character, class: "sn-md-tok-string" },
    { tag: t.number, class: "sn-md-tok-number" },
    { tag: t.bool, class: "sn-md-tok-number" },
    { tag: t.atom, class: "sn-md-tok-number" },
    { tag: t.literal, class: "sn-md-tok-number" },
    { tag: t.null, class: "sn-md-tok-number" },
    { tag: t.constant(t.name), class: "sn-md-tok-number" },
    { tag: t.standard(t.name), class: "sn-md-tok-number" },
    { tag: t.variableName, class: "sn-md-tok-variable" },
    { tag: t.constant(t.variableName), class: "sn-md-tok-variable" },
    { tag: t.special(t.variableName), class: "sn-md-tok-variable" },
    { tag: t.propertyName, class: "sn-md-tok-variable" },
    { tag: t.attributeName, class: "sn-md-tok-variable" },
    { tag: t.definition(t.variableName), class: "sn-md-tok-variable" },
    { tag: t.function(t.variableName), class: "sn-md-tok-function" },
    { tag: t.function(t.propertyName), class: "sn-md-tok-function" },
    { tag: t.className, class: "sn-md-tok-function" },
    { tag: t.typeName, class: "sn-md-tok-type" },
    { tag: t.namespace, class: "sn-md-tok-type" },
    { tag: t.macroName, class: "sn-md-tok-type" },
    { tag: t.operator, class: "sn-md-tok-operator" },
    { tag: t.regexp, class: "sn-md-tok-operator" },
    { tag: t.escape, class: "sn-md-tok-operator" },
    { tag: t.tagName, class: "sn-md-tok-tag" },
    { tag: t.angleBracket, class: "sn-md-tok-tag" },
    { tag: t.invalid, class: "sn-md-tok-tag" },
  ]),
);

export function livePreviewExtensions(enabled = true) {
  return [
    mouseSelecting,
    livePreviewEnabled.init(() => enabled),
    livePreviewDecorations,
    liveHighlight,
    liveCodeHighlight,
    livePreviewMouse,
    clampFencePointer,
    fencePointerClick,
    exitTrailingFenceKeymap,
  ];
}
