import { AlertTriangle, CheckCircle2, Info, XCircle, X } from "lucide-react";
import type { AppNotice, AppNoticeTone } from "../types";

type ToastHostProps = {
  notice: AppNotice | null;
  onClose: () => void;
};

const toneIcons: Record<AppNoticeTone, React.ReactNode> = {
  error: <XCircle size={17} />,
  info: <Info size={17} />,
  success: <CheckCircle2 size={17} />,
  warning: <AlertTriangle size={17} />
};

export function ToastHost({ notice, onClose }: ToastHostProps) {
  if (!notice) return null;

  return (
    <div className="toast-host" role={notice.tone === "error" || notice.tone === "warning" ? "alert" : "status"} aria-live="polite">
      <div className={`toast-card ${notice.tone}`}>
        {toneIcons[notice.tone]}
        <span>{notice.text}</span>
        <button className="toast-close-button" onClick={onClose} title="关闭提示">
          <X size={15} />
        </button>
      </div>
    </div>
  );
}
