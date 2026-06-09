type ApiValidatorsModule = typeof import("./generated/api-validators");

let apiValidatorsPromise: Promise<ApiValidatorsModule> | undefined;

export function loadApiValidators() {
  apiValidatorsPromise ??= import("./generated/api-validators");
  return apiValidatorsPromise;
}
