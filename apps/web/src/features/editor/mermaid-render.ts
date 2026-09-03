import DOMPurify from "dompurify";

type MermaidApi = typeof import("mermaid").default;

let mermaidLoader: Promise<MermaidApi> | null = null;
let renderSeq = 0;

const SVG_PURIFY = { USE_PROFILES: { html: false, svg: true, svgFilters: true } };

export function loadMermaid() {
  mermaidLoader ??= import("mermaid").then((mod) => {
    const mermaid = mod.default;
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: "dark",
      darkMode: true,
      fontFamily: "inherit",
    });
    return mermaid;
  });
  return mermaidLoader;
}

export async function renderMermaidSvg(source: string) {
  const mermaid = await loadMermaid();
  const id = `sn-mermaid-${++renderSeq}`;
  const { svg } = await mermaid.render(id, source.trim());
  return DOMPurify.sanitize(svg, SVG_PURIFY);
}

export async function mountMermaid(host: HTMLElement, source: string, isCancelled?: () => boolean) {
  host.classList.remove("is-error");
  host.textContent = "渲染中…";
  try {
    const svg = await renderMermaidSvg(source);
    if (isCancelled?.() || !host.isConnected) return;
    host.innerHTML = svg;
  } catch (error) {
    if (isCancelled?.() || !host.isConnected) return;
    host.classList.add("is-error");
    host.textContent = error instanceof Error ? error.message : "Mermaid 渲染失败";
  }
}
