import { Prec } from "@codemirror/state";
import { EditorView, ViewPlugin } from "@codemirror/view";
import { notebookApi } from "../file-tree/file-tree-api";
import { clipboardHtmlToMarkdown } from "./html-to-markdown";
import { markdownLinkDestination } from "./image-url";
import { fileToBase64, localizeMarkdownImages } from "./localize-images";
import { noteImageContextFacet } from "./note-image-context";

const IMAGE_FILE = /^image\/(png|jpe?g|gif|webp)$/i;

function hasShiftKey(event: Event): boolean {
  return "shiftKey" in event && Boolean((event as { shiftKey: boolean }).shiftKey);
}

function clipboardImageFiles(data: DataTransfer): File[] {
  return [...(data.files ?? [])].filter((file) => IMAGE_FILE.test(file.type));
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
      const data = event.clipboardData;
      if (!data) return false;
      const images = clipboardImageFiles(data);
      const html = data.getData("text/html");
      const markdown = html ? clipboardHtmlToMarkdown(html) : null;
      const context = view.state.facet(noteImageContextFacet);
      if (images.length && context) {
        void insertLocalized(view, { context, images, markdown: "" });
        return true;
      }
      if (markdown == null) return false;
      if (context) {
        void insertLocalized(view, { context, images: [], markdown });
        return true;
      }
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

async function insertLocalized(
  view: EditorView,
  input: { context: { notebookId: string; notePath: string }; images: File[]; markdown: string },
) {
  const parts: string[] = [];
  for (const file of input.images) {
    try {
      const data = await fileToBase64(file);
      const saved = await notebookApi.saveAsset(input.context.notebookId, {
        notePath: input.context.notePath,
        data,
      });
      parts.push(`![](${markdownLinkDestination(saved.markdownPath)})`);
    } catch {
      // Keep going so a single failed screenshot does not block the rest of the paste.
    }
  }
  let markdown = input.markdown;
  if (markdown) {
    try {
      markdown = await localizeMarkdownImages(markdown, input.context);
    } catch {
      // Fall back to the converted Markdown with remote URLs.
    }
  }
  const text = [...parts, markdown].filter(Boolean).join("\n\n");
  if (!text || view.state.readOnly) return;
  view.dispatch(view.state.replaceSelection(text), {
    userEvent: "input.paste",
    scrollIntoView: true,
  });
}

export function pasteMarkdownExtension() {
  return Prec.high(pasteMarkdown);
}
