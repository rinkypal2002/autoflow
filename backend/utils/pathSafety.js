const path = require('path');
const cfg = require('./../config');

/**
 * Resolve a user-supplied path and confine it to an allowed root.
 *
 * Security: prevents path-traversal / absolute-path escapes (e.g. "../../etc",
 * "C:\\Windows", "/root"). A relative path is resolved against the primary
 * root; an absolute path is accepted only if it already lives inside the
 * primary root or one of the explicitly whitelisted FILE_OPS_ALLOWED_ROOTS.
 *
 * @param {string|null} primaryRoot Active workspace root (or null).
 * @param {string} target          User-supplied path.
 * @returns {string}               Safe absolute path.
 * @throws  {Error}                If the path is empty, no root is configured,
 *                                 or the resolved path escapes every root.
 */
function safeResolve(primaryRoot, target) {
  if (typeof target !== 'string' || target.trim() === '') {
    throw new Error('Path must be a non-empty string.');
  }

  const roots = [primaryRoot, ...cfg.FILE_OPS_ALLOWED_ROOTS]
    .filter(Boolean)
    .map((r) => path.resolve(r));

  if (roots.length === 0) {
    throw new Error(
      'No allowed root for file operations. Select a workspace or set FILE_OPS_ALLOWED_ROOTS.'
    );
  }

  const abs = path.isAbsolute(target)
    ? path.resolve(target)
    : path.resolve(roots[0], target);

  const isContained = roots.some((r) => abs === r || abs.startsWith(r + path.sep));
  if (!isContained) {
    throw new Error('Path escapes the allowed workspace root.');
  }

  return abs;
}

module.exports = { safeResolve };
