import { LanguageDescription } from "@codemirror/language";
import { languages } from "@codemirror/language-data";

const ALIASES: Record<string, string> = {
  curl: "shell",
  console: "shell",
  terminal: "shell",
  cmd: "shell",
};

export function fenceInfoName(info: string) {
  return info.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
}

export function fenceCodeLanguage(info: string) {
  const name = fenceInfoName(info);
  if (!name || name === "mermaid") return null;
  return LanguageDescription.matchLanguageName(languages, ALIASES[name] ?? name, true);
}

for (const name of ["javascript", "typescript", "java", "python", "shell", "json", "html", "css", "sql", "go", "rust", "yaml"]) {
  void fenceCodeLanguage(name)?.load();
}
