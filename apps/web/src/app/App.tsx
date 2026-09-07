import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { NotebookNode } from "@snail-note/shared";
import { MarkdownEditor } from "../features/editor/MarkdownEditor";
import { MarkdownPreview } from "../features/editor/MarkdownPreview";
import { useNoteDocument } from "../features/editor/use-note-document";
import { useAppDialogs } from "../features/dialogs/use-app-dialogs";
import { validateEntryName, withMarkdownExtension } from "../features/dialogs/entry-name";
import { FileTree } from "../features/file-tree/FileTree";
import { notebookApi } from "../features/file-tree/file-tree-api";
import {
  type ActiveEntry,
  firstFile,
  joinNotebookPath,
  parentPath,
} from "../features/file-tree/file-tree-types";
import { useFileTree } from "../features/file-tree/use-file-tree";
import { DirectoryPicker } from "../features/notebooks/DirectoryPicker";
import { useNotebooks } from "../features/notebooks/use-notebooks";
import { SearchPanel } from "../features/search/SearchPanel";

type ViewMode = "edit" | "split" | "preview";

function countFiles(nodes: NotebookNode[]): number {
  return nodes.reduce((count, node) => count + (node.type === "file" ? 1 : countFiles(node.children ?? [])), 0);
}

function entryContainsPath(entry: ActiveEntry, path: string | null): boolean {
  return Boolean(path && (entry.path === path || (entry.type === "directory" && path.startsWith(`${entry.path}/`))));
}

export function App() {
  const notebookList = useNotebooks();
  const [activeNotebookId, setActiveNotebookId] = useState<string | null>(null);
  const activeNotebook = notebookList.notebooks.find(({ id }) => id === activeNotebookId) ?? null;
  const { nodes, loading: treeLoading, error: treeError, refresh } = useFileTree(activeNotebookId);
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [activeEntry, setActiveEntry] = useState<ActiveEntry | null>(null);
  const [selectedDirectory, setSelectedDirectory] = useState("");
  const [treeFilter, setTreeFilter] = useState("");
  const [collapseSignal, setCollapseSignal] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>("edit");
  const [livePreview, setLivePreview] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [directoryPickerOpen, setDirectoryPickerOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [navigationBusy, setNavigationBusy] = useState(false);
  const navigationLock = useRef(false);
  const note = useNoteDocument(activeNotebookId, currentPath);
  const { dialogHost, dialogOpen, promptName, confirm, confirmLeave, pickMoveTarget } = useAppDialogs();
  const treeLocked = navigationBusy || dialogOpen;

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast((current) => current === message ? "" : current), 2200);
  }, []);

  const runExclusive = useCallback(async (operation: () => Promise<void>) => {
    if (navigationLock.current) return;
    navigationLock.current = true;
    setNavigationBusy(true);
    try {
      await operation();
    } finally {
      navigationLock.current = false;
      setNavigationBusy(false);
    }
  }, []);

  useEffect(() => {
    setActiveNotebookId((current) => {
      if (current && notebookList.notebooks.some(({ id }) => id === current)) return current;
      return notebookList.notebooks[0]?.id ?? null;
    });
  }, [notebookList.notebooks]);

  useEffect(() => {
    setCurrentPath(null);
    setActiveEntry(null);
    setSelectedDirectory("");
    setTreeFilter("");
    setSearchOpen(false);
  }, [activeNotebookId]);

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

  const persistOrLeave = useCallback(async () => {
    if (!note.dirty) return true;
    const action = await confirmLeave(currentPath?.split("/").at(-1));
    if (action === "cancel") return false;
    if (action === "discard") return true;
    if (await note.save()) return true;
    showToast("保存失败，修改仍保留在当前笔记");
    return false;
  }, [confirmLeave, currentPath, note, showToast]);

  const selectNotebook = useCallback((notebookId: string) => {
    if (notebookId === activeNotebookId) return;
    void runExclusive(async () => {
      if (await persistOrLeave()) setActiveNotebookId(notebookId);
    });
  }, [activeNotebookId, persistOrLeave, runExclusive]);

  const openFile = useCallback((path: string) => {
    if (path === currentPath) {
      setActiveEntry({ path, type: "file" });
      setSelectedDirectory(parentPath(path));
      return;
    }
    void runExclusive(async () => {
      if (!(await persistOrLeave())) return;
      setCurrentPath(path);
      setActiveEntry({ path, type: "file" });
      setSelectedDirectory(parentPath(path));
    });
  }, [currentPath, persistOrLeave, runExclusive]);

  const runOperation = useCallback(async (operation: () => Promise<void>) => {
    try {
      await operation();
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : "操作失败");
    }
  }, [showToast]);

  const createNote = useCallback(() => {
    if (!activeNotebookId) return showToast("请先添加并选择一个笔记本");
    void runExclusive(async () => {
      if (!(await persistOrLeave())) return;
      const rawName = await promptName({
        title: "新建笔记",
        description: selectedDirectory ? `将创建在 ${selectedDirectory}` : "将创建在笔记本根目录",
        defaultValue: "未命名.md",
        submitLabel: "创建",
        validate: (value) => validateEntryName(value, "file"),
        transform: withMarkdownExtension,
      });
      if (!rawName) return;
      const path = joinNotebookPath(selectedDirectory, rawName);
      await runOperation(async () => {
        await notebookApi.createNote(activeNotebookId, { path });
        await refresh();
        setCurrentPath(path);
        setActiveEntry({ path, type: "file" });
        showToast(`已创建 ${path}`);
      });
    });
  }, [activeNotebookId, persistOrLeave, promptName, refresh, runExclusive, runOperation, selectedDirectory, showToast]);

  const createDirectory = useCallback(() => {
    if (!activeNotebookId) return showToast("请先添加并选择一个笔记本");
    void (async () => {
      const name = await promptName({
        title: "新建文件夹",
        description: selectedDirectory ? `将创建在 ${selectedDirectory}` : "将创建在笔记本根目录",
        defaultValue: "新文件夹",
        submitLabel: "创建",
        validate: (value) => validateEntryName(value, "directory"),
      });
      if (!name) return;
      const path = joinNotebookPath(selectedDirectory, name);
      await runOperation(async () => {
        await notebookApi.createDirectory(activeNotebookId, { path });
        await refresh();
        setActiveEntry({ path, type: "directory" });
        setSelectedDirectory(path);
        showToast(`已创建文件夹 ${path}`);
      });
    })();
  }, [activeNotebookId, promptName, refresh, runOperation, selectedDirectory, showToast]);

  const renameEntry = useCallback(() => {
    if (!activeNotebookId || !activeEntry) return showToast("请先选择文件或目录");
    const entry = activeEntry;
    void runExclusive(async () => {
      if (entryContainsPath(entry, currentPath) && !(await persistOrLeave())) return;
      const oldName = entry.path.split("/").at(-1) ?? entry.path;
      const newName = await promptName({
        title: "重命名",
        description: `当前名称：${oldName}`,
        defaultValue: oldName,
        submitLabel: "重命名",
        validate: (value) => validateEntryName(value, entry.type === "directory" ? "directory" : "file"),
      });
      if (!newName || newName === oldName) return;
      const newPath = joinNotebookPath(parentPath(entry.path), newName);
      await runOperation(async () => {
        await notebookApi.move(activeNotebookId, { path: entry.path, newPath });
        const nextCurrent = entryContainsPath(entry, currentPath)
          ? `${newPath}${currentPath!.slice(entry.path.length)}`
          : currentPath;
        setCurrentPath(nextCurrent);
        setActiveEntry({ ...entry, path: newPath });
        setSelectedDirectory(entry.type === "directory" ? newPath : parentPath(newPath));
        await refresh();
        showToast(`已重命名为 ${newName}`);
      });
    });
  }, [activeEntry, activeNotebookId, currentPath, persistOrLeave, promptName, refresh, runExclusive, runOperation, showToast]);

  const moveEntry = useCallback(() => {
    if (!activeNotebookId || !activeEntry) return showToast("请先选择文件或目录");
    const entry = activeEntry;
    void runExclusive(async () => {
      if (entryContainsPath(entry, currentPath) && !(await persistOrLeave())) return;
      const newPath = await pickMoveTarget(entry, nodes);
      if (!newPath || newPath === entry.path) return;
      await runOperation(async () => {
        await notebookApi.move(activeNotebookId, { path: entry.path, newPath });
        const nextCurrent = entryContainsPath(entry, currentPath)
          ? `${newPath}${currentPath!.slice(entry.path.length)}`
          : currentPath;
        setCurrentPath(nextCurrent);
        setActiveEntry({ ...entry, path: newPath });
        setSelectedDirectory(entry.type === "directory" ? newPath : parentPath(newPath));
        await refresh();
        showToast(`已移动到 ${newPath}`);
      });
    });
  }, [activeEntry, activeNotebookId, currentPath, nodes, persistOrLeave, pickMoveTarget, refresh, runExclusive, runOperation, showToast]);

  const deleteEntry = useCallback(() => {
    if (!activeNotebookId || !activeEntry) return showToast("请先选择文件或目录");
    const entry = activeEntry;
    const affectsCurrent = entryContainsPath(entry, currentPath);
    void runExclusive(async () => {
      if (affectsCurrent && !(await persistOrLeave())) return;
      const confirmed = await confirm({
        title: "删除",
        message: `确定删除“${entry.path}”吗？此操作会直接修改真实文件，且不可恢复。`,
        confirmLabel: "删除",
        danger: true,
      });
      if (!confirmed) return;
      await runOperation(async () => {
        await notebookApi.remove(activeNotebookId, entry.path);
        setActiveEntry(null);
        setSelectedDirectory(parentPath(entry.path));
        await refresh();
        if (affectsCurrent) setCurrentPath(null);
        showToast("已删除");
      });
    });
  }, [activeEntry, activeNotebookId, confirm, currentPath, persistOrLeave, refresh, runExclusive, runOperation, showToast]);

  const removeNotebook = useCallback((notebookId: string) => {
    const notebook = notebookList.notebooks.find(({ id }) => id === notebookId);
    if (!notebook) return;
    void runExclusive(async () => {
      if (notebookId === activeNotebookId && !(await persistOrLeave())) return;
      const confirmed = await confirm({
        title: "移除笔记本",
        message: `从列表移除“${notebook.name}”吗？真实目录和文件不会被删除。`,
        confirmLabel: "移除",
        danger: true,
      });
      if (!confirmed) return;
      await runOperation(async () => {
        await notebookList.remove(notebookId);
        showToast(`已移除 ${notebook.name}`);
      });
    });
  }, [activeNotebookId, confirm, notebookList, persistOrLeave, runExclusive, runOperation, showToast]);

  useEffect(() => {
    const shortcuts = (event: KeyboardEvent) => {
      if (event.defaultPrevented || dialogOpen) return;
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.key.toLocaleLowerCase() === "k" && activeNotebookId) {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (modifier && event.key.toLocaleLowerCase() === "n") {
        event.preventDefault();
        createNote();
      }
      if (modifier && event.key.toLocaleLowerCase() === "s") {
        event.preventDefault();
        void note.save().then((saved) => saved && showToast("已保存"));
      }
      if (event.key === "Escape" && !dialogOpen) setSearchOpen(false);
    };
    document.addEventListener("keydown", shortcuts);
    return () => document.removeEventListener("keydown", shortcuts);
  }, [activeNotebookId, createNote, dialogOpen, note, showToast]);

  const crumbs = currentPath?.split("/") ?? [];
  const wordCount = useMemo(() => [...note.content.replace(/\s/g, "")].length, [note.content]);
  const lineCount = note.content ? note.content.split(/\r?\n/).length : 0;
  const fileCount = useMemo(() => countFiles(nodes), [nodes]);

  return (
    <div className="app-shell">
      <header className="titlebar">
        <span className="logo">✦</span>
        <strong>Snail Note</strong>
        <span className="vault">{activeNotebook ? `${activeNotebook.name}${selectedDirectory ? ` / ${selectedDirectory}` : ""}` : "选择一个笔记本"}</span>
        <span className="title-spacer" />
        <span className={`connection-dot${notebookList.error || treeError ? " error" : ""}`} title={notebookList.error || treeError || "服务已连接"} />
      </header>

      <main className="workspace">
        <aside className="sidebar">
          <div className="sidebar-header notebook-header">
            <span>笔记本</span>
            <button disabled={treeLocked} onClick={() => setDirectoryPickerOpen(true)} title="添加笔记本">＋</button>
          </div>
          <div className="notebook-list">
            {notebookList.loading ? <div className="notebook-message">正在加载…</div> : null}
            {notebookList.error ? <div className="notebook-message error">{notebookList.error}<button onClick={() => void notebookList.refresh()}>重试</button></div> : null}
            {!notebookList.loading && !notebookList.error && notebookList.notebooks.length === 0 ? (
              <button className="add-notebook-empty" onClick={() => setDirectoryPickerOpen(true)}>＋ 添加第一个笔记本</button>
            ) : null}
            {notebookList.notebooks.map((notebook) => (
              <div key={notebook.id} className={`notebook-item${notebook.id === activeNotebookId ? " active" : ""}`}>
                <button className="notebook-select" disabled={treeLocked} onClick={() => selectNotebook(notebook.id)} title={notebook.root}>
                  <span className="notebook-arrow">{notebook.id === activeNotebookId ? "⌄" : "›"}</span>
                  <span className="notebook-icon">▰</span>
                  <span>{notebook.name}</span>
                </button>
                <button className="notebook-remove" disabled={treeLocked} onClick={() => removeNotebook(notebook.id)} title="从列表移除">×</button>
              </div>
            ))}
          </div>

          <div className="sidebar-header file-header">
            <span>文件</span>
            <button disabled={!activeNotebookId || treeLocked} onClick={createNote} title="新建笔记 (Ctrl/Cmd+N)">＋◇</button>
            <button disabled={!activeNotebookId || treeLocked} onClick={createDirectory} title="新建文件夹">＋▰</button>
            <button disabled={!activeNotebookId} onClick={() => setCollapseSignal((value) => value + 1)} title="折叠全部">⌃</button>
          </div>
          <label className="file-filter">
            <span>⌕</span>
            <input disabled={!activeNotebookId} value={treeFilter} onChange={(event) => setTreeFilter(event.target.value)} placeholder="筛选文件…" />
          </label>
          <div className={`tree-container${navigationBusy && !dialogOpen ? " is-busy" : ""}`}>
            {!activeNotebookId ? <div className="tree-empty">添加或选择一个笔记本后即可浏览文件。</div> : null}
            {treeLoading ? <div className="tree-empty">正在读取笔记本…</div> : null}
            {treeError ? <div className="tree-empty error">{treeError}<button onClick={() => void refresh()}>重试</button></div> : null}
            {activeNotebookId && !treeLoading && !treeError ? (
              <FileTree
                key={activeNotebookId}
                nodes={nodes}
                currentPath={currentPath}
                activeEntry={activeEntry}
                dirty={note.dirty}
                filter={treeFilter}
                collapseSignal={collapseSignal}
                disabled={treeLocked}
                onOpenFile={openFile}
                onActivate={(entry) => {
                  setActiveEntry(entry);
                  setSelectedDirectory(entry.type === "directory" ? entry.path : parentPath(entry.path));
                }}
              />
            ) : null}
            {navigationBusy && !dialogOpen ? <div className="tree-busy">正在切换…</div> : null}
          </div>
          <div className="entry-actions">
            <button disabled={!activeEntry || treeLocked} onClick={renameEntry} title="重命名选中项">重命名</button>
            <button disabled={!activeEntry || treeLocked} onClick={moveEntry} title="移动选中项">移动</button>
            <button disabled={!activeEntry || treeLocked} className="danger-text" onClick={deleteEntry} title="删除选中项">删除</button>
          </div>
          <footer className="sidebar-footer"><span>{activeNotebook?.name ?? "未选择笔记本"}</span><span>{fileCount} 个文件</span></footer>
        </aside>

        <section className="editor-area">
          <div className="breadcrumb">
            {activeNotebook ? <span>{activeNotebook.name}</span> : null}
            {crumbs.length ? crumbs.map((crumb, index) => (
              <span key={`${crumb}-${index}`} className={index === crumbs.length - 1 ? "current" : ""}>
                <i>›</i>{crumb}
              </span>
            )) : <span className="current">{activeNotebook ? "未选择笔记" : "未选择笔记本"}</span>}
          </div>
          <div className="editor-toolbar">
            <strong className="document-title">{crumbs.at(-1) ?? (activeNotebook ? "选择或新建一篇笔记" : "添加一个笔记本开始使用")}</strong>
            {note.error ? <span className="save-state error" title={note.error}>{note.error}</span> : note.loading ? (
              <span className="save-state">加载中…</span>
            ) : (
              <span className={`save-state${note.dirty ? " dirty" : ""}`} title="停顿后自动保存"><i />{note.saving ? "保存中…" : note.dirty ? "未保存" : "已保存"}</span>
            )}
            <button className={viewMode === "edit" && livePreview ? "active" : ""} onClick={() => { void note.save(); setLivePreview(true); setViewMode("edit"); }} title="实时预览">✦ <span>实时</span></button>
            <button className={viewMode === "edit" && !livePreview ? "active" : ""} onClick={() => { void note.save(); setLivePreview(false); setViewMode("edit"); }} title="Markdown 源码">{'</>'} <span>源码</span></button>
            <button className={viewMode === "split" ? "active" : ""} onClick={() => { void note.save(); setViewMode("split"); }}>◫ <span>分屏</span></button>
            <button className={viewMode === "preview" ? "active" : ""} onClick={() => { void note.save(); setViewMode("preview"); }}>◉ <span>预览</span></button>
            <button className="save-button" disabled={!currentPath || note.saving} onClick={() => void note.save().then((saved) => saved && showToast("已保存"))}>保存</button>
          </div>
          <div className={`editor-body mode-${viewMode}`}>
            {!currentPath ? <div className="welcome"><span>✦</span><h1>Snail Note</h1><p>{activeNotebook ? "从左侧选择一篇 Markdown 笔记，或创建新笔记。" : "先添加服务端目录作为笔记本，无需再配置启动根目录。"}</p><button onClick={activeNotebook ? createNote : () => setDirectoryPickerOpen(true)}>{activeNotebook ? "新建笔记" : "添加笔记本"}</button></div> : (
              <>
                <div className="editor-pane">
                  {note.loading ? <div className="pane-loading">正在加载…</div> : null}
                  <MarkdownEditor value={note.content} disabled={note.loading} livePreview={livePreview} syncKey={currentPath ?? undefined} onChange={note.setContent} onSave={() => void note.save().then((saved) => saved && showToast("已保存"))} />
                </div>
                <div className="preview-pane"><MarkdownPreview content={note.content} /></div>
              </>
            )}
          </div>
        </section>
      </main>

      <footer className="statusbar">
        <span>{wordCount} 字</span><span>{lineCount} 行</span><span className="status-spacer" />
        <button disabled={!activeNotebookId} onClick={() => setSearchOpen(true)}>搜索 Ctrl/Cmd + K</button><span>{viewMode === "preview" ? "预览" : livePreview ? "实时预览" : "源码"}</span><span>UTF-8</span>
      </footer>

      <SearchPanel open={searchOpen} notebookId={activeNotebookId} onClose={() => setSearchOpen(false)} onOpenFile={openFile} />
      <DirectoryPicker
        open={directoryPickerOpen}
        onClose={() => setDirectoryPickerOpen(false)}
        onSelect={async (root) => {
          const notebook = await notebookList.add(root);
          setActiveNotebookId(notebook.id);
          showToast(`已添加 ${notebook.name}`);
        }}
      />
      {dialogHost}
      {toast ? <div className="toast" role="status">{toast}</div> : null}
    </div>
  );
}
