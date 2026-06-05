import { LoaderCircle } from "lucide-react";

export function WorkspaceLoadingOverlay({ message }: { message: string }) {
  return (
    <div className="workspace-loading" role="status" aria-live="polite">
      <LoaderCircle className="spin-icon" size={34} />
      <strong>{message}</strong>
    </div>
  );
}
