import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import apiV1Router from './routes/index.js';
import { requestLogger } from './middleware/logger.middleware.js';
import { apiRateLimiter } from './middleware/rateLimiter.middleware.js';
import { errorHandler } from './middleware/errorHandler.middleware.js';

export function createApp(): Express {
  const app = express();

  // Basic security and parsing
  app.use(helmet());
  const allowedOrigins = [
    process.env.CLIENT_URL || 'http://localhost:5173',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ];

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin) || origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
          callback(null, true);
        } else {
          callback(null, true); // Permissive for local development
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    })
  );
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(cookieParser());

  // Logging & rate-limiting
  app.use(requestLogger());
  app.use('/api', apiRateLimiter);

  // Health check endpoint
  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // API v1 routes
  app.use('/api/v1', apiV1Router);

  // Global Error Handler
  app.use(errorHandler);

  return app;
}
