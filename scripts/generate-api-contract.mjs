import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import standaloneCode from "ajv/dist/standalone/index.js";
import { compile } from "json-schema-to-typescript";
import { format, resolveConfig } from "prettier";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, "..");
const defaultOutputDir = join(rootDir, "src", "generated");
const generatedFiles = ["api-contract.json", "api-types.ts", "api-validators.ts"];
const prettierConfig = (await resolveConfig(join(defaultOutputDir, "api-types.ts"))) ?? {};

const checkMode = process.argv.includes("--check");
const explicitOutputArg = process.argv.find((arg) => arg.startsWith("--out="));
const outputDir = explicitOutputArg ? resolve(rootDir, explicitOutputArg.slice("--out=".length)) : defaultOutputDir;

if (checkMode) {
  const tempDir = join(tmpdir(), `celepkg-api-contract-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await generate(tempDir);
  const differences = generatedFiles.filter((file) => readText(join(tempDir, file)) !== readText(join(defaultOutputDir, file)));
  rmSync(tempDir, { force: true, recursive: true });
  if (differences.length > 0) {
    console.error(`API 契约生成物已过期：${differences.join(", ")}`);
    console.error("请运行 npm run generate:contract 后再提交。");
    process.exit(1);
  }
  console.log("API 契约生成物是最新的。");
} else {
  await generate(outputDir);
  console.log(`API 契约生成物已写入 ${outputDir}`);
}

async function generate(targetDir) {
  mkdirSync(targetDir, { recursive: true });
  const contract = exportContract();
  writeFileSync(
    join(targetDir, "api-contract.json"),
    await format(`${JSON.stringify(contract, null, 2)}\n`, { ...prettierConfig, parser: "json" })
  );
  writeFileSync(join(targetDir, "api-types.ts"), await format(await generateTypes(contract), { ...prettierConfig, parser: "typescript" }));
  writeFileSync(
    join(targetDir, "api-validators.ts"),
    await format(generateValidators(contract), { ...prettierConfig, parser: "typescript" })
  );
}

function exportContract() {
  const result = spawnSync("cargo", ["run", "--quiet", "--manifest-path", "src-tauri/Cargo.toml", "--example", "export_api_contract"], {
    cwd: rootDir,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.stderr.write(result.stdout);
    throw new Error("导出 Rust API 契约失败。");
  }
  return JSON.parse(result.stdout);
}

async function generateTypes(contract) {
  const aggregateSchema = aggregateTypesSchema(contract);
  const compiled = await compile(aggregateSchema, "ApiTypes", {
    additionalProperties: false,
    bannerComment: "",
    declareExternallyReferenced: true,
    enableConstEnums: false,
    format: true,
    style: {
      bracketSpacing: true,
      printWidth: 120,
      semi: true,
      singleQuote: false,
      tabWidth: 2,
      trailingComma: "none",
      useTabs: false
    },
    unreachableDefinitions: true
  });
  return `${compiled.trim()}\n\n${apiMapsSource(contract)}`;
}

function aggregateTypesSchema(contract) {
  const defs = {};
  for (const [name, schema] of Object.entries(contract.schemas)) {
    collectDefinitions(defs, schema);
    defs[name] = cleanDefinition(schema, name);
  }
  const properties = {};
  for (const name of Object.keys(defs).sort()) {
    properties[name] = { $ref: `#/$defs/${name}` };
  }
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "ApiTypes",
    type: "object",
    additionalProperties: false,
    properties,
    required: Object.keys(properties),
    $defs: defs
  };
}

function collectDefinitions(defs, schema) {
  if (!schema || typeof schema !== "object") return;
  if (schema.$defs && typeof schema.$defs === "object") {
    for (const [name, nested] of Object.entries(schema.$defs)) {
      if (!defs[name]) defs[name] = cleanDefinition(nested, name);
      collectDefinitions(defs, nested);
    }
  }
  for (const value of Object.values(schema)) {
    if (Array.isArray(value)) {
      for (const item of value) collectDefinitions(defs, item);
    } else {
      collectDefinitions(defs, value);
    }
  }
}

function cleanDefinition(schema, name) {
  const copy = JSON.parse(JSON.stringify(schema));
  delete copy.$schema;
  delete copy.$defs;
  copy.title = name;
  return copy;
}

function apiMapsSource(contract) {
  const commandEntries = Object.entries(contract.commands);
  const eventEntries = Object.entries(contract.events);
  const commandNames = commandEntries.map(([name]) => JSON.stringify(name)).join(" | ");
  const eventNames = eventEntries.map(([name]) => JSON.stringify(name)).join(" | ");

  return `export type ApiCommandName = ${commandNames};
export type ApiEventName = ${eventNames};

export interface ApiCommandPayloads {
${commandEntries.map(([name, info]) => `  ${JSON.stringify(name)}: ${info.payload ?? "undefined"};`).join("\n")}
}

export interface ApiCommandResponses {
${commandEntries.map(([name, info]) => `  ${JSON.stringify(name)}: ${info.response};`).join("\n")}
}

export interface ApiEventPayloads {
${eventEntries.map(([name, info]) => `  ${JSON.stringify(name)}: ${info.payload};`).join("\n")}
}
`;
}

function generateValidators(contract) {
  const { code, entries } = generateStandaloneValidators(contract);

  return `// @ts-nocheck
import type { ErrorObject, ValidateFunction } from "ajv";
import contract from "./api-contract.json";
import type { ApiCommandName, ApiCommandPayloads, ApiCommandResponses, ApiEventName, ApiEventPayloads } from "./api-types";

${code}

type SchemaName = keyof typeof contract.schemas;
type CommandContract = { payload: SchemaName | null; response: SchemaName };
type EventContract = { payload: SchemaName };

const commandContracts = contract.commands as Record<ApiCommandName, CommandContract>;
const eventContracts = contract.events as Record<ApiEventName, EventContract>;
const validators = {
${entries.map(([schemaName, validatorName]) => `  ${JSON.stringify(schemaName)}: ${validatorName}`).join(",\n")}
} satisfies Record<SchemaName, ValidateFunction>;

export function validateSchemaValue<T>(schemaName: SchemaName, value: unknown, label: string = schemaName): T {
  const validator = validatorFor(schemaName);
  if (validator(value)) return value as T;
  throw new Error(\`\${label} 不符合契约：\${formatValidationErrors(validator.errors)}\`);
}

export function validateCommandPayload<Name extends ApiCommandName>(
  command: Name,
  value: unknown
): ApiCommandPayloads[Name] {
  const payloadSchema = commandContracts[command].payload;
  if (!payloadSchema) {
    if (typeof value === "undefined") return undefined as ApiCommandPayloads[Name];
    throw new Error(\`API 调用参数格式异常：\${command} 不应接收参数。\`);
  }
  return validateSchemaValue<ApiCommandPayloads[Name]>(payloadSchema, value, \`API 调用参数格式异常：\${command} 参数\`);
}

export function validateCommandResponse<Name extends ApiCommandName>(
  command: Name,
  value: unknown
): ApiCommandResponses[Name] {
  const responseSchema = commandContracts[command].response;
  return validateSchemaValue<ApiCommandResponses[Name]>(
    responseSchema,
    value,
    \`API 返回数据格式异常：\${command} 返回值\`
  );
}

export function readEventPayload<Name extends ApiEventName>(event: Name, value: unknown): ApiEventPayloads[Name] | null {
  const payloadSchema = eventContracts[event].payload;
  const validator = validatorFor(payloadSchema);
  return validator(value) ? (value as ApiEventPayloads[Name]) : null;
}

function validatorFor(schemaName: SchemaName) {
  return validators[schemaName];
}

function formatValidationErrors(errors: ErrorObject[] | null | undefined) {
  const error = errors?.[0];
  if (!error) return "未知错误";
  const path = error.instancePath || "(根)";
  if (error.keyword === "required" && typeof error.params.missingProperty === "string") {
    return \`\${path} 缺少字段 \${error.params.missingProperty}\`;
  }
  if (error.keyword === "additionalProperties" && typeof error.params.additionalProperty === "string") {
    return \`\${path} 包含未知字段 \${error.params.additionalProperty}\`;
  }
  return \`\${path} \${error.message ?? "格式错误"}\`;
}
`;
}

function generateStandaloneValidators(contract) {
  const schemaEntries = Object.entries(contract.schemas).sort(([left], [right]) => left.localeCompare(right));
  const ajv = new Ajv2020({ allErrors: true, code: { esm: true, source: true }, strict: false, validateFormats: false });
  const exports = {};
  const entries = [];

  for (const [index, [schemaName, schema]] of schemaEntries.entries()) {
    const validatorName = `validateSchema${index}`;
    const schemaCopy = closeObjects(JSON.parse(JSON.stringify(schema)));
    ajv.addSchema(schemaCopy, schemaName);
    exports[validatorName] = schemaName;
    entries.push([schemaName, validatorName]);
  }

  return {
    code: standaloneCode(ajv, exports),
    entries
  };
}

function closeObjects(value) {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(closeObjects);
  for (const key of Object.keys(value)) value[key] = closeObjects(value[key]);
  if (value.type === "object" && value.properties && typeof value.additionalProperties === "undefined") {
    value.additionalProperties = false;
  }
  return value;
}

function readText(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}
