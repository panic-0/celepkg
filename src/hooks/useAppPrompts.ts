import { useState } from "react";
import type { AppConfirmPromptState, DependencyPromptState, EverestDependencyPromptState } from "../components/AppDialogs";
import type { DependencyUpdateChoice, EverestDependencyChoice } from "../utils/appDependencyResolution";

export function useAppPrompts() {
  const [confirmPrompt, setConfirmPrompt] = useState<AppConfirmPromptState | null>(null);
  const [dependencyPrompt, setDependencyPrompt] = useState<DependencyPromptState | null>(null);
  const [everestDependencyPrompt, setEverestDependencyPrompt] = useState<EverestDependencyPromptState | null>(null);

  function requestDependencyChoice(
    targetName: string,
    actionLabel: DependencyPromptState["actionLabel"],
    issues: DependencyPromptState["issues"]
  ) {
    return new Promise<DependencyUpdateChoice | null>((resolve) => {
      setDependencyPrompt({ actionLabel, issues, resolve, targetName });
    });
  }

  function requestEverestDependencyChoice(prompt: Omit<EverestDependencyPromptState, "resolve">) {
    return new Promise<EverestDependencyChoice | null>((resolve) => {
      setEverestDependencyPrompt({ ...prompt, resolve });
    });
  }

  function requestAppConfirm(prompt: Omit<AppConfirmPromptState, "resolve">) {
    return new Promise<boolean>((resolve) => {
      setConfirmPrompt({ ...prompt, resolve });
    });
  }

  function closeDependencyPrompt(choice: DependencyUpdateChoice | null) {
    dependencyPrompt?.resolve(choice);
    setDependencyPrompt(null);
  }

  function closeEverestDependencyPrompt(choice: EverestDependencyChoice | null) {
    everestDependencyPrompt?.resolve(choice);
    setEverestDependencyPrompt(null);
  }

  function closeConfirmPrompt(confirmed: boolean) {
    confirmPrompt?.resolve(confirmed);
    setConfirmPrompt(null);
  }

  return {
    closeConfirmPrompt,
    closeDependencyPrompt,
    closeEverestDependencyPrompt,
    confirmPrompt,
    dependencyPrompt,
    everestDependencyPrompt,
    requestAppConfirm,
    requestDependencyChoice,
    requestEverestDependencyChoice
  };
}
