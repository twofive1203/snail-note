import type { SearchMatch } from "@snail-note/shared";
import { NotebookService } from "../notebook/notebook-service.js";

export class SearchService {
  constructor(private readonly notebook: NotebookService) {}

  async search(rawQuery: string): Promise<SearchMatch[]> {
    const query = rawQuery.trim();
    if (!query) return [];

    const normalizedQuery = query.toLocaleLowerCase();
    const files = await this.notebook.listMarkdownFiles();
    const matches: SearchMatch[] = [];

    for (const file of files) {
      try {
        const document = await this.notebook.readNote(file);
        const lines = document.content.split(/\r?\n/);
        const firstHeading = lines.find((line) => /^#\s+/.test(line))?.replace(/^#\s+/, "").trim();
        const lineIndex = lines.findIndex((line) => line.toLocaleLowerCase().includes(normalizedQuery));
        if (lineIndex === -1) continue;
        const line = lines[lineIndex] ?? "";
        const matchIndex = line.toLocaleLowerCase().indexOf(normalizedQuery);
        const start = Math.max(0, matchIndex - 40);
        const end = Math.min(line.length, matchIndex + query.length + 80);
        matches.push({
          path: file,
          title: firstHeading || file.split("/").at(-1)?.replace(/\.md$/i, "") || file,
          snippet: `${start > 0 ? "…" : ""}${line.slice(start, end)}${end < line.length ? "…" : ""}`,
          line: lineIndex + 1,
        });
      } catch {
        // An unreadable file should not make the rest of the notebook unsearchable.
      }
    }

    return matches;
  }
}
