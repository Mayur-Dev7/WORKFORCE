import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

export function requestLogger() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const requestId = (req.headers['x-request-id'] as string) || crypto.randomUUID();
    req.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);

    const startTime = Date.now();

    res.on('finish', () => {
      const durationMs = Date.now() - startTime;
      const logEntry = {
        requestId,
        timestamp: new Date().toISOString(),
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        durationMs,
        userId: req.user?.userId || null,
        ip: req.ip,
      };

      // Sanitize: never log sensitive body keys (passwords, tokens, embeddings)
      if (res.statusCode >= 400) {
        console.warn(`[REQ WARN] ${JSON.stringify(logEntry)}`);
      } else {
        console.log(`[REQ INFO] ${JSON.stringify(logEntry)}`);
      }
    });

    next();
  };
}
