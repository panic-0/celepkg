import { X } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, type ReactNode } from "react";

export function Select({
  label,
  value,
  onChange,
  children
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
    </label>
  );
}

export function DetailStat({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="detail-stat">
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="info-line">
      <span>{label}</span>
      <strong className={value.length > 32 ? "long-value" : ""} title={value}>
        {value}
      </strong>
    </div>
  );
}

export type DialogAction = {
  label: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: "default" | "primary" | "danger";
};

export type DialogFact = {
  label: string;
  value: string;
};

export function DialogShell({
  actions,
  children,
  className = "",
  closeDisabled,
  closeOnBackdrop = false,
  icon,
  onClose,
  showCloseButton,
  title
}: {
  actions?: DialogAction[];
  children: ReactNode;
  className?: string;
  closeDisabled?: boolean;
  closeOnBackdrop?: boolean;
  icon?: ReactNode;
  onClose: () => void;
  showCloseButton?: boolean;
  title: string;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const closeDisabledRef = useRef(closeDisabled);
  const onCloseRef = useRef(onClose);
  const previousFocusRef = useRef<HTMLElement | null>(activeElement());

  useEffect(() => {
    closeDisabledRef.current = closeDisabled;
    onCloseRef.current = onClose;
  }, [closeDisabled, onClose]);

  useLayoutEffect(() => {
    const previousFocus = previousFocusRef.current;

    function focusInitialTarget() {
      const dialog = dialogRef.current;
      const initialTarget = autofocusTarget(dialog) ?? firstFocusable(dialog) ?? dialog;
      initialTarget?.focus();
    }

    focusInitialTarget();
    const frame = window.requestAnimationFrame(focusInitialTarget);
    const timeout = window.setTimeout(focusInitialTarget, 50);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
      previousFocus?.focus();
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const dialog = dialogRef.current;
      if (event.key === "Escape" && !closeDisabledRef.current) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const focusable = focusableElements(dialog);
      if (!focusable.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!dialog.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <div
      className="confirm-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && closeOnBackdrop && !closeDisabled) onClose();
      }}
    >
      <section
        className={className ? `confirm-dialog ${className}` : "confirm-dialog"}
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="confirm-dialog-heading">
          {icon}
          <h3 id={titleId}>{title}</h3>
          {showCloseButton && (
            <button
              autoFocus
              className="icon-button dialog-close-button"
              onClick={onClose}
              disabled={closeDisabled}
              title="关闭"
              aria-label="关闭"
            >
              <X size={16} />
            </button>
          )}
        </div>
        <div className="confirm-dialog-content">{children}</div>
        {actions && actions.length > 0 && (
          <div className="confirm-dialog-actions">
            {actions.map((action, index) => (
              <button
                className={dialogActionClass(action.variant)}
                data-dialog-autofocus={index === 0 ? true : undefined}
                autoFocus={!showCloseButton && index === 0}
                disabled={action.disabled}
                key={index}
                onClick={action.onClick}
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export function ConfirmDialog({
  cancelLabel = "取消",
  children,
  className,
  confirmLabel,
  description,
  facts,
  icon,
  loading,
  onCancel,
  onConfirm,
  title,
  variant = "primary"
}: {
  cancelLabel?: string;
  children?: ReactNode;
  className?: string;
  confirmLabel: string;
  description: string;
  facts?: DialogFact[];
  icon?: ReactNode;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
  variant?: "primary" | "danger";
}) {
  return (
    <DialogShell
      actions={[
        { label: cancelLabel, onClick: onCancel, disabled: loading },
        { label: confirmLabel, onClick: onConfirm, disabled: loading, variant }
      ]}
      closeDisabled={loading}
      className={className}
      icon={icon}
      onClose={onCancel}
      title={title}
    >
      <p>{description}</p>
      {facts && facts.length > 0 && <DialogFacts facts={facts} />}
      {children}
    </DialogShell>
  );
}

export function DialogFacts({ facts }: { facts: DialogFact[] }) {
  return (
    <dl className="confirm-dialog-facts">
      {facts.map((fact) => (
        <div key={fact.label}>
          <dt>{fact.label}</dt>
          <dd title={fact.value}>{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function dialogActionClass(variant: DialogAction["variant"]) {
  if (variant === "primary") return "confirm-primary-button";
  if (variant === "danger") return "confirm-danger-button";
  return undefined;
}

function focusableElements(root: HTMLElement) {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(isFocusableElement);
}

function firstFocusable(root: HTMLElement | null) {
  if (!root) return null;
  return focusableElements(root)[0] ?? null;
}

function autofocusTarget(root: HTMLElement | null) {
  if (!root) return null;
  return [...root.querySelectorAll<HTMLElement>("[data-dialog-autofocus]")].find(isFocusableElement) ?? null;
}

function isFocusableElement(element: HTMLElement) {
  return !element.hasAttribute("disabled") && element.tabIndex !== -1 && element.getClientRects().length > 0;
}

function activeElement() {
  return typeof document !== "undefined" && document.activeElement instanceof HTMLElement ? document.activeElement : null;
}

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button",
  "input",
  "select",
  "textarea",
  "[tabindex]:not([tabindex='-1'])"
].join(",");
