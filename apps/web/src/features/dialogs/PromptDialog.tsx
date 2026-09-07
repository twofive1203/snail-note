import { useEffect, useRef, useState } from "react";
import { AppModal } from "./AppModal";

export function PromptDialog({
  title,
  description,
  defaultValue,
  submitLabel,
  validate,
  transform,
  onSubmit,
  onClose,
}: {
  title: string;
  description?: string;
  defaultValue: string;
  submitLabel: string;
  validate: (value: string) => string | null;
  transform?: (value: string) => string;
  onSubmit: (value: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(defaultValue);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  const submit = () => {
    const trimmed = value.trim();
    const message = validate(trimmed);
    if (message) {
      setError(message);
      return;
    }
    onSubmit(transform ? transform(trimmed) : trimmed);
  };

  return (
    <AppModal
      title={title}
      description={description}
      onClose={onClose}
      footer={(
        <>
          <span />
          <button type="button" onClick={onClose}>取消</button>
          <button type="button" className="primary" onClick={submit}>{submitLabel}</button>
        </>
      )}
    >
      <label className="app-modal-field">
        <span className="visually-hidden">{title}</span>
        <input
          ref={input}
          value={value}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "app-prompt-error" : undefined}
          onChange={(event) => {
            setValue(event.target.value);
            if (error) setError("");
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submit();
            }
          }}
        />
      </label>
      {error ? <div id="app-prompt-error" className="app-modal-error">{error}</div> : null}
    </AppModal>
  );
}
