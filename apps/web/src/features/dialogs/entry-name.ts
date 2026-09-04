export function validateEntryName(name: string, kind: "file" | "directory"): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "名称不能为空";
  if (/[\\/]/.test(trimmed)) {
    return kind === "directory" ? "文件夹名不能包含路径分隔符" : "文件名不能包含路径分隔符";
  }
  if (trimmed === "." || trimmed === "..") return "名称无效";
  return null;
}

export function withMarkdownExtension(name: string): string {
  return name.toLocaleLowerCase().endsWith(".md") ? name : `${name}.md`;
}
