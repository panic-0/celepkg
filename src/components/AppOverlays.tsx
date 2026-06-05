import type { AppNotice, ModRecord } from "../types";
import {
  AppConfirmDialog,
  DependencyUpdateDialog,
  EverestDependencyDialog,
  type AppConfirmPromptState,
  type DependencyPromptState,
  type EverestDependencyPromptState
} from "./AppDialogs";
import { IssueDrawer } from "./IssueDrawer";
import { ToastHost } from "./ToastHost";

type AppOverlaysProps = {
  configWarnings: string[];
  confirmPrompt: AppConfirmPromptState | null;
  dependencyPrompt: DependencyPromptState | null;
  everestDependencyPrompt: EverestDependencyPromptState | null;
  issuesOpen: boolean;
  itemWarnings: ModRecord[];
  notice: AppNotice | null;
  scanWarnings: string[];
  onConfirmPromptClose: (confirmed: boolean) => void;
  onDependencyPromptClose: (choice: "none" | "required" | "all" | null) => void;
  onEverestDependencyPromptClose: (choice: "update" | "ignore" | null) => void;
  onIssuesClose: () => void;
  onNoticeClose: () => void;
};

export function AppOverlays({
  configWarnings,
  confirmPrompt,
  dependencyPrompt,
  everestDependencyPrompt,
  issuesOpen,
  itemWarnings,
  notice,
  scanWarnings,
  onConfirmPromptClose,
  onDependencyPromptClose,
  onEverestDependencyPromptClose,
  onIssuesClose,
  onNoticeClose
}: AppOverlaysProps) {
  return (
    <>
      <IssueDrawer
        configWarnings={configWarnings}
        itemWarnings={itemWarnings}
        open={issuesOpen}
        scanWarnings={scanWarnings}
        onClose={onIssuesClose}
      />
      {dependencyPrompt && <DependencyUpdateDialog prompt={dependencyPrompt} onClose={onDependencyPromptClose} />}
      {everestDependencyPrompt && <EverestDependencyDialog prompt={everestDependencyPrompt} onClose={onEverestDependencyPromptClose} />}
      {confirmPrompt && <AppConfirmDialog prompt={confirmPrompt} onClose={onConfirmPromptClose} />}
      <ToastHost notice={notice} onClose={onNoticeClose} />
    </>
  );
}
