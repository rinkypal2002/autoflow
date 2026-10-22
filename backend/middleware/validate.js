/**
 * Minimal request-body validation middleware.
 *
 * Usage:  app.post('/api/x', validateBody(schema), handler)
 *
 * On success the parsed/normalized value replaces req.body. On failure it
 * returns 400 with structured issues. Keeps endpoints declarative without a
 * framework rewrite.
 */
function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        issues: result.error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      });
    }
    req.body = result.data;
    return next();
  };
}

module.exports = { validateBody };
