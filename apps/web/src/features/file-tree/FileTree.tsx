import { useEffect, useMemo, useState } from "react";
import type { NotebookNode } from "@snail-note/shared";
import type { ActiveEntry } from "./file-tree-types";

interface FileTreeProps {
  nodes: NotebookNode[];
  currentPath: string | null;
  activeEntry: ActiveEntry | null;
  dirty: boolean;
  filter: string;
  collapseSignal: number;
  disabled?: boolean;
  onOpenFile: (path: string) => void;
  onActivate: (entry: ActiveEntry) => void;
}

function filterNodes(nodes: NotebookNode[], query: string): NotebookNode[] {
  if (!query) return nodes;
  return nodes.flatMap((node) => {
    const children = filterNodes(node.children ?? [], query);
    if (node.name.toLocaleLowerCase().includes(query) || children.length > 0) {
      return [{ ...node, children }];
    }
    return [];
  });
}

function TreeBranch({
  nodes,
  opened,
  currentPath,
  activeEntry,
  dirty,
  forceOpen,
  disabled,
  onToggle,
  onOpenFile,
  onActivate,
}: {
  nodes: NotebookNode[];
  opened: Set<string>;
  currentPath: string | null;
  activeEntry: ActiveEntry | null;
  dirty: boolean;
  forceOpen: boolean;
  disabled: boolean;
  onToggle: (path: string) => void;
  onOpenFile: (path: string) => void;
  onActivate: (entry: ActiveEntry) => void;
}) {
  return (
    <ul className="tree-branch">
      {nodes.map((node) => {
        const isDirectory = node.type === "directory";
        const expanded = forceOpen || opened.has(node.path);
        const selected = activeEntry?.path === node.path;
        return (
          <li key={node.path}>
            <button
              className={`tree-node${selected ? " active" : ""}${currentPath === node.path ? " selected" : ""}`}
              title={node.path}
              disabled={disabled}
              onClick={() => {
                if (isDirectory) {
                  onActivate({ path: node.path, type: node.type });
                  onToggle(node.path);
                  return;
                }
                onOpenFile(node.path);
              }}
            >
              <span className={`tree-arrow${expanded ? " expanded" : ""}`}>{isDirectory ? "›" : ""}</span>
              <span className={`tree-icon ${isDirectory ? "folder" : "markdown"}`}>{isDirectory ? "▰" : "◇"}</span>
              <span className="tree-name">{node.name}</span>
              {currentPath === node.path && dirty ? <span className="dirty-dot" title="未保存" /> : null}
              {isDirectory ? <span className="tree-count">{node.children?.length ?? 0}</span> : null}
            </button>
            {isDirectory && expanded && (node.children?.length ?? 0) > 0 ? (
              <TreeBranch
                nodes={node.children ?? []}
                opened={opened}
                currentPath={currentPath}
                activeEntry={activeEntry}
                dirty={dirty}
                forceOpen={forceOpen}
                disabled={disabled}
                onToggle={onToggle}
                onOpenFile={onOpenFile}
                onActivate={onActivate}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function FileTree(props: FileTreeProps) {
  const [opened, setOpened] = useState<Set<string>>(() => new Set());

  useEffect(() => setOpened(new Set()), [props.collapseSignal]);

  const query = props.filter.trim().toLocaleLowerCase();
  const visibleNodes = useMemo(() => filterNodes(props.nodes, query), [props.nodes, query]);

  if (visibleNodes.length === 0) {
    return <div className="tree-empty">{query ? "没有匹配的文件" : "笔记本还是空的，创建第一篇笔记吧。"}</div>;
  }

  return (
    <nav className="tree" aria-label="笔记文件" aria-busy={props.disabled || undefined}>
      <TreeBranch
        nodes={visibleNodes}
        opened={opened}
        currentPath={props.currentPath}
        activeEntry={props.activeEntry}
        dirty={props.dirty}
        forceOpen={Boolean(query)}
        disabled={Boolean(props.disabled)}
        onToggle={(path) => setOpened((current) => {
          const next = new Set(current);
          if (next.has(path)) next.delete(path);
          else next.add(path);
          return next;
        })}
        onOpenFile={props.onOpenFile}
        onActivate={props.onActivate}
      />
    </nav>
  );
}
