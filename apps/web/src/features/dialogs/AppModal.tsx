import { useEffect, type ReactNode } from "react";

export function AppModal({
  title,
  description,
  label,
  size = "dialog",
  onClose,
  children,
  footer,
}: {
  title: string;
  description?: string;
  label?: string;
  size?: "dialog" | "picker";
  onClose: () => void;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="app-modal-overlay"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section className={`app-modal${size === "picker" ? " is-picker" : ""}`} role="dialog" aria-modal="true" aria-label={label ?? title}>
        <header>
          <div>
            <strong>{title}</strong>
            {description ? <span>{description}</span> : null}
          </div>
          <button type="button" onClick={onClose} aria-label="关闭">×</button>
        </header>
        {children ? <div className="app-modal-body">{children}</div> : null}
        {footer ? <footer>{footer}</footer> : null}
      </section>
    </div>
  );
}
