import { AppModal } from "./AppModal";

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  danger = false,
  onConfirm,
  onClose,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <AppModal
      title={title}
      onClose={onClose}
      footer={(
        <>
          <span />
          <button type="button" onClick={onClose}>取消</button>
          <button type="button" className={danger ? "danger" : "primary"} onClick={onConfirm}>{confirmLabel}</button>
        </>
      )}
    >
      <p className="app-modal-message">{message}</p>
    </AppModal>
  );
}
