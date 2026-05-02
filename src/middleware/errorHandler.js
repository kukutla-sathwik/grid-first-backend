// Centralized error handler
export function errorHandler(err, req, res, _next) {
  // eslint-disable-next-line no-console
  console.error(err);

  if (res.headersSent) {
    return;
  }

  const status = err.status || 500;
  const message = err.message || 'Internal server error';

  res.status(status).json({ message });
}

