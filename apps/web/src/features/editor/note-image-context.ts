import { Facet } from "@codemirror/state";
import type { NoteImageContext } from "./image-url";

export const noteImageContextFacet = Facet.define<NoteImageContext | null, NoteImageContext | null>({
  combine(values) {
    return values.at(-1) ?? null;
  },
});
