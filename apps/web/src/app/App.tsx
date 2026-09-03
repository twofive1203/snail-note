import { useCallback, useEffect, useMemo, useState } from "react";
import type { NotebookNode } from "@snail-note/shared";
import { MarkdownEditor } from "../features/editor/MarkdownEditor";
import { MarkdownPreview } from "../features/editor/MarkdownPreview";
import { useNoteDocument } from "../features/editor/use-note-document";
import { FileTree } from "../features/file-tree/FileTree";
import { notebookApi } from "../features/file-tree/file-tree-api";
import {
  type ActiveEntry,
  firstFile,
  joinNotebookPath,
  parentPath,
} from "../features/file-tree/file-tree-types";
import { useFileTree } from "../features/file-tree/use-file-tree";
import { SearchPanel } from "../features/search/SearchPanel";

type ViewMode = "edit" | "split" | "preview";

function countFiles(nodes: NotebookNode[]): number {
  return nodes.reduce((count, node) => count + (node.type === "file" ? 1 : countFiles(node.children ?? [])), 0);
}

function entryContainsPath(entry: ActiveEntry, path: string | null): boolean {
  return Boolean(path && (entry.path === path || (entry.type === "directory" && path.startsWith(`${entry.path}/`))));
}

export function App() {
  const { nodes, notebookName, loading: treeLoading, error: treeError, refresh } = useFileTree();
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [activeEntry, setActiveEntry] = useState<ActiveEntry | null>(null);
  const [selectedDirectory, setSelectedDirectory] = useState("");
  const [treeFilter, setTreeFilter] = useState("");
  const [collapseSignal, setCollapseSignal] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>("edit");
  const [searchOpen, setSearchOpen] = useState(false);
  const [toast, setToast] = useState("");
  const note = useNoteDocument(currentPath);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast((current) => current === message ? "" : current), 2200);
  }, []);

  useEffect(() => {
    if (!currentPath) {
      const initialPath = firstFile(nodes);
      if (initialPath) {
        setCurrentPath(initialPath);
        setActiveEntry({ path: initialPath, type: "file" });
        setSelectedDirectory(parentPath(initialPath));
      }
    }
  }, [currentPath, nodes]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!note.dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [note.dirty]);

  const openFile = useCallback((path: string) => {
    if (path === currentPath) return;
    if (note.dirty && !window.confirm("当前文件有未保存的修改，确定放弃并切换吗？")) return;
    setCurrentPath(path);
    setActiveEntry({ path, type: "file" });
    setSelectedDirectory(parentPath(path));
  }, [currentPath, note.dirty]);

  const runOperation = useCallback(async (operation: () => Promise<void>) => {
    try {
      await operation();
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : "操作失败");
    }
  }, [showToast]);

  const createNote = useCallback(() => {
    if (note.dirty && !window.confirm("当前文件有未保存的修改，创建并打开新笔记会放弃这些修改。确定吗？")) return;
    const rawName = window.prompt("新笔记名称", "未命名.md")?.trim();
    if (!rawName) return;
    if (/[\\/]/.test(rawName)) return showToast("文件名不能包含路径分隔符");
    const name = rawName.toLocaleLowerCase().endsWith(".md") ? rawName : `${rawName}.md`;
    const path = joinNotebookPath(selectedDirectory, name);
    void runOperation(async () => {
      await notebookApi.createNote({ path });
      await refresh();
      setCurrentPath(path);
      setActiveEntry({ path, type: "file" });
      showToast(`已创建 ${path}`);
    });
  }, [note.dirty, refresh, runOperation, selectedDirectory, showToast]);

  const createDirectory = useCallback(() => {
    const name = window.prompt("新文件夹名称", "新文件夹")?.trim();
    if (!name) return;
    if (/[\\/]/.test(name)) return showToast("文件夹名不能包含路径分隔符");
    const path = joinNotebookPath(selectedDirectory, name);
    void runOperation(async () => {
      await notebookApi.createDirectory({ path });
      await refresh();
      setActiveEntry({ path, type: "directory" });
      setSelectedDirectory(path);
      showToast(`已创建文件夹 ${path}`);
    });
  }, [refresh, runOperation, selectedDirectory, showToast]);

  const renameEntry = useCallback(() => {
    if (!activeEntry) return showToast("请先选择文件或目录");
    if (entryContainsPath(activeEntry, currentPath) && note.dirty && !window.confirm("当前笔记尚未保存，继续会放弃修改。确定吗？")) return;
    const oldName = activeEntry.path.split("/").at(-1) ?? activeEntry.path;
    const newName = window.prompt("输入新名称", oldName)?.trim();
    if (!newName || newName === oldName) return;
    if (/[\\/]/.test(newName)) return showToast("名称不能包含路径分隔符");
    const newPath = joinNotebookPath(parentPath(activeEntry.path), newName);
    void runOperation(async () => {
      await notebookApi.move({ path: activeEntry.path, newPath });
      const nextCurrent = entryContainsPath(activeEntry, currentPath)
        ? `${newPath}${currentPath!.slice(activeEntry.path.length)}`
        : currentPath;
      setCurrentPath(nextCurrent);
      setActiveEntry({ ...activeEntry, path: newPath });
      setSelectedDirectory(activeEntry.type === "directory" ? newPath : parentPath(newPath));
      await refresh();
      showToast(`已重命名为 ${newName}`);
    });
  }, [activeEntry, currentPath, note.dirty, refresh, runOperation, showToast]);

  const moveEntry = useCallback(() => {
    if (!activeEntry) return showToast("请先选择文件或目录");
    if (entryContainsPath(activeEntry, currentPath) && note.dirty && !window.confirm("当前笔记尚未保存，继续会放弃修改。确定吗？")) return;
    const newPath = window.prompt("输入目标相对路径", activeEntry.path)?.trim().replace(/\\/g, "/");
    if (!newPath || newPath === activeEntry.path) return;
    void runOperation(async () => {
      await notebookApi.move({ path: activeEntry.path, newPath });
      const nextCurrent = entryContainsPath(activeEntry, currentPath)
        ? `${newPath}${currentPath!.slice(activeEntry.path.length)}`
        : currentPath;
      setCurrentPath(nextCurrent);
      setActiveEntry({ ...activeEntry, path: newPath });
      setSelectedDirectory(activeEntry.type === "directory" ? newPath : parentPath(newPath));
      await refresh();
      showToast(`已移动到 ${newPath}`);
    });
  }, [activeEntry, currentPath, note.dirty, refresh, runOperation, showToast]);

  const deleteEntry = useCallback(() => {
    if (!activeEntry) return showToast("请先选择文件或目录");
    const affectsCurrent = entryContainsPath(activeEntry, currentPath);
    if (affectsCurrent && note.dirty && !window.confirm("当前笔记尚未保存，删除会丢失修改。仍要继续吗？")) return;
    if (!window.confirm(`确定删除“${activeEntry.path}”吗？此操作会直接修改真实文件，且不可恢复。`)) return;
    void runOperation(async () => {
      await notebookApi.remove(activeEntry.path);
      setActiveEntry(null);
      setSelectedDirectory(parentPath(activeEntry.path));
      await refresh();
      if (affectsCurrent) setCurrentPath(null);
      showToast("已删除");
    });
  }, [activeEntry, currentPath, note.dirty, refresh, runOperation, showToast]);

  useEffect(() => {
    const shortcuts = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.key.toLocaleLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (modifier && event.key.toLocaleLowerCase() === "n") {
        event.preventDefault();
        createNote();
      }
      if (modifier && event.key.toLocaleLowerCase() === "s") {
        event.preventDefault();
        void note.save().then((saved) => saved && showToast(note.dirty ? "已保存" : "没有需要保存的修改"));
      }
      if (event.key === "Escape") setSearchOpen(false);
    };
    document.addEventListener("keydown", shortcuts);
    return () => document.removeEventListener("keydown", shortcuts);
  }, [createNote, note, showToast]);

  const crumbs = currentPath?.split("/") ?? [];
  const wordCount = useMemo(() => [...note.content.replace(/\s/g, "")].length, [note.content]);
  const lineCount = note.content ? note.content.split(/\r?\n/).length : 0;
  const fileCount = useMemo(() => countFiles(nodes), [nodes]);

  return (
    <div className="app-shell">
      <header className="titlebar">
        <span className="logo">✦</span>
        <strong>Snail Note</strong>
        <span className="vault">{notebookName}{selectedDirectory ? ` / ${selectedDirectory}` : ""}</span>
        <span className="title-spacer" />
        <span className={`connection-dot${treeError ? " error" : ""}`} title={treeError || "服务已连接"} />
      </header>

      <main className="workspace">
        <aside className="sidebar">
          <div className="sidebar-header">
            <span>文件</span>
            <button onClick={createNote} title="新建笔记 (Ctrl/Cmd+N)">＋◇</button>
            <button onClick={createDirectory} title="新建文件夹">＋▰</button>
            <button onClick={() => setCollapseSignal((value) => value + 1)} title="折叠全部">⌃</button>
          </div>
          <label className="file-filter">
            <span>⌕</span>
            <input value={treeFilter} onChange={(event) => setTreeFilter(event.target.value)} placeholder="筛选文件…" />
          </label>
          <div className="tree-container">
            {treeLoading ? <div className="tree-empty">正在读取笔记本…</div> : null}
            {treeError ? <div className="tree-empty error">{treeError}<button onClick={() => void refresh()}>重试</button></div> : null}
            {!treeLoading && !treeError ? (
              <FileTree
                nodes={nodes}
                currentPath={currentPath}
                activeEntry={activeEntry}
                dirty={note.dirty}
                filter={treeFilter}
                collapseSignal={collapseSignal}
                onOpenFile={openFile}
                onActivate={(entry) => {
                  setActiveEntry(entry);
                  setSelectedDirectory(entry.type === "directory" ? entry.path : parentPath(entry.path));
                }}
              />
            ) : null}
          </div>
          <div className="entry-actions">
            <button onClick={renameEntry} title="重命名选中项">重命名</button>
            <button onClick={moveEntry} title="移动选中项">移动</button>
            <button className="danger-text" onClick={deleteEntry} title="删除选中项">删除</button>
          </div>
          <footer className="sidebar-footer"><span>⚙</span><span>{fileCount} 个文件</span></footer>
        </aside>

        <section className="editor-area">
          <div className="breadcrumb">
            {crumbs.length ? crumbs.map((crumb, index) => (
              <span key={`${crumb}-${index}`} className={index === crumbs.length - 1 ? "current" : ""}>
                {index > 0 ? <i>›</i> : null}{crumb}
              </span>
            )) : <span className="current">未选择笔记</span>}
          </div>
          <div className="editor-toolbar">
            <strong className="document-title">{crumbs.at(-1) ?? "选择或新建一篇笔记"}</strong>
            {note.error ? <span className="save-state error" title={note.error}>{note.error}</span> : (
              <span className={`save-state${note.dirty ? " dirty" : ""}`}><i />{note.saving ? "保存中…" : note.dirty ? "未保存" : "已保存"}</span>
            )}
            <button className={viewMode === "edit" ? "active" : ""} onClick={() => setViewMode("edit")}>✎ <span>编辑</span></button>
            <button className={viewMode === "split" ? "active" : ""} onClick={() => setViewMode("split")}>◫ <span>分屏</span></button>
            <button className={viewMode === "preview" ? "active" : ""} onClick={() => setViewMode("preview")}>◉ <span>预览</span></button>
            <button className="save-button" disabled={!currentPath || note.saving} onClick={() => void note.save().then((saved) => saved && showToast(note.dirty ? "已保存" : "没有需要保存的修改"))}>保存</button>
          </div>
          <div className={`editor-body mode-${viewMode}`}>
            {!currentPath ? <div className="welcome"><span>✦</span><h1>Snail Note</h1><p>从左侧选择一篇 Markdown 笔记，或创建新笔记。</p><button onClick={createNote}>新建笔记</button></div> : (
              <>
                <div className="editor-pane">
                  {note.loading ? <div className="pane-loading">正在加载…</div> : null}
                  <MarkdownEditor value={note.content} disabled={note.loading} onChange={note.setContent} onSave={() => void note.save().then((saved) => saved && showToast("已保存"))} />
                </div>
                <div className="preview-pane"><MarkdownPreview content={note.content} /></div>
              </>
            )}
          </div>
        </section>
      </main>

      <footer className="statusbar">
        <span>{wordCount} 字</span><span>{lineCount} 行</span><span className="status-spacer" />
        <button onClick={() => setSearchOpen(true)}>搜索 Ctrl/Cmd + K</button><span>Markdown</span><span>UTF-8</span>
      </footer>

      <SearchPanel open={searchOpen} onClose={() => setSearchOpen(false)} onOpenFile={openFile} />
      {toast ? <div className="toast" role="status">{toast}</div> : null}
    </div>
  );
}
