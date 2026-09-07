import { AppModal } from "./AppModal";

export function UnsavedChangesDialog({
  fileName,
  onSave,
  onDiscard,
  onCancel,
}: {
  fileName?: string;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}) {
  return (
    <AppModal
      title="未保存的修改"
      onClose={onCancel}
      footer={(
        <>
          <button type="button" className="danger-text" onClick={onDiscard}>不保存</button>
          <span className="app-modal-spacer" />
          <button type="button" onClick={onCancel}>取消</button>
          <button type="button" className="primary" onClick={onSave}>保存</button>
        </>
      )}
    >
      <p className="app-modal-message">
        {fileName ? `“${fileName}” 有未保存的修改。` : "当前笔记有未保存的修改。"}
        要先保存、丢弃草稿，还是留在当前笔记？
      </p>
    </AppModal>
  );
}
