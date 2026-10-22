import fs from 'node:fs';
import path from 'node:path';

export const normalizePath = (value) => {
  let normalizedPath = String(value || '/')
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/');

  if (!normalizedPath.startsWith('/')) {
    normalizedPath = `/${normalizedPath}`;
  }

  while (normalizedPath.length > 1 && normalizedPath.endsWith('/')) {
    normalizedPath = normalizedPath.slice(0, -1);
  }

  return normalizedPath;
};

export const normalizeMethod = (value) =>
  String(value || 'ANY').trim().toUpperCase();

export const normalizeContentType = (value) => {
  const normalized = String(value || '*/*')
    .trim()
    .toLowerCase()
    .split(';', 1)[0]
    .trim();

  return normalized || '*/*';
};

/**
 * Compares registry metadata against the content types inferred from the
 * actual controller.
 *
 * Important:
 * - Registry application/json matches controller application/json.
 * - Registry multipart/form-data matches controller multipart/form-data.
 * - Registry wildcard content type matches a controller with no consumes restriction.
 * - An incorrect concrete registry type must not be certified merely because
 *   the controller accepts any content type.
 */
export const contentTypesMatch = (
  registryContentType,
  controllerContentTypes = [],
) => {
  const registryType = normalizeContentType(registryContentType);

  const normalizedControllerTypes = controllerContentTypes.length > 0
    ? controllerContentTypes.map(normalizeContentType)
    : ['*/*'];

  if (registryType === '*/*') {
    return normalizedControllerTypes.includes('*/*');
  }

  return normalizedControllerTypes.includes(registryType);
};

const mediaTypeConstants = new Map([
  ['MediaType.APPLICATION_JSON_VALUE', 'application/json'],
  ['MediaType.MULTIPART_FORM_DATA_VALUE', 'multipart/form-data'],
  [
    'MediaType.APPLICATION_FORM_URLENCODED_VALUE',
    'application/x-www-form-urlencoded',
  ],
  ['MediaType.APPLICATION_OCTET_STREAM_VALUE', 'application/octet-stream'],
  ['MediaType.ALL_VALUE', '*/*'],
]);

const mappingAnnotationPattern =
  /@(PostMapping|GetMapping|PutMapping|DeleteMapping|PatchMapping|RequestMapping)\b/;

export function findMethodEvidence(javaSource, handlerMethod) {
  const escaped = handlerMethod.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const methodPattern = new RegExp(`\\b${escaped}\\s*\\(`, 'g');
  const match = methodPattern.exec(javaSource);

  if (!match) {
    return {
      found: false,
      handlerMethod,
      annotation: '',
      signature: '',
      explicitConsumes: [],
      hasRequestBody: false,
      hasRequestPart: false,
      hasMultipartFile: false,
      hasRequestParam: false,
      inferredContentTypes: [],
      inference: 'HANDLER_NOT_FOUND',
    };
  }

  const before = javaSource.slice(0, match.index);
  const startWindow = Math.max(
    0,
    before.lastIndexOf('\n', Math.max(0, before.length - 2500)),
  );

  const window = javaSource.slice(startWindow, match.index);
  const lines = window.split(/\r?\n/);

  let annotationStart = -1;

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (mappingAnnotationPattern.test(lines[index])) {
      annotationStart = index;
      break;
    }

    if (/^\s*(public|protected|private)\b/.test(lines[index])) {
      break;
    }
  }

  const annotation = annotationStart >= 0
    ? lines.slice(annotationStart).join('\n').trim()
    : '';

  const methodTail = javaSource.slice(match.index);
  const openParen = methodTail.indexOf('(');

  let depth = 0;
  let closeParen = -1;

  for (let index = openParen; index < methodTail.length; index += 1) {
    const character = methodTail[index];

    if (character === '(') {
      depth += 1;
    }

    if (character === ')') {
      depth -= 1;

      if (depth === 0) {
        closeParen = index;
        break;
      }
    }
  }

  const signatureStart = Math.max(
    0,
    javaSource.lastIndexOf('\n', match.index) + 1,
  );

  const signature = closeParen >= 0
    ? javaSource
      .slice(signatureStart, match.index + closeParen + 1)
      .trim()
    : javaSource
      .slice(signatureStart, match.index + 500)
      .trim();

  const evidenceText = `${annotation}\n${signature}`;
  const explicitConsumes = new Set();

  const consumesMatch = annotation.match(
    /consumes\s*=\s*(\{[\s\S]*?\}|[^,\)]*)/,
  );

  if (consumesMatch) {
    const raw = consumesMatch[1];

    for (const [constant, value] of mediaTypeConstants.entries()) {
      if (raw.includes(constant)) {
        explicitConsumes.add(value);
      }
    }

    for (const quoted of raw.matchAll(/["']([^"']+)["']/g)) {
      const candidate = normalizeContentType(quoted[1]);

      if (candidate.includes('/')) {
        explicitConsumes.add(candidate);
      }
    }
  }

  const hasRequestBody = /@RequestBody\b/.test(evidenceText);
  const hasRequestPart = /@RequestPart\b/.test(evidenceText);
  const hasMultipartFile = /\bMultipartFile(?:\[\])?\b/.test(evidenceText);
  const hasRequestParam = /@RequestParam\b/.test(evidenceText);

  const inferred = new Set(explicitConsumes);
  let inference = 'UNRESOLVED';

  if (explicitConsumes.size > 0) {
    inference = 'EXPLICIT_CONSUMES';
  } else if (hasRequestBody) {
    inferred.add('application/json');
    inference = 'REQUEST_BODY_JSON';
  } else if (hasRequestPart || hasMultipartFile) {
    inferred.add('multipart/form-data');
    inference = 'MULTIPART_PARAMETER';
  } else {
    inferred.add('*/*');
    inference = 'NO_CONSUMES_CONDITION';
  }

  return {
    found: true,
    handlerMethod,
    annotation,
    signature,
    explicitConsumes: [...explicitConsumes],
    hasRequestBody,
    hasRequestPart,
    hasMultipartFile,
    hasRequestParam,
    inferredContentTypes: [...inferred],
    inference,
  };
}

function registryCandidatesForFrontend(registry, finding) {
  const wantedMethod = normalizeMethod(finding.frontendMethod);
  const wantedPath = normalizePath(finding.frontendEndpoint);

  return registry.filter(
    (record) =>
      normalizeMethod(record.httpMethod) === wantedMethod
      && (record.legacyEndpoints || []).some(
        (endpoint) => normalizePath(endpoint) === wantedPath,
      ),
  );
}

export function auditContentTypeFindings({
  report,
  registry,
  engineRoot,
}) {
  const findings = (report.findings || []).filter(
    (finding) => finding.findingType === 'CONTENT_TYPE_MISMATCH',
  );

  const results = [];

  for (const finding of findings) {
    const frontendContentType = normalizeContentType(
      finding.frontendContentType,
    );

    const candidates = registryCandidatesForFrontend(registry, finding);

    const exactSibling = candidates.find(
      (candidate) =>
        normalizeContentType(candidate.contentType) === frontendContentType,
    );

    if (exactSibling && exactSibling.actionKey !== finding.actionId) {
      results.push({
        findingId: finding.id,
        categoryId: finding.categoryId,
        categoryName: finding.categoryName,
        actionType: finding.actionType,
        actionName: finding.actionName,
        frontendMethod: normalizeMethod(finding.frontendMethod),
        frontendEndpoint: normalizePath(finding.frontendEndpoint),
        frontendContentType,
        reportedActionKey: finding.actionId,
        certifiedActionKey: exactSibling.actionKey,
        registryContentType: normalizeContentType(exactSibling.contentType),
        actualControllerContentTypes: [frontendContentType],
        classification: 'MATCHER_FALSE_POSITIVE',
        blockingAfterCertification: false,
        sourceFile: exactSibling.sourceFile || '',
        handlerMethod: exactSibling.handlerMethod || '',
        evidence:
          'A sibling registry descriptor exists for the same method and '
          + 'legacy path with the frontend content type.',
        recommendedAction:
          'Update parity/remediation matching to prefer an exact '
          + 'content-type sibling before reporting a mismatch.',
      });

      continue;
    }

    const descriptor =
      registry.find((record) => record.actionKey === finding.actionId)
      || exactSibling
      || candidates[0];

    if (!descriptor) {
      results.push({
        findingId: finding.id,
        categoryId: finding.categoryId,
        categoryName: finding.categoryName,
        actionType: finding.actionType,
        actionName: finding.actionName,
        frontendMethod: normalizeMethod(finding.frontendMethod),
        frontendEndpoint: normalizePath(finding.frontendEndpoint),
        frontendContentType,
        reportedActionKey: finding.actionId,
        certifiedActionKey: '',
        registryContentType: '',
        actualControllerContentTypes: [],
        classification: 'UNRESOLVED',
        blockingAfterCertification: true,
        sourceFile: '',
        handlerMethod: '',
        evidence: 'No registry descriptor matched the reported action.',
        recommendedAction: 'Inspect the action mapping manually.',
      });

      continue;
    }

    const sourcePath = path.resolve(
      engineRoot,
      descriptor.sourceFile || '',
    );

    if (!descriptor.sourceFile || !fs.existsSync(sourcePath)) {
      results.push({
        findingId: finding.id,
        categoryId: finding.categoryId,
        categoryName: finding.categoryName,
        actionType: finding.actionType,
        actionName: finding.actionName,
        frontendMethod: normalizeMethod(finding.frontendMethod),
        frontendEndpoint: normalizePath(finding.frontendEndpoint),
        frontendContentType,
        reportedActionKey: finding.actionId,
        certifiedActionKey: descriptor.actionKey,
        registryContentType: normalizeContentType(descriptor.contentType),
        actualControllerContentTypes: [],
        classification: 'UNRESOLVED',
        blockingAfterCertification: true,
        sourceFile: descriptor.sourceFile || '',
        handlerMethod: descriptor.handlerMethod || '',
        evidence: `Controller source file not found: ${sourcePath}`,
        recommendedAction:
          'Correct sourceFile metadata or inspect the controller manually.',
      });

      continue;
    }

    const javaSource = fs.readFileSync(sourcePath, 'utf8');

    const methodEvidence = findMethodEvidence(
      javaSource,
      descriptor.handlerMethod || '',
    );

    const actualTypes = methodEvidence.inferredContentTypes.map(
      normalizeContentType,
    );

    /*
     * Frontend compatibility:
     *
     * A concrete controller content type must match the frontend content type.
     * A controller with no consumes restriction accepts the frontend request.
     */
    const frontendCompatibleWithController =
      actualTypes.includes(frontendContentType)
      || actualTypes.includes('*/*');

    let classification = 'UNRESOLVED';
    let recommendedAction = 'Inspect the controller manually.';
    let blockingAfterCertification = true;

    if (methodEvidence.found && frontendCompatibleWithController) {
      const registryContentType = normalizeContentType(
        descriptor.contentType,
      );

      const registryMatchesFrontend =
        registryContentType === frontendContentType;

      const registryMatchesController = contentTypesMatch(
        registryContentType,
        actualTypes,
      );

      classification =
        registryMatchesFrontend || registryMatchesController
          ? 'ALREADY_ALIGNED'
          : 'REGISTRY_METADATA_DRIFT';

      recommendedAction =
        classification === 'REGISTRY_METADATA_DRIFT'
          ? `Correct registry contentType from ${registryContentType} `
            + `to ${frontendContentType}; do not change the frontend request.`
          : 'No source change is required.';

      blockingAfterCertification = false;
    } else if (methodEvidence.found) {
      classification = 'CONTROLLER_FRONTEND_CONFLICT';

      recommendedAction =
        'Align the frontend request builder with the actual controller '
        + 'or add a deliberate sibling controller mapping.';
    }

    results.push({
      findingId: finding.id,
      categoryId: finding.categoryId,
      categoryName: finding.categoryName,
      actionType: finding.actionType,
      actionName: finding.actionName,
      frontendMethod: normalizeMethod(finding.frontendMethod),
      frontendEndpoint: normalizePath(finding.frontendEndpoint),
      frontendContentType,
      reportedActionKey: finding.actionId,
      certifiedActionKey: descriptor.actionKey,
      registryContentType: normalizeContentType(descriptor.contentType),
      actualControllerContentTypes: actualTypes,
      classification,
      blockingAfterCertification,
      sourceFile: descriptor.sourceFile || '',
      handlerMethod: descriptor.handlerMethod || '',
      controllerInference: methodEvidence.inference,
      controllerAnnotation: methodEvidence.annotation,
      controllerSignature: methodEvidence.signature,
      evidence: methodEvidence.found
        ? `Controller inference ${methodEvidence.inference}: `
          + `${actualTypes.join(', ')}.`
        : 'Handler method was not found in the declared source file.',
      recommendedAction,
    });
  }

  const count = (classification) =>
    results.filter(
      (result) => result.classification === classification,
    ).length;

  const registryActionKeysToCorrect = [
    ...new Set(
      results
        .filter(
          (result) =>
            result.classification === 'REGISTRY_METADATA_DRIFT',
        )
        .map((result) => result.certifiedActionKey),
    ),
  ].sort();

  const requiresReview = results.some(
    (result) =>
      result.classification === 'UNRESOLVED'
      || result.classification === 'CONTROLLER_FRONTEND_CONFLICT',
  );

  return {
    schemaVersion: '1.0',
    generatedAt: new Date().toISOString(),
    status: requiresReview ? 'review_required' : 'success',
    verdict: requiresReview
      ? 'CONTROLLER_CONTENT_TYPE_CERTIFICATION_REQUIRES_REVIEW'
      : 'CONTROLLER_CONTENT_TYPE_CERTIFICATION_COMPLETE',
    readOnly: true,
    databaseWritesPerformed: 0,
    frontendSourceChangesPerformed: 0,
    engineSourceChangesPerformed: 0,
    executionRoutingChanged: false,
    summary: {
      inputFindings: findings.length,
      matcherFalsePositives: count('MATCHER_FALSE_POSITIVE'),
      registryMetadataDrift: count('REGISTRY_METADATA_DRIFT'),
      alreadyAligned: count('ALREADY_ALIGNED'),
      controllerFrontendConflicts: count(
        'CONTROLLER_FRONTEND_CONFLICT',
      ),
      unresolved: count('UNRESOLVED'),
      registryActionKeysToCorrect:
        registryActionKeysToCorrect.length,
      affectedPluginFamilies: new Set(
        results.map((result) => result.categoryName),
      ).size,
    },
    registryActionKeysToCorrect,
    findings: results,
  };
}

export function toCsv(report) {
  const headers = [
    'classification',
    'categoryName',
    'actionType',
    'actionName',
    'frontendMethod',
    'frontendEndpoint',
    'frontendContentType',
    'reportedActionKey',
    'certifiedActionKey',
    'registryContentType',
    'actualControllerContentTypes',
    'sourceFile',
    'handlerMethod',
    'controllerInference',
    'blockingAfterCertification',
    'recommendedAction',
  ];

  const escape = (value) => {
    const text = Array.isArray(value)
      ? value.join('|')
      : String(value ?? '');

    return `"${text.replaceAll('"', '""')}"`;
  };

  return [
    headers.map(escape).join(','),
    ...report.findings.map((row) =>
      headers.map((header) => escape(row[header])).join(',')),
  ].join('\n');
}

export function toMarkdown(report) {
  const summary = report.summary;

  const lines = [
    '# Phase 4C.3A â€” Actual Controller Content-Type Certification',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    '## Safety',
    '',
    `- Read only: ${report.readOnly}`,
    `- Database writes: ${report.databaseWritesPerformed}`,
    `- Frontend source changes: ${report.frontendSourceChangesPerformed}`,
    `- Engine source changes: ${report.engineSourceChangesPerformed}`,
    `- Execution routing changed: ${report.executionRoutingChanged}`,
    '',
    '## Summary',
    '',
    `- Input content-type findings: ${summary.inputFindings}`,
    `- Matcher false positives: ${summary.matcherFalsePositives}`,
    `- Registry metadata drift: ${summary.registryMetadataDrift}`,
    `- Already aligned: ${summary.alreadyAligned}`,
    `- Controller/frontend conflicts: ${summary.controllerFrontendConflicts}`,
    `- Unresolved: ${summary.unresolved}`,
    '- Registry action keys requiring correction: '
      + `${summary.registryActionKeysToCorrect}`,
    '',
    '## Required registry corrections',
    '',
    ...report.registryActionKeysToCorrect.map((key) => `- ${key}`),
    '',
    '## Findings by classification',
    '',
  ];

  for (const classification of [
    'MATCHER_FALSE_POSITIVE',
    'REGISTRY_METADATA_DRIFT',
    'ALREADY_ALIGNED',
    'CONTROLLER_FRONTEND_CONFLICT',
    'UNRESOLVED',
  ]) {
    const rows = report.findings.filter(
      (row) => row.classification === classification,
    );

    lines.push(`### ${classification} (${rows.length})`, '');

    for (const row of rows) {
      lines.push(
        `- **${row.categoryName} / ${row.actionName}** â€” `
        + `\`${row.frontendMethod} ${row.frontendEndpoint}\`; `
        + `frontend \`${row.frontendContentType}\`, `
        + `registry \`${row.registryContentType || 'n/a'}\`, `
        + 'controller '
        + `\`${(row.actualControllerContentTypes || []).join(', ') || 'unresolved'}\`.`,
      );
    }

    lines.push('');
  }

  return lines.join('\n');
}