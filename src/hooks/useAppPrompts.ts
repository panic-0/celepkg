import { useState } from "react";
import type {
  AppConfirmPromptState,
  DependencyPromptState,
  DependencyTreePromptState,
  EverestDependencyPromptState
} from "../components/AppDialogs";
import type { DependencyUpdateChoice, EverestDependencyChoice } from "../utils/appDependencyResolution";
import type { DependencyTreePreviewChoice } from "../utils/dependencyTree";

export function useAppPrompts() {
  const [confirmPrompt, setConfirmPrompt] = useState<AppConfirmPromptState | null>(null);
  const [dependencyPrompt, setDependencyPrompt] = useState<DependencyPromptState | null>(null);
  const [dependencyTreePrompt, setDependencyTreePrompt] = useState<DependencyTreePromptState | null>(null);
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

  function requestDependencyTreeChoice(prompt: Omit<DependencyTreePromptState, "resolve">) {
    return new Promise<DependencyTreePreviewChoice | null>((resolve) => {
      setDependencyTreePrompt({ ...prompt, resolve });
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

  function closeDependencyTreePrompt(choice: DependencyTreePreviewChoice | null) {
    dependencyTreePrompt?.resolve(choice);
    setDependencyTreePrompt(null);
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
    closeDependencyTreePrompt,
    closeEverestDependencyPrompt,
    confirmPrompt,
    dependencyPrompt,
    dependencyTreePrompt,
    everestDependencyPrompt,
    requestAppConfirm,
    requestDependencyChoice,
    requestDependencyTreeChoice,
    requestEverestDependencyChoice
  };
}
