"use strict";
/**
 * Builder presentation helpers — execution status, contextual error messaging,
 * and pre-run validation. PURE/UI-ONLY: nothing here changes execution
 * behavior, engine calls, or contracts. It only interprets data the editor
 * already produces so the UI can present it clearly.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.humanizeMessage = humanizeMessage;
exports.levelTone = levelTone;
exports.statusMeta = statusMeta;
exports.summarizeLogs = summarizeLogs;
exports.formatLogTime = formatLogTime;
exports.validateWorkflow = validateWorkflow;
/**
 * Turn a raw log/error string into contextual UI messaging.
 * e.g. "Failed to fetch" -> "Engine unavailable".
 */
function humanizeMessage(raw, level) {
    const msg = (raw ?? '').toString();
    const lvl = (level ?? '').toLowerCase();
    const m = msg.toLowerCase();
    if (/failed to fetch|networkerror|network error|err_connection|fetch failed|load failed/.test(m)) {
        return {
            title: 'Engine unavailable',
            detail: 'Could not reach the automation engine. Check that the engine service is running and reachable.',
            tone: 'danger',
        };
    }
    if (/timeout|timed out|aborted|aborterror/.test(m)) {
        return { title: 'Request timed out', detail: msg, tone: 'warning' };
    }
    if (/invalid cors|cors request|blocked by cors|access-control-allow-origin|cross-origin/.test(m)) {
        return {
            title: 'Request blocked by CORS',
            detail: 'The frontend reached the server through a cross-origin URL. Use the same-origin /engine proxy (restart Vite after configuration changes) or allow this frontend origin in the engine CORS settings.',
            tone: 'danger',
        };
    }
    if (/\b(401|403|unauthorized|forbidden)\b/.test(m)) {
        return { title: 'Authorization failed', detail: msg, tone: 'danger' };
    }
    if (/\b(400|422)\b|invalid request|bad request|validation/.test(m)) {
        return { title: 'Validation failed', detail: msg, tone: 'warning' };
    }
    if (/\b(5\d\d)\b|internal server error/.test(m)) {
        return { title: 'Request failed', detail: msg, tone: 'danger' };
    }
    if (lvl === 'error') {
        return { title: 'Node execution failed', detail: msg, tone: 'danger' };
    }
    if (lvl === 'warning' || lvl === 'warn')
        return { title: msg || 'Warning', tone: 'warning' };
    if (lvl === 'success')
        return { title: msg || 'Success', tone: 'success' };
    return { title: msg || 'Info', tone: 'info' };
}
function levelTone(level) {
    const l = (level ?? '').toLowerCase();
    if (l === 'success')
        return 'success';
    if (l === 'error')
        return 'danger';
    if (l === 'warning' || l === 'warn')
        return 'warning';
    return 'info';
}
/** Map an action runtime status to a UI tone/label. */
function statusMeta(status) {
    switch ((status ?? '').toLowerCase()) {
        case 'running':
            return { tone: 'info', label: 'Running' };
        case 'completed':
        case 'success':
            return { tone: 'success', label: 'Completed' };
        case 'failed':
        case 'error':
            return { tone: 'danger', label: 'Failed' };
        case 'skipped':
            return { tone: 'warning', label: 'Skipped' };
        case 'pending':
            return { tone: 'neutral', label: 'Pending' };
        default:
            return { tone: 'neutral', label: 'Idle' };
    }
}
/** Consistent counts from a log array (single source of truth for the panel). */
function summarizeLogs(logs) {
    const s = { total: logs.length, succeeded: 0, failed: 0, warnings: 0, info: 0 };
    for (const log of logs) {
        const l = (log.level ?? 'info').toLowerCase();
        if (l === 'success')
            s.succeeded += 1;
        else if (l === 'error')
            s.failed += 1;
        else if (l === 'warning' || l === 'warn')
            s.warnings += 1;
        else
            s.info += 1;
    }
    return s;
}
function formatLogTime(iso) {
    if (!iso)
        return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime()))
        return '';
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
/**
 * Best-effort required-field check, derived from each action's `propertyConfig`
 * (entries flagged `required: true`) against its `properties`. Used only to
 * highlight nodes and show a count — it does NOT block or alter execution.
 */
function validateWorkflow(actions) {
    const issues = [];
    for (const action of actions ?? []) {
        const type = String(action?.type ?? '').trim().toLowerCase();
        const configurableControlNode = type === 'workflow-for-each' ||
            type === 'workflow-while' ||
            type === 'workflow-repeat-until';
        if (action?.isControlNode && !configurableControlNode)
            continue;
        const cfg = action?.propertyConfig ?? {};
        const props = action?.properties ?? {};
        const missing = [];
        for (const [key, meta] of Object.entries(cfg)) {
            const required = meta?.required === true;
            if (!required)
                continue;
            const value = props[key];
            const empty = value === undefined ||
                value === null ||
                (typeof value === 'string' && value.trim() === '') ||
                (Array.isArray(value) && value.length === 0);
            if (empty)
                missing.push(meta?.label || key);
        }
        if (missing.length > 0) {
            issues.push({ nodeId: action.id, nodeName: action.name || action.type || 'Untitled node', missing });
        }
    }
    return { issues, count: issues.length };
}
