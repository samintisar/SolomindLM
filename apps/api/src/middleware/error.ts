import { Request, Response, NextFunction } from 'express';

/**
 * Custom error class for application errors
 */
export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 500,
    public isOperational: boolean = true,
    public code?: string
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Error response structure
 */
interface ErrorResponse {
  error: string;
  code?: string;
  requestId?: string;
}

/**
 * Structured error logging for security monitoring
 */
function logError(err: Error, req: Request): void {
  const errorLog = {
    timestamp: new Date().toISOString(),
    error: {
      name: err.name,
      message: err.message,
      stack: err.stack,
    },
    request: {
      method: req.method,
      path: req.path,
      query: req.query,
      body: req.body ? '[REDACTED]' : undefined,
      headers: {
        'user-agent': req.get('user-agent'),
        'x-forwarded-for': req.get('x-forwarded-for'),
      },
    },
    user: req.user ? { id: req.user.id } : undefined,
  };

  // Log to console (in production, this should go to a proper logging service)
  console.error('[Error]', JSON.stringify(errorLog, null, 2));
}

/**
 * Determines if error details should be exposed to client
 */
function shouldExposeErrorDetails(err: Error): boolean {
  // Only expose details in development
  return process.env.NODE_ENV === 'development';
}

/**
 * Maps error types to appropriate status codes
 */
function getStatusCodeFromError(err: Error): number {
  if (err instanceof AppError) {
    return err.statusCode;
  }

  // Handle common error types
  if ((err as any).code === 'UNAUTHORIZED' || err.name === 'UnauthorizedError') {
    return 401;
  }

  if ((err as any).code === 'FORBIDDEN') {
    return 403;
  }

  if ((err as any).code === 'NOT_FOUND') {
    return 404;
  }

  if ((err as any).code === 'CONFLICT') {
    return 409;
  }

  if ((err as any).code === 'VALIDATION_ERROR') {
    return 400;
  }

  // Default to 500 for unknown errors
  return 500;
}

/**
 * Formats error response for client
 */
function formatErrorResponse(err: Error, req: Request): ErrorResponse {
  const statusCode = getStatusCodeFromError(err);
  const response: ErrorResponse = {
    error: getSafeErrorMessage(err, statusCode),
  };

  // Include error code if available
  if (err instanceof AppError && err.code) {
    response.code = err.code;
  }

  // Include request ID for tracing
  response.requestId = generateRequestId();

  // Add detailed error information in development only
  if (shouldExposeErrorDetails(err)) {
    (response as any).details = {
      message: err.message,
      stack: err.stack,
    };
  }

  return response;
}

/**
 * Generates a unique request ID for tracing
 */
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Returns a safe error message that doesn't expose sensitive information
 */
function getSafeErrorMessage(err: Error, statusCode: number): string {
  // Operational errors (expected errors) can expose their message
  if (err instanceof AppError && err.isOperational) {
    return err.message;
  }

  // For specific status codes, use generic messages
  const genericMessages: Record<number, string> = {
    400: 'Bad request. Please check your input.',
    401: 'Unauthorized. Please authenticate.',
    403: 'Forbidden. You do not have permission to access this resource.',
    404: 'Resource not found.',
    409: 'Conflict. The resource already exists or is in an invalid state.',
    429: 'Too many requests. Please try again later.',
    500: 'Internal server error. Please try again later.',
    503: 'Service temporarily unavailable. Please try again later.',
  };

  return genericMessages[statusCode] || 'An error occurred. Please try again.';
}

/**
 * Global error handler middleware
 *
 * Catches all errors and formats them appropriately for the client
 * while logging full details for debugging
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Log the error with full context
  logError(err, req);

  // Format and send error response
  const statusCode = getStatusCodeFromError(err);
  const errorResponse = formatErrorResponse(err, req);

  res.status(statusCode).json(errorResponse);
}

/**
 * Async handler wrapper to catch errors in async route handlers
 *
 * Usage:
 * router.get('/', asyncHandler(async (req, res) => {
 *   // Your async code here
 * }));
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * 404 Not Found handler
 */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: 'Resource not found',
    requestId: generateRequestId(),
  });
}
