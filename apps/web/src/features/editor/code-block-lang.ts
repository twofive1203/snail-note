import { WidgetType, type EditorView } from "@codemirror/view";
import { setFenceLanguage } from "./code-fence";

export const FENCE_LANGUAGE_CHOICES: { value: string; label: string }[] = [
  { value: "", label: "纯文本" },
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "python", label: "Python" },
  { value: "java", label: "Java" },
  { value: "go", label: "Go" },
  { value: "rust", label: "Rust" },
  { value: "c", label: "C" },
  { value: "cpp", label: "C++" },
  { value: "csharp", label: "C#" },
  { value: "shell", label: "Shell" },
  { value: "bash", label: "Bash" },
  { value: "json", label: "JSON" },
  { value: "yaml", label: "YAML" },
  { value: "html", label: "HTML" },
  { value: "css", label: "CSS" },
  { value: "sql", label: "SQL" },
  { value: "markdown", label: "Markdown" },
  { value: "xml", label: "XML" },
  { value: "toml", label: "TOML" },
  { value: "ruby", label: "Ruby" },
  { value: "php", label: "PHP" },
  { value: "swift", label: "Swift" },
  { value: "kotlin", label: "Kotlin" },
  { value: "mermaid", label: "Mermaid" },
];

export function fenceLanguageLabel(language: string) {
  if (!language) return "纯文本";
  const known = FENCE_LANGUAGE_CHOICES.find((item) => item.value === language);
  return known?.label ?? language;
}

type OpenMenu = {
  button: HTMLElement;
  close: () => void;
};

let openMenu: OpenMenu | null = null;

export function closeFenceLangMenu() {
  openMenu?.close();
  openMenu = null;
}

function filteredChoices(query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return FENCE_LANGUAGE_CHOICES;
  return FENCE_LANGUAGE_CHOICES.filter(
    (item) => item.value.includes(needle) || item.label.toLowerCase().includes(needle),
  );
}

function placeMenu(menu: HTMLElement, button: HTMLElement) {
  const rect = button.getBoundingClientRect();
  const width = 200;
  const left = Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8);
  menu.style.left = `${left}px`;
  const below = rect.bottom + 6;
  menu.style.top = `${below}px`;
  const menuHeight = menu.getBoundingClientRect().height;
  if (below + menuHeight > window.innerHeight - 8 && rect.top > menuHeight + 8) {
    menu.style.top = `${rect.top - menuHeight - 6}px`;
  }
}

function openFenceLangMenu(view: EditorView, button: HTMLElement, fenceFrom: number, language: string) {
  if (openMenu?.button === button) {
    closeFenceLangMenu();
    return;
  }
  closeFenceLangMenu();

  const menu = document.createElement("div");
  menu.className = "sn-md-code-lang-menu";
  menu.setAttribute("role", "listbox");
  menu.setAttribute("aria-label", "切换代码语言");

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "搜索或输入语言";
  input.value = language;
  input.setAttribute("aria-label", "代码语言");

  const list = document.createElement("div");
  list.className = "sn-md-code-lang-options";

  const apply = (value: string) => {
    setFenceLanguage(view, fenceFrom, value);
    closeFenceLangMenu();
    view.focus();
  };

  const render = () => {
    const query = input.value;
    const choices = filteredChoices(query);
    list.replaceChildren();
    for (const choice of choices) {
      const option = document.createElement("button");
      option.type = "button";
      option.setAttribute("role", "option");
      option.textContent = choice.label;
      if (choice.value === language) option.className = "is-current";
      option.addEventListener("click", () => apply(choice.value));
      list.appendChild(option);
    }
    if (!choices.some((choice) => choice.value === query.trim()) && query.trim()) {
      const custom = document.createElement("button");
      custom.type = "button";
      custom.setAttribute("role", "option");
      custom.textContent = `使用 “${query.trim()}”`;
      custom.addEventListener("click", () => apply(query.trim()));
      list.prepend(custom);
    }
  };

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      apply(input.value.trim());
    }
    if (event.key === "Escape") {
      event.preventDefault();
      closeFenceLangMenu();
      view.focus();
    }
  });
  input.addEventListener("input", render);

  menu.append(input, list);
  menu.addEventListener("mousedown", (event) => event.preventDefault());
  document.body.appendChild(menu);
  render();
  placeMenu(menu, button);
  button.classList.add("is-open");
  input.focus();
  input.select();

  const onPointerDown = (event: PointerEvent) => {
    const target = event.target as Node | null;
    if (target && (menu.contains(target) || button.contains(target))) return;
    closeFenceLangMenu();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      closeFenceLangMenu();
      view.focus();
    }
  };
  const onScroll = () => closeFenceLangMenu();

  window.addEventListener("pointerdown", onPointerDown, true);
  window.addEventListener("keydown", onKeyDown, true);
  view.scrollDOM.addEventListener("scroll", onScroll);

  openMenu = {
    button,
    close: () => {
      button.classList.remove("is-open");
      menu.remove();
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
      view.scrollDOM.removeEventListener("scroll", onScroll);
    },
  };
}

export class FenceLangWidget extends WidgetType {
  constructor(
    readonly fenceFrom: number,
    readonly language: string,
  ) {
    super();
  }

  eq(other: FenceLangWidget) {
    return this.fenceFrom === other.fenceFrom && this.language === other.language;
  }

  toDOM(view: EditorView) {
    const button = document.createElement("span");
    button.className = "sn-md-code-lang";
    button.tabIndex = -1;
    button.contentEditable = "false";
    button.setAttribute("role", "button");
    button.setAttribute("aria-haspopup", "listbox");
    button.setAttribute("aria-label", "切换代码语言");
    button.textContent = fenceLanguageLabel(this.language);
    button.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openFenceLangMenu(view, button, this.fenceFrom, this.language);
    });
    return button;
  }

  ignoreEvent() {
    return true;
  }

  destroy(dom: HTMLElement) {
    if (openMenu?.button === dom) closeFenceLangMenu();
  }
}
