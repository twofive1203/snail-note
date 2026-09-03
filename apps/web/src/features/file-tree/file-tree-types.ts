import type { NotebookNode } from "@snail-note/shared";

export interface ActiveEntry {
  path: string;
  type: NotebookNode["type"];
}

export function parentPath(relativePath: string): string {
  const parts = relativePath.split("/");
  parts.pop();
  return parts.join("/");
}

export function joinNotebookPath(directory: string, name: string): string {
  return directory ? `${directory}/${name}` : name;
}

export function firstFile(nodes: NotebookNode[]): string | undefined {
  for (const node of nodes) {
    if (node.type === "file") return node.path;
    const nested = firstFile(node.children ?? []);
    if (nested) return nested;
  }
  return undefined;
}
