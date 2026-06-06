import { describe, expect, it } from "vitest";
import type { Dependency, ModRecord } from "../types";
import { buildLocalDependencyTree, dependencyIssueToTreeNode } from "./dependencyTree";

describe("dependency tree", () => {
  it("builds local dependency status nodes", () => {
    const root = record("root", "Root", "1.0.0", [
      { name: "Helper", version: "2.0.0" },
      { name: "MissingHelper", version: "1.0.0" },
      { name: "EverestCore", version: "1.5000.0" },
      { name: "Celeste", version: "" }
    ]);
    const helper = record("helper", "Helper", "1.0.0");

    const tree = buildLocalDependencyTree(root, [root, helper]);

    expect(tree.children.map((node) => [node.name, node.status])).toEqual([
      ["Helper", "tooLow"],
      ["MissingHelper", "missing"],
      ["EverestCore", "everest"],
      ["Celeste", "builtin"]
    ]);
  });

  it("marks recursive cycles", () => {
    const root = record("root", "Root", "1.0.0", [{ name: "Helper", version: "1.0.0" }]);
    const helper = record("helper", "Helper", "1.0.0", [{ name: "Root", version: "1.0.0" }]);

    const tree = buildLocalDependencyTree(root, [root, helper]);

    expect(tree.children[0].children[0].status).toBe("cycle");
  });

  it("converts dependency issues to planned preview nodes", () => {
    const node = dependencyIssueToTreeNode({
      dependency: { name: "Optional Helper", version: "1.2.0" },
      optional: true,
      reason: "missing"
    });

    expect(node).toMatchObject({
      kind: "optional",
      name: "Optional Helper",
      selectable: true,
      selected: false,
      status: "plannedInstall"
    });
  });
});

function record(id: string, name: string, version: string, dependencies: Dependency[] = []): ModRecord {
  return {
    id,
    name,
    fileName: `${name}.zip`,
    relativePath: `Mods/${name}.zip`,
    absolutePath: `D:/Celeste/Mods/${name}.zip`,
    isArchive: true,
    kind: "mod",
    enabled: true,
    favorite: false,
    protected: false,
    readOnly: false,
    metadata: {
      name,
      version,
      author: "",
      description: "",
      dependencies,
      optionalDependencies: []
    },
    mapIds: [],
    subMaps: [],
    mapCount: 0,
    strawberryCount: 0,
    strawberryTotalCount: 0,
    completionStatus: "notApplicable",
    dependencies,
    optionalDependencies: [],
    stats: null,
    warnings: []
  };
}
