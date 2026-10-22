const cfg = require('../config');

/**
 * Authentication framework (opt-in).
 *
 * Behaviour:
 *   - No-op while AUTH_ENABLED=false (default) so current functionality is
 *     preserved out of the box.
 *   - When AUTH_ENABLED=true, every /api route except /api/health requires
 *     `Authorization: Bearer <API_AUTH_TOKEN>`.
 *
 * This is intentionally a thin, swappable gate. When the team adopts real
 * sessions/JWT/OIDC, replace the token comparison below — the wiring in
 * server.js (`app.use('/api', authMiddleware)`) stays identical.
 */
function authMiddleware(req, res, next) {
  if (!cfg.AUTH_ENABLED) return next();

  // Always allow liveness checks.
  if (req.path === '/health' || req.path === '/api/health') return next();

  if (!cfg.API_AUTH_TOKEN) {
    return res
      .status(503)
      .json({ error: 'Authentication is enabled but API_AUTH_TOKEN is not configured.' });
  }

  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';

  if (!token || token !== cfg.API_AUTH_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  return next();
}

module.exports = authMiddleware;
