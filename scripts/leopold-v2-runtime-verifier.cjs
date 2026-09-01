const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const variantsCache = new Map();

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function parseBytecode(value, label) {
  if (typeof value !== "string" || !/^0x[0-9a-f]*$/iu.test(value) || (value.length - 2) % 2 !== 0) {
    throw new Error(`OFFICIAL_V2_RUNTIME_BYTECODE_MALFORMED:${label}`);
  }
  const bytes = Buffer.from(value.slice(2), "hex");
  if (bytes.length === 0) throw new Error(`OFFICIAL_V2_RUNTIME_BYTECODE_EMPTY:${label}`);
  return bytes;
}

function immutableReferences(candidate, label) {
  const references = candidate?.evm?.deployedBytecode?.immutableReferences ?? {};
  const result = [];
  for (const [id, entries] of Object.entries(references)) {
    if (!Array.isArray(entries)) throw new Error(`OFFICIAL_V2_IMMUTABLE_REFERENCES_MALFORMED:${label}:${id}`);
    for (const entry of entries) {
      if (!Number.isInteger(entry?.start) || !Number.isInteger(entry?.length) || entry.start < 0 || entry.length <= 0) {
        throw new Error(`OFFICIAL_V2_IMMUTABLE_REFERENCE_MALFORMED:${label}:${id}`);
      }
      result.push({ id, start: entry.start, length: entry.length });
    }
  }
  return result.sort(
    (left, right) => left.start - right.start || left.length - right.length || left.id.localeCompare(right.id),
  );
}

function normalizeRuntime(bytes, references, label) {
  const normalized = Buffer.from(bytes);
  for (const reference of references) {
    if (reference.start + reference.length > normalized.length) {
      throw new Error(`OFFICIAL_V2_IMMUTABLE_REFERENCE_OUT_OF_BOUNDS:${label}`);
    }
    normalized.fill(0, reference.start, reference.start + reference.length);
  }
  return normalized;
}

function buildInfoVariants(root, sourceName, contractName, anchor) {
  const buildInfoDirectory = path.join(root, "artifacts/build-info");
  if (!fs.existsSync(buildInfoDirectory)) throw new Error("OFFICIAL_V2_BUILD_INFO_MISSING");
  const cacheKey = JSON.stringify([buildInfoDirectory, sourceName, contractName, anchor]);
  const cached = variantsCache.get(cacheKey);
  if (cached !== undefined) return cached;
  const variants = [];
  for (const file of fs
    .readdirSync(buildInfoDirectory)
    .filter((entry) => entry.endsWith(".json"))
    .sort()) {
    const buildInfo = JSON.parse(fs.readFileSync(path.join(buildInfoDirectory, file), "utf8"));
    if (anchor !== undefined && buildInfo.output?.contracts?.[anchor.sourceName]?.[anchor.contractName] === undefined) {
      continue;
    }
    const compiled = buildInfo.output?.contracts?.[sourceName]?.[contractName];
    const deployed = compiled?.evm?.deployedBytecode?.object;
    if (typeof deployed !== "string" || !/^[0-9a-f]*$/iu.test(deployed) || deployed.length % 2 !== 0) continue;
    const creation = compiled.evm.bytecode?.object;
    if (typeof creation !== "string" || !/^[0-9a-f]*$/iu.test(creation) || creation.length % 2 !== 0) continue;
    variants.push({
      variant: `${sourceName}@${file}`,
      deployedBytecode: Buffer.from(deployed, "hex"),
      creationBytecode: Buffer.from(creation, "hex"),
      immutableReferences: immutableReferences(compiled, `${sourceName}:${contractName}`),
    });
  }
  if (variants.length === 0) throw new Error(`OFFICIAL_V2_BUILD_INFO_CONTRACT_MISSING:${sourceName}:${contractName}`);
  variantsCache.set(cacheKey, variants);
  return variants;
}

function verifyRuntimeTemplate({
  root,
  liveCode,
  sourceName,
  contractName,
  label,
  expectedNormalizedSha256,
  buildInfoAnchor,
}) {
  const live = parseBytecode(liveCode, label);
  const variants = buildInfoVariants(root, sourceName, contractName, buildInfoAnchor).filter(
    (variant) => variant.deployedBytecode.length === live.length,
  );
  if (variants.length === 0) throw new Error(`OFFICIAL_V2_RUNTIME_SIZE_MISMATCH:${label}`);

  const matches = variants.filter((variant) => {
    const normalizedLive = normalizeRuntime(live, variant.immutableReferences, label);
    const normalizedExpected = normalizeRuntime(variant.deployedBytecode, variant.immutableReferences, label);
    return normalizedLive.equals(normalizedExpected);
  });
  if (matches.length === 0) throw new Error(`OFFICIAL_V2_RUNTIME_TEMPLATE_MISMATCH:${label}`);

  const selected = matches.find(
    (variant) =>
      sha256(normalizeRuntime(variant.deployedBytecode, variant.immutableReferences, label)) ===
      expectedNormalizedSha256,
  );
  if (selected === undefined) throw new Error(`OFFICIAL_V2_RUNTIME_EXPECTED_DIGEST_MISMATCH:${label}`);

  const normalized = normalizeRuntime(live, selected.immutableReferences, label);
  return {
    label,
    liveRuntimeBytes: live.length,
    liveRuntimeSha256: sha256(live),
    normalizedRuntimeSha256: sha256(normalized),
    expectedNormalizedRuntimeSha256: sha256(
      normalizeRuntime(selected.deployedBytecode, selected.immutableReferences, label),
    ),
    immutableReferences: selected.immutableReferences,
    expectedArtifactVariant: selected.variant,
    expectedRuntimeBytes: selected.deployedBytecode.length,
    eip170Headroom: 24_576 - selected.deployedBytecode.length,
  };
}

module.exports = {
  sha256,
  parseBytecode,
  normalizeRuntime,
  buildInfoVariants,
  verifyRuntimeTemplate,
};
