import { Prec } from "@codemirror/state";
import { EditorView, ViewPlugin } from "@codemirror/view";
import { clipboardHtmlToMarkdown } from "./html-to-markdown";

function hasShiftKey(event: Event): boolean {
  return "shiftKey" in event && Boolean((event as { shiftKey: boolean }).shiftKey);
}

const pasteMarkdown = ViewPlugin.fromClass(
  class {
    private plainUntil = 0;

    markPlainPaste(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "v") {
        this.plainUntil = Date.now() + 2000;
      }
    }

    pasteHtml(event: ClipboardEvent, view: EditorView): boolean {
      const wantPlain = hasShiftKey(event) || Date.now() < this.plainUntil;
      this.plainUntil = 0;
      if (wantPlain || view.state.readOnly) return false;
      const html = event.clipboardData?.getData("text/html");
      if (!html) return false;
      const markdown = clipboardHtmlToMarkdown(html);
      if (markdown == null) return false;
      view.dispatch(view.state.replaceSelection(markdown), {
        userEvent: "input.paste",
        scrollIntoView: true,
      });
      return true;
    }
  },
  {
    eventHandlers: {
      keydown(event) {
        this.markPlainPaste(event);
        return false;
      },
      paste(event, view) {
        return this.pasteHtml(event, view);
      },
    },
  },
);

export function pasteMarkdownExtension() {
  return Prec.high(pasteMarkdown);
}
