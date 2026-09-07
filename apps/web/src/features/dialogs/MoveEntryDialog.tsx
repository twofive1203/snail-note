import { useMemo, useState } from "react";
import type { NotebookNode } from "@snail-note/shared";
import type { ActiveEntry } from "../file-tree/file-tree-types";
import { joinNotebookPath, parentPath } from "../file-tree/file-tree-types";
import { AppModal } from "./AppModal";

function isForbiddenTarget(entry: ActiveEntry, targetDir: string): boolean {
  return entry.type === "directory" && (targetDir === entry.path || targetDir.startsWith(`${entry.path}/`));
}

function ancestorPaths(path: string): string[] {
  if (!path) return [];
  const parts = path.split("/");
  return parts.map((_, index) => parts.slice(0, index + 1).join("/"));
}

function FolderBranch({
  nodes,
  opened,
  selected,
  forbiddenPrefix,
  onToggle,
  onSelect,
}: {
  nodes: NotebookNode[];
  opened: Set<string>;
  selected: string;
  forbiddenPrefix: string | null;
  onToggle: (path: string) => void;
  onSelect: (path: string) => void;
}) {
  return (
    <ul className="folder-picker-branch">
      {nodes.filter((node) => node.type === "directory").map((node) => {
        const forbidden = Boolean(forbiddenPrefix && (node.path === forbiddenPrefix || node.path.startsWith(`${forbiddenPrefix}/`)));
        const expanded = opened.has(node.path);
        const childDirectories = (node.children ?? []).filter((child) => child.type === "directory");
        return (
          <li key={node.path}>
            <button
              type="button"
              className={`folder-picker-node${selected === node.path ? " selected" : ""}`}
              disabled={forbidden}
              title={forbidden ? "不能移动到自身或子目录" : node.path}
              onClick={() => {
                if (forbidden) return;
                onSelect(node.path);
                if (childDirectories.length > 0 && !expanded) onToggle(node.path);
              }}
            >
              <span
                className={`tree-arrow${expanded ? " expanded" : ""}`}
                onClick={(event) => {
                  event.stopPropagation();
                  if (childDirectories.length > 0) onToggle(node.path);
                }}
              >
                {childDirectories.length > 0 ? "›" : ""}
              </span>
              <span className="tree-icon folder">▰</span>
              <span className="tree-name">{node.name}</span>
            </button>
            {expanded && childDirectories.length > 0 ? (
              <FolderBranch
                nodes={childDirectories}
                opened={opened}
                selected={selected}
                forbiddenPrefix={forbiddenPrefix}
                onToggle={onToggle}
                onSelect={onSelect}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function MoveEntryDialog({
  entry,
  nodes,
  onSubmit,
  onClose,
}: {
  entry: ActiveEntry;
  nodes: NotebookNode[];
  onSubmit: (newPath: string) => void;
  onClose: () => void;
}) {
  const fileName = entry.path.split("/").at(-1) ?? entry.path;
  const [targetDir, setTargetDir] = useState(() => parentPath(entry.path));
  const [opened, setOpened] = useState(() => {
    const next = new Set(ancestorPaths(parentPath(entry.path)));
    for (const node of nodes) {
      if (node.type === "directory") next.add(node.path);
    }
    return next;
  });

  const newPath = joinNotebookPath(targetDir, fileName);
  const forbidden = isForbiddenTarget(entry, targetDir);
  const unchanged = newPath === entry.path;
  const canSubmit = !forbidden && !unchanged;

  const helper = useMemo(() => {
    if (forbidden) return "不能移动到自身或子目录";
    if (unchanged) return "已在该目录";
    return `将移动到 ${newPath}`;
  }, [forbidden, newPath, unchanged]);

  return (
    <AppModal
      title="移动"
      description={`选择“${fileName}”的目标文件夹`}
      size="picker"
      onClose={onClose}
      footer={(
        <>
          <span className="move-preview" title={newPath}>{helper}</span>
          <button type="button" onClick={onClose}>取消</button>
          <button type="button" className="primary" disabled={!canSubmit} onClick={() => onSubmit(newPath)}>移动</button>
        </>
      )}
    >
      <div className="folder-picker">
        <button
          type="button"
          className={`folder-picker-node root${targetDir === "" ? " selected" : ""}`}
          disabled={isForbiddenTarget(entry, "")}
          onClick={() => setTargetDir("")}
        >
          <span className="tree-icon folder">▰</span>
          <span className="tree-name">笔记本根目录</span>
        </button>
        <FolderBranch
          nodes={nodes}
          opened={opened}
          selected={targetDir}
          forbiddenPrefix={entry.type === "directory" ? entry.path : null}
          onToggle={(path) => setOpened((current) => {
            const next = new Set(current);
            if (next.has(path)) next.delete(path);
            else next.add(path);
            return next;
          })}
          onSelect={setTargetDir}
        />
      </div>
    </AppModal>
  );
}
