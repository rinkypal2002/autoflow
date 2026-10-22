#!/usr/bin/env node
/**
 * Contract drift detector.
 *
 * The platform declares every plugin field TWICE:
 *   • in the frontend service registry  (src/data/automationCategories.ts)
 *   • in the Java DTO the endpoint binds (@RequestBody SomeEntity)
 *
 * Nothing keeps the two in sync. This tool joins them on the endpoint URL and
 * reports every place they disagree — which is exactly the set of latent
 * "works until the last node, then 400" failures.
 *
 * Usage:
 *   node contract-drift.mjs <registry.ts> <modules-dir> [--json]
 *
 * Exit code 1 when any ERROR-level drift is found, so it can gate CI.
 */

import fs from 'node:fs';
import path from 'node:path';

const [, , registryPath, modulesDir, ...flags] = process.argv;
const asJson = flags.includes('--json');

if (!registryPath || !modulesDir) {
  console.error('usage: node contract-drift.mjs <registry.ts> <modules-dir> [--json]');
  process.exit(2);
}

/* -------------------------------------------------------------------------- */
/*                          1. FRONTEND SERVICE REGISTRY                      */
/* -------------------------------------------------------------------------- */

function loadRegistry(file) {
  const source = fs.readFileSync(file, 'utf8');
  // Anchor on the assignment, not on `automationCategories` — the declaration
  // reads `automationCategories: AutomationCategory[] = [`, and the `[]` in the
  // type annotation would otherwise be picked up as an empty array.
  const decl = /export\s+const\s+automationCategories\s*:[^=]*=\s*\[/.exec(source);
  if (!decl) throw new Error('could not locate the automationCategories array');
  const start = decl.index + decl[0].length - 1;

  // Find the matching close bracket of the top-level array.
  let depth = 0;
  let end = -1;
  let inString = false;
  let quote = '';
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (inString) {
      if (ch === '\\') { i += 1; continue; }
      if (ch === quote) inString = false;
      continue;
    }
    if (ch === '"' || ch === "'") { inString = true; quote = ch; continue; }
    if (ch === '[' || ch === '{') depth += 1;
    if (ch === ']' || ch === '}') {
      depth -= 1;
      if (depth === 0) { end = i; break; }
    }
  }
  const literal = stripJsComments(source.slice(start, end + 1)).replace(/\bundefined\b/g, 'null');
  return JSON.parse(literal);
}

/**
 * Remove `//` and block comments from a JS object literal without touching
 * anything inside a string (a URL such as `http://…` must survive).
 */
function stripJsComments(text) {
  let out = '';
  let inString = false;
  let quote = '';
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (inString) {
      out += ch;
      if (ch === '\\') { out += next ?? ''; i += 1; continue; }
      if (ch === quote) inString = false;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inString = true;
      quote = ch;
      out += ch;
      continue;
    }
    if (ch === '/' && next === '/') {
      while (i < text.length && text[i] !== '\n') i += 1;
      out += '\n';
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i += 1;
      i += 1;
      continue;
    }
    out += ch;
  }
  // Trailing commas left behind by a removed entry.
  return out.replace(/,(\s*[}\]])/g, '$1');
}

/**
 * Normalise an engine endpoint URL to a comparable path: `/api/v1/teams/send-chat`.
 * Returns null for third-party URLs (graph.microsoft.com, login.microsoftonline.com,
 * zoho, …) — those are called directly by a plugin's own HTTP client and have no
 * Java controller here, so comparing them would be noise.
 */
function normalizePath(url) {
  if (typeof url !== 'string') return null;

  const host = /^https?:\/\/([^/]+)/i.exec(url);
  if (host) {
    const h = host[1].toLowerCase();
    const isEngineHost =
      h.startsWith('localhost') || h.startsWith('127.0.0.1') || h.startsWith('0.0.0.0');
    if (!isEngineHost) return null;
  }

  let p = url
    .replace(/^https?:\/\/[^/]+/i, '')   // strip host
    .replace(/^\/engine/i, '')            // strip the servlet context path
    .replace(/\?.*$/, '')                 // strip query
    .replace(/\/+$/, '');                 // strip trailing slash
  if (!p.startsWith('/')) p = '/' + p;
  return p.toLowerCase();
}

function collectRegistryActions(categories) {
  const actions = [];
  for (const category of categories) {
    for (const action of category.actions ?? []) {
      const url = action?.api?.url;
      if (!url) continue;
      const endpoint = normalizePath(url);
      // Third-party URLs (normalizePath returns null) are called by a plugin's
      // own HTTP client and have no controller here. A URL still carrying a
      // {{binding}} is resolved at run time and cannot be matched statically.
      if (!endpoint) continue;
      if (endpoint.includes('{{')) continue;
      actions.push({
        category: category.id,
        categoryName: category.name,
        type: action.type,
        name: action.name,
        method: String(action?.api?.method ?? 'POST').toUpperCase(),
        url,
        endpoint,
        propertyConfig: action.propertyConfig ?? {},
        bodyType: action?.api?.bodyType ?? null,
      });
    }
  }
  return actions;
}

/* -------------------------------------------------------------------------- */
/*                               2. JAVA SOURCES                              */
/* -------------------------------------------------------------------------- */

function walkJava(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'target' || entry.name === '.git') continue;
      walkJava(full, out);
    } else if (entry.name.endsWith('.java')) {
      out.push(full);
    }
  }
  return out;
}

const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** DTO classes: fully-qualified name -> { field -> javaType, extends }. */
function parseDtos(files) {
  const dtos = new Map();
  const bySimpleName = new Map();

  for (const file of files) {
    const src = stripComments(fs.readFileSync(file, 'utf8'));
    const pkgMatch = /^\s*package\s+([\w.]+)\s*;/m.exec(src);
    const pkg = pkgMatch ? pkgMatch[1] : '';
    const classMatch = /(?:public\s+)?(?:abstract\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?/.exec(src);
    if (!classMatch) continue;
    const simpleName = classMatch[1];
    const superSimple = classMatch[2] ?? null;
    // Key by FQN. Two modules both ship a `ConnectionRequest`, and a
    // simple-name key silently let the first one shadow the second — which
    // reported every @JsonProperty field of database_plugin as missing.
    const fqn = pkg ? `${pkg}.${simpleName}` : simpleName;

    const fields = {};
    // Find each field declaration, then look BACKWARD for its Jackson naming
    // annotations. A forward-chained regex cannot do this reliably: annotations
    // like @Pattern(regexp = "(?i)^(mysql|oracle)$") contain parentheses inside
    // a string literal, which truncates any `\([^)]*\)` match and silently drops
    // the @JsonProperty that preceded it.
    const fieldRe = /private\s+(?:final\s+)?([\w<>,\s.\[\]]+?)\s+(\w+)\s*(?:=[^;]*)?;/g;
    let m;
    while ((m = fieldRe.exec(src)) !== null) {
      const javaType = m[1].replace(/\s+/g, '');
      const fieldName = m[2];

      if (/^(log|logger|LOG|LOGGER)$/.test(fieldName)) continue;
      if (/Service$|Repository$|Client$|Mapper$|Template$|Logger$/.test(javaType)) continue;

      // Walk backward line by line to collect this field's annotation block.
      // A character-based boundary scan does not work: `@JsonAlias({"x"})`
      // contains braces, and `@Pattern(regexp = "(a|b)")` contains parentheses,
      // so both `}` and `)` are unreliable delimiters. A previous member always
      // ends in `;`, and annotations never do — that is the reliable boundary.
      const before = src.slice(0, m.index).split('\n');
      const blockLines = [];
      for (let i = before.length - 1; i >= 0 && blockLines.length < 20; i -= 1) {
        const line = before[i].trim();
        if (line === '') continue;
        if (line.endsWith(';') || /\bclass\s+\w+/.test(line)) break;
        blockLines.unshift(line);
      }
      const block = blockLines.join('\n');

      const names = new Set([fieldName]);
      const prop = /@JsonProperty\s*\(\s*"([^"]*)"/.exec(block);
      if (prop) names.add(prop[1]);
      const alias = /@JsonAlias\s*\(\s*(\{[^}]*\}|"[^"]*")/.exec(block);
      if (alias) {
        for (const a of alias[1].matchAll(/"([^"]*)"/g)) names.add(a[1]);
      }
      for (const name of names) fields[name] = javaType;
    }
    if (Object.keys(fields).length > 0 || superSimple) {
      if (!dtos.has(fqn)) {
        dtos.set(fqn, { file, fields, pkg, simpleName, superSimple });
        if (!bySimpleName.has(simpleName)) bySimpleName.set(simpleName, []);
        bySimpleName.get(simpleName).push(fqn);
      }
    }
  }

  // Flatten inheritance: a DTO that `extends ConnectionRequest` really does
  // accept every field the parent declares. Without this the tool reports every
  // inherited connection field as "not in DTO". The superclass is resolved
  // within the same package first, then by unique simple name.
  const resolved = new Map();
  const resolveSuper = (entry) => {
    if (!entry.superSimple) return null;
    const samePkg = `${entry.pkg}.${entry.superSimple}`;
    if (dtos.has(samePkg)) return samePkg;
    const candidates = bySimpleName.get(entry.superSimple) ?? [];
    return candidates.length === 1 ? candidates[0] : null;
  };

  const resolve = (fqn, seen = new Set()) => {
    if (resolved.has(fqn)) return resolved.get(fqn);
    const entry = dtos.get(fqn);
    if (!entry || seen.has(fqn)) return { file: entry?.file, fields: entry?.fields ?? {} };
    seen.add(fqn);

    let inherited = {};
    const superFqn = resolveSuper(entry);
    if (superFqn) inherited = resolve(superFqn, seen).fields;

    const merged = {
      file: entry.file,
      pkg: entry.pkg,
      simpleName: entry.simpleName,
      fields: { ...inherited, ...entry.fields },
    };
    resolved.set(fqn, merged);
    return merged;
  };
  for (const fqn of dtos.keys()) resolve(fqn);

  return { byFqn: resolved, bySimpleName };
}

/** Controllers: endpoint path -> { dto, method, file }. */
function parseControllers(files) {
  const endpoints = new Map();

  for (const file of files) {
    const raw = fs.readFileSync(file, 'utf8');
    if (!/@RestController|@Controller\b/.test(raw)) continue;
    const src = stripComments(raw);

    // The controller's own package and imports are what disambiguate a DTO
    // simple name: `ConnectionRequest` means a different class in the SFTP
    // module than in database_plugin.
    const pkgMatch = /^\s*package\s+([\w.]+)\s*;/m.exec(src);
    const ownPkg = pkgMatch ? pkgMatch[1] : '';
    const imports = [...src.matchAll(/^\s*import\s+(?:static\s+)?([\w.]+(?:\.\*)?)\s*;/gm)]
      .map((x) => x[1]);

    // Class-level base path. May be an array — the SFTP module maps both
    // `/api/sftp` and `/sftp-plugin/api/sftp`, and reading only the first would
    // report every registry URL using the second prefix as missing.
    const baseMatch = /@RequestMapping\s*\(\s*(?:value\s*=\s*)?(\{[^}]*\}|"[^"]*")/.exec(src);
    const basePaths = baseMatch
      ? [...baseMatch[1].matchAll(/"([^"]*)"/g)].map((x) => x[1])
      : [''];

    // Method-level mappings, including multi-path arrays. The `throws` clause is
    // optional but must be tolerated — omitting it silently skipped every Drive
    // controller, all of which declare `throws Exception`.
    const mapRe =
      /@(Post|Get|Put|Delete|Patch|Request)Mapping\s*\(([\s\S]*?)\)\s*(?:@\w+(?:\([^)]*\))?\s*)*public\s+[\w<>,\s.\[\]]+\s+(\w+)\s*\(([\s\S]*?)\)\s*(?:throws\s+[\w\s,.]+?)?\s*\{/g;

    let m;
    while ((m = mapRe.exec(src)) !== null) {
      const verb = m[1].toUpperCase();
      const argsBlob = m[2];
      const params = m[4];

      const paths = [...argsBlob.matchAll(/"([^"]*)"/g)].map((x) => x[1]);
      if (paths.length === 0) paths.push('');

      const bodyMatch = /@RequestBody\s*(?:\([^)]*\)\s*)?(?:@Valid\s+)?(?:final\s+)?([\w<>,.\[\]]+)\s+\w+/.exec(params)
        || /@Valid\s+@RequestBody\s*(?:final\s+)?([\w<>,.\[\]]+)\s+\w+/.exec(params);

      const hasValid = /@Valid/.test(params);
      const isMultipart = /MultipartFile/.test(params);

      for (const p of paths) {
        for (const basePath of basePaths) {
          const full = normalizePath((basePath + '/' + p).replace(/\/+/g, '/'));
          if (!full) continue;
          if (!endpoints.has(full)) {
            endpoints.set(full, {
              verb: verb === 'REQUEST' ? 'ANY' : verb,
              dto: bodyMatch ? bodyMatch[1].replace(/<.*>/, '') : null,
              ownPkg,
              imports,
              hasValid,
              isMultipart,
              file,
            });
          }
        }
      }
    }
  }
  return endpoints;
}

/* -------------------------------------------------------------------------- */
/*                            3. TYPE COMPATIBILITY                           */
/* -------------------------------------------------------------------------- */

const TEXTY = new Set(['string', 'text', 'textarea', 'password', 'secret', 'select',
  'radio', 'date', 'time', 'datetime', 'email', 'url', 'code', 'sql', 'enum']);
const NUMERIC = new Set(['number', 'integer', 'int', 'float', 'double', 'decimal']);
const BOOLY = new Set(['boolean', 'bool', 'checkbox', 'switch', 'toggle']);
const LISTY = new Set(['array', 'list', 'multiselect', 'multi-select', 'user-list', 'tags']);
const OBJECTY = new Set(['object', 'map', 'json', 'record', 'keyvalue', 'key-value']);
const FILEY = new Set(['file', 'binary', 'blob', 'upload', 'attachment']);

function uiKind(spec) {
  const t = String(spec?.type ?? '').toLowerCase();
  const u = String(spec?.uiType ?? '').toLowerCase();
  for (const c of [t, u]) {
    if (TEXTY.has(c)) return 'text';
    if (NUMERIC.has(c)) return 'number';
    if (BOOLY.has(c)) return 'boolean';
    if (LISTY.has(c)) return 'list';
    if (OBJECTY.has(c)) return 'object';
    if (FILEY.has(c)) return 'file';
  }
  return 'unknown';
}

function javaKind(javaType) {
  const t = String(javaType ?? '');
  // Anchored on both ends (or on a generic parameter list). Without the closing
  // anchor, `Set` matched the prefix of `SettingsConfig` and reported a nested
  // DTO as a collection.
  if (/^(List|Set|Collection|ArrayList|HashSet|Iterable)(<.*>)?$/.test(t) || /\[\]$/.test(t)) return 'list';
  if (/^(Map|HashMap|LinkedHashMap)(<.*>)?$/.test(t)) return 'object';
  if (/^(String|Character|char)$/.test(t)) return 'text';
  if (/^(Integer|int|Long|long|Double|double|Float|float|Short|short|BigDecimal|BigInteger|Number)$/.test(t)) return 'number';
  if (/^(Boolean|boolean)$/.test(t)) return 'boolean';
  if (/^MultipartFile(\[\])?$/.test(t)) return 'file';
  if (/^(Object|JsonNode|JSONObject)$/.test(t)) return 'any';
  return 'complex';
}

/**
 * Is a UI-declared kind safely bindable to a Java kind by Jackson?
 * Returns null when compatible, or a severity + reason when not.
 */
function incompatibility(ui, java) {
  if (ui === 'unknown' || java === 'any') return null;
  if (ui === java) return null;

  // Jackson coerces scalars to String silently.
  if (java === 'text' && (ui === 'number' || ui === 'boolean')) return null;
  // Numeric text parses.
  if (java === 'number' && ui === 'text') return null;
  if (java === 'boolean' && ui === 'text') return null;
  // A complex DTO field fed by a UI object is fine.
  if (java === 'complex' && ui === 'object') return null;
  if (java === 'list' && ui === 'list') return null;

  if (java === 'text' && (ui === 'list' || ui === 'object')) {
    return { severity: 'ERROR', reason: 'UI can bind a container into a Java String → Jackson 400' };
  }
  if (java === 'list' && (ui === 'text' || ui === 'number')) {
    return { severity: 'ERROR', reason: 'UI scalar into a Java List → Jackson 400' };
  }
  if (java === 'number' && (ui === 'list' || ui === 'object')) {
    return { severity: 'ERROR', reason: 'UI container into a Java numeric → Jackson 400' };
  }
  if (java === 'object' && ui === 'text') {
    return { severity: 'WARN', reason: 'UI text into a Java Map — only parses if it is valid JSON' };
  }
  if (java === 'complex' && ui === 'text') {
    return { severity: 'WARN', reason: 'UI text into a nested DTO — only parses if it is valid JSON' };
  }
  return { severity: 'WARN', reason: `UI ${ui} vs Java ${java}` };
}

/* -------------------------------------------------------------------------- */
/*                                 4. ANALYSE                                 */
/* -------------------------------------------------------------------------- */

const categories = loadRegistry(registryPath);
const actions = collectRegistryActions(categories);
const javaFiles = walkJava(modulesDir);
const { byFqn: dtoIndex, bySimpleName } = parseDtos(javaFiles);
const endpoints = parseControllers(javaFiles);

/**
 * Resolve a DTO simple name to a concrete class using the controller's own
 * import list, then its package, then a unique global match. Returns null when
 * the name is genuinely ambiguous, so the tool stays silent rather than
 * comparing against the wrong class.
 */
function resolveDto(simpleName, ep) {
  if (!simpleName) return null;

  const explicit = (ep.imports ?? []).find((i) => i.endsWith(`.${simpleName}`));
  if (explicit && dtoIndex.has(explicit)) return dtoIndex.get(explicit);

  const samePkg = `${ep.ownPkg}.${simpleName}`;
  if (dtoIndex.has(samePkg)) return dtoIndex.get(samePkg);

  // Wildcard imports: `import com.x.dto.*;`
  for (const imp of ep.imports ?? []) {
    if (!imp.endsWith('.*')) continue;
    const candidate = `${imp.slice(0, -2)}.${simpleName}`;
    if (dtoIndex.has(candidate)) return dtoIndex.get(candidate);
  }

  const candidates = bySimpleName.get(simpleName) ?? [];
  if (candidates.length === 1) return dtoIndex.get(candidates[0]);
  return null;
}

const stats = {
  registryEndpoints: actions.length,
  javaEndpoints: endpoints.size,
  javaDtos: dtoIndex.size,
  matched: 0,
  unmatched: 0,
  fieldsChecked: 0,
};

const findings = [];

for (const action of actions) {
  const ep = endpoints.get(action.endpoint);

  if (!ep) {
    stats.unmatched += 1;
    findings.push({
      severity: 'WARN',
      kind: 'NO_JAVA_ENDPOINT',
      node: `${action.categoryName} › ${action.name}`,
      endpoint: action.endpoint,
      detail: 'Registry declares this endpoint but no Java controller mapping was found.',
    });
    continue;
  }
  stats.matched += 1;

  if (ep.isMultipart || action.bodyType === 'form-data') continue;
  if (!ep.dto) continue;

  const dto = resolveDto(ep.dto, ep);
  if (!dto) {
    findings.push({
      severity: 'INFO',
      kind: 'DTO_NOT_RESOLVED',
      node: `${action.categoryName} › ${action.name}`,
      endpoint: action.endpoint,
      detail: `Could not resolve DTO "${ep.dto}" unambiguously — skipped rather than guessed.`,
    });
    continue;
  }

  const uiFields = Object.keys(action.propertyConfig ?? {});

  for (const field of uiFields) {
    const spec = action.propertyConfig[field];
    const javaType = dto.fields[field];
    stats.fieldsChecked += 1;

    if (!javaType) {
      findings.push({
        severity: 'WARN',
        kind: 'FIELD_NOT_IN_DTO',
        node: `${action.categoryName} › ${action.name}`,
        endpoint: action.endpoint,
        field,
        detail: `UI sends "${field}" but ${ep.dto} has no such field — Jackson silently discards it.`,
      });
      continue;
    }

    const ui = uiKind(spec);
    const java = javaKind(javaType);
    const bad = incompatibility(ui, java);
    if (bad) {
      findings.push({
        severity: bad.severity,
        kind: 'TYPE_MISMATCH',
        node: `${action.categoryName} › ${action.name}`,
        endpoint: action.endpoint,
        field,
        uiType: spec?.type ?? spec?.uiType ?? '?',
        javaType,
        detail: bad.reason,
      });
    }
  }

  if (!ep.hasValid) {
    const hasRequired = uiFields.some((f) => action.propertyConfig[f]?.required);
    if (hasRequired) {
      findings.push({
        severity: 'INFO',
        kind: 'NO_VALID',
        node: `${action.categoryName} › ${action.name}`,
        endpoint: action.endpoint,
        detail: `${ep.dto} is bound without @Valid — required fields are not enforced server-side.`,
      });
    }
  }
}

/* -------------------------------------------------------------------------- */
/*                                 5. REPORT                                  */
/* -------------------------------------------------------------------------- */

const bySeverity = (s) => findings.filter((f) => f.severity === s);
const errors = bySeverity('ERROR');
const warns = bySeverity('WARN');
const infos = bySeverity('INFO');

if (asJson) {
  console.log(JSON.stringify({ stats, findings }, null, 2));
} else {
  const line = (n = 78) => '─'.repeat(n);
  console.log('\nCONTRACT DRIFT REPORT');
  console.log(line());
  console.log(`Registry endpoints : ${stats.registryEndpoints}`);
  console.log(`Java endpoints     : ${stats.javaEndpoints}`);
  console.log(`Java DTOs          : ${stats.javaDtos}`);
  console.log(`Matched            : ${stats.matched}   (unmatched: ${stats.unmatched})`);
  console.log(`Fields compared    : ${stats.fieldsChecked}`);
  console.log(line());
  console.log(`ERROR ${errors.length}   WARN ${warns.length}   INFO ${infos.length}\n`);

  const group = (label, list, limit = 40) => {
    if (list.length === 0) return;
    console.log(`\n${label}  (${list.length})`);
    console.log(line());
    const byKind = {};
    for (const f of list) (byKind[f.kind] ??= []).push(f);
    for (const [kind, items] of Object.entries(byKind)) {
      console.log(`\n  ${kind} — ${items.length}`);
      for (const f of items.slice(0, limit)) {
        const loc = f.field ? `${f.endpoint} › ${f.field}` : f.endpoint;
        const types = f.uiType ? `  [ui:${f.uiType} vs java:${f.javaType}]` : '';
        console.log(`    ${f.node}`);
        console.log(`      ${loc}${types}`);
        console.log(`      ${f.detail}`);
      }
      if (items.length > limit) console.log(`    … and ${items.length - limit} more`);
    }
  };

  group('ERRORS — will produce a 400 when the field is bound', errors);
  group('WARNINGS', warns, 25);
  group('INFO', infos, 15);
  console.log('');
}

process.exit(errors.length > 0 ? 1 : 0);
