import type { EverestRelease } from "../types";
import type { DownloadTaskItem } from "./downloadTask";

export type EverestInstallTaskDescriptor = Pick<DownloadTaskItem, "id" | "name" | "kind" | "status" | "dependsOn"> & {
  release: EverestRelease;
};

export function createEverestInstallTaskDescriptor(release: EverestRelease): EverestInstallTaskDescriptor {
  return {
    id: `everest:${release.branch}:${release.version}`,
    name: `Everest 1.${release.version}.0`,
    kind: "everest",
    status: "queued",
    dependsOn: [],
    release
  };
}
