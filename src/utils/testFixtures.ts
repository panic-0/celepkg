import type { ModRecord } from "../types";

type ModRecordOptions = Partial<Omit<ModRecord, "metadata">> & {
  metadata?: Partial<ModRecord["metadata"]>;
};

export function createModRecord(name: string, options: ModRecordOptions = {}): ModRecord {
  const metadata = {
    name,
    version: "1.0.0",
    author: "",
    description: "",
    dependencies: [],
    optionalDependencies: [],
    ...options.metadata
  };
  const dependencies = options.dependencies ?? metadata.dependencies;
  return {
    ...options,
    id: options.id ?? name.toLowerCase(),
    name,
    fileName: `${name}.zip`,
    relativePath: `Mods/${name}.zip`,
    absolutePath: `D:\\Games\\Celeste\\Mods\\${name}.zip`,
    isArchive: true,
    kind: "mod",
    enabled: true,
    favorite: false,
    protected: false,
    readOnly: false,
    metadata,
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
