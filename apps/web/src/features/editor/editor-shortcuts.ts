import type { KeyBinding } from "@codemirror/view";

export function saveKeyBinding(onSave: () => void): KeyBinding {
  return {
    key: "Mod-s",
    preventDefault: true,
    run: () => {
      onSave();
      return true;
    },
  };
}
