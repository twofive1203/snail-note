import { HighlightStyle, syntaxHighlighting, syntaxTree } from "@codemirror/language";
import { EditorSelection, EditorState, Prec, RangeSet, StateEffect, StateField, type Range } from "@codemirror/state";
import { BlockWrapper, Decoration, type DecorationSet, EditorView, keymap, ViewPlugin, WidgetType } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import { FenceLangWidget, closeFenceLangMenu } from "./code-block-lang";
import {
  clampFencePointerSelection,
  fenceEndsDocument,
  findFenceAt,
  gapPosBesideFence,
  insertLineAfterFence,
  type FenceRange,
} from "./code-fence";
import { toDisplayImageSrc } from "./image-url";
import { mountMermaid } from "./mermaid-render";
import { noteImageContextFacet } from "./note-image-context";

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

class ImageWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly alt: string,
  ) {
    super();
  }

  eq(other: ImageWidget) {
    return this.src === other.src && this.alt === other.alt;
  }

  toDOM(view: EditorView) {
    const host = document.createElement("div");
    host.className = "sn-md-image";
    const img = document.createElement("img");
    img.src = this.src;
    img.alt = this.alt;
    img.setAttribute("referrerpolicy", "no-referrer");
    img.draggable = false;
    img.addEventListener("load", () => view.requestMeasure());
    img.addEventListener("error", () => {
      host.classList.add("is-error");
      if (!host.querySelector(".sn-md-image-fallback")) {
        const fallback = document.createElement("div");
        fallback.className = "sn-md-image-fallback";
        fallback.textContent = this.alt ? `${this.alt}（图片无法加载）` : "图片无法加载";
        host.append(fallback);
      }
      view.requestMeasure();
    });
    host.append(img);
    return host;
  }

  ignoreEvent() {
    return false;
  }

  get estimatedHeight() {
    return 180;
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

function addImageWidget(
  state: EditorState,
  node: { from: number; to: number; node: { getChild(name: string): { from: number; to: number } | null } },
  ranges: Range<Decoration>[],
  replacedLines: Set<number>,
): boolean {
  const urlNode = node.node.getChild("URL");
  if (!urlNode) return false;
  const src = toDisplayImageSrc(state.doc.sliceString(urlNode.from, urlNode.to), state.facet(noteImageContextFacet));
  if (!src) return false;
  const raw = state.doc.sliceString(node.from, node.to);
  const closing = raw.indexOf("]");
  const alt = raw.startsWith("![") && closing > 1 ? raw.slice(2, closing) : "";
  const widget = new ImageWidget(src, alt);
  const line = state.doc.lineAt(node.from);
  if (line.text.trim() === raw) {
    const to = line.to < state.doc.length ? line.to + 1 : line.to;
    if (line.from >= to) return false;
    replacedLines.add(line.from);
    ranges.push(
      Decoration.replace({
        widget,
        block: true,
        inclusiveStart: true,
        inclusiveEnd: false,
      }).range(line.from, to),
    );
    return true;
  }
  if (node.from >= node.to) return false;
  ranges.push(Decoration.replace({ widget, atomic: true }).range(node.from, node.to));
  return true;
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

function fencedCodeWrapper(active: boolean, from: number, language = "") {
  return BlockWrapper.create({
    tagName: "div",
    attributes: {
      class: active ? "sn-md-codeblock is-active" : "sn-md-codeblock",
      "data-sn-fence": String(from),
      "data-sn-lang": language,
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
  // inclusiveEnd must stay false so an empty body line starting at `to` is not
  // swallowed by the hidden fence's atomic range (which would block typing).
  const deco = Decoration.replace({ block: true, inclusiveStart: true, inclusiveEnd: false }).range(line.from, to);
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
          // Keep the language switcher off empty body lines. An inline widget on a
          // blank line sits at the caret and, being contenteditable=false, swallows typing.
          let widgetLine = state.doc.line(bodyTo);
          for (let number = bodyTo; number >= bodyFrom; number -= 1) {
            const line = state.doc.line(number);
            if (line.from < line.to) {
              widgetLine = line;
              break;
            }
          }
          if (widgetLine.from < widgetLine.to) {
            ranges.push(
              Decoration.widget({ widget: new FenceLangWidget(node.from, lang), side: 1 }).range(widgetLine.to),
            );
          }
        }
        // An unclosed ``` line has no body yet; wrapping it would show the marks
        // inside a code block with the caret sitting after ```.
        if (hasBody || closeLine) {
          wrapLines(state, fromLine, toLine, wrappers, fencedCodeWrapper(revealed, node.from, lang));
        }
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

      if (node.name === "Image" && addImageWidget(state, node, ranges, replacedLines)) return false;

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
    if (tr.docChanged || !tr.startState.selection.eq(tr.state.selection) || tr.startState.field(mouseSelecting) || !tr.startState.field(livePreviewEnabled) || tr.startState.facet(noteImageContextFacet) !== tr.state.facet(noteImageContextFacet)) {
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

function visibleCodeBlocks(view: EditorView) {
  return [...view.contentDOM.querySelectorAll<HTMLElement>(".sn-md-codeblock")]
    .map((el) => ({ el, rect: el.getBoundingClientRect() }))
    .filter((item) => item.rect.height > 0)
    .sort((a, b) => a.rect.top - b.rect.top);
}

function visibleLineRect(block: HTMLElement, which: "first" | "last") {
  const lines = [...block.querySelectorAll<HTMLElement>(".cm-line")];
  const ordered = which === "first" ? lines : [...lines].reverse();
  for (const line of ordered) {
    const rect = line.getBoundingClientRect();
    if (rect.height > 0) return rect;
  }
  return null;
}

function fenceForBlock(view: EditorView, el: HTMLElement) {
  const fenceFrom = Number(el.getAttribute("data-sn-fence"));
  if (!Number.isFinite(fenceFrom)) return null;
  const fence = findFenceAt(view.state, fenceFrom);
  if (!fence?.hasBody || fence.language === "mermaid") return null;
  return fence;
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

function lineClosestToY(view: EditorView, fromLine: number, toLine: number, clientY: number) {
  let best = view.state.doc.line(fromLine);
  let bestDist = Infinity;
  for (let number = fromLine; number <= toLine; number += 1) {
    const line = view.state.doc.line(number);
    const coords = view.coordsAtPos(line.from) ?? view.coordsAtPos(line.to);
    if (!coords) continue;
    const dist = clientY < coords.top ? coords.top - clientY : clientY > coords.bottom ? clientY - coords.bottom : 0;
    if (dist < bestDist) {
      bestDist = dist;
      best = line;
    }
  }
  return best;
}

function cursorOnLine(view: EditorView, line: { from: number; to: number }, clientX: number) {
  const coords = view.coordsAtPos(line.from) ?? view.coordsAtPos(line.to);
  if (!coords) return line.to;
  const mapped = view.posAtCoords({ x: clientX, y: (coords.top + coords.bottom) / 2 });
  if (mapped == null) return line.to;
  if (mapped < line.from) return line.from;
  if (mapped > line.to) return line.to;
  return mapped;
}

function selectPreviewCursor(view: EditorView, pos: number, userEvent = "select") {
  view.dispatch({ selection: EditorSelection.cursor(pos), userEvent });
  view.focus();
  return true;
}

function cursorAfterFence(view: EditorView, fence: FenceRange) {
  if (fenceEndsDocument(view.state, fence)) return insertLineAfterFence(view, fence);
  return selectPreviewCursor(view, gapPosBesideFence(view.state, fence, "close"));
}

function cursorBeforeFence(view: EditorView, fence: FenceRange) {
  return selectPreviewCursor(view, gapPosBesideFence(view.state, fence, "open"));
}

function placeCursorInFenceBody(view: EditorView, clientX: number, clientY: number, fence: FenceRange) {
  const firstLine = view.state.doc.lineAt(fence.bodyFrom);
  const lastLine = view.state.doc.lineAt(fence.bodyTo);
  const pos = view.posAtCoords({ x: clientX, y: clientY });
  const cursor =
    pos != null && pos >= fence.bodyFrom && pos <= fence.bodyTo
      ? pos
      : cursorOnLine(view, lineClosestToY(view, firstLine.number, lastLine.number, clientY), clientX);
  return selectPreviewCursor(view, cursor);
}

function remapFencePaddingClick(event: MouseEvent, view: EditorView) {
  if (event.button !== 0 || event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return false;
  if (view.state.field(livePreviewEnabled, false) === false) return false;
  const target = event.target as HTMLElement | null;
  if (!target || target.closest(".sn-md-code-lang, .sn-md-code-lang-host, .sn-md-code-lang-menu")) return false;
  const x = event.clientX;
  const y = event.clientY;
  const blocks = visibleCodeBlocks(view);
  const closestBlock = target.closest(".sn-md-codeblock");
  const containing =
    blocks.find((item) => x >= item.rect.left && x <= item.rect.right && y >= item.rect.top && y <= item.rect.bottom) ??
    (closestBlock && view.contentDOM.contains(closestBlock) ? { el: closestBlock as HTMLElement, rect: (closestBlock as HTMLElement).getBoundingClientRect() } : null);

  if (containing) {
    const fence = fenceForBlock(view, containing.el);
    if (!fence) return false;
    const lastLine = visibleLineRect(containing.el, "last");
    const firstLine = visibleLineRect(containing.el, "first");
    if (lastLine && y > lastLine.bottom) return cursorAfterFence(view, fence);
    if (firstLine && y < firstLine.top) return cursorBeforeFence(view, fence);
    return placeCursorInFenceBody(view, x, y, fence);
  }

  const above = [...blocks].reverse().find((item) => y > item.rect.bottom);
  if (above) {
    const fence = fenceForBlock(view, above.el);
    const next = blocks.find((item) => item.el !== above.el && item.rect.top >= above.rect.bottom - 1);
    if (fence && (!next || y < next.rect.top)) {
      const pos = view.posAtCoords({ x, y }) ?? view.posAtCoords({ x, y }, false);
      const fenceEnd = fence.close ? fence.close.to : fence.to;
      if (pos == null || (pos >= fence.from && pos <= fenceEnd)) return cursorAfterFence(view, fence);
    }
  }

  const first = blocks[0];
  if (first && y < first.rect.top) {
    const fence = fenceForBlock(view, first.el);
    if (fence) {
      const pos = view.posAtCoords({ x, y }) ?? view.posAtCoords({ x, y }, false);
      const fenceEnd = fence.close ? fence.close.to : fence.to;
      if (pos == null || (pos >= fence.from && pos <= fenceEnd)) return cursorBeforeFence(view, fence);
    }
  }
  return false;
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
