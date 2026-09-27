import dotenv from 'dotenv';
dotenv.config();

import { createApp } from './app.js';
import { pool, closePool } from './lib/db.js';

const app = createApp();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 4000;

const server = app.listen(PORT, async () => {
  try {
    const res = await pool.query('SELECT NOW()');
    console.log(`🚀 Workforce Access Server running on http://localhost:${PORT}`);
    console.log(`📦 PostgreSQL Pool Connected. Database Time: ${res.rows[0].now}`);
  } catch (error) {
    console.error('❌ Failed to connect to PostgreSQL on startup:', error);
  }
});

// Graceful shutdown
async function gracefulShutdown(signal: string) {
  console.log(`\nReceived ${signal}. Shutting down gracefully...`);
  server.close(async () => {
    console.log('HTTP server closed.');
    try {
      await closePool();
      console.log('PostgreSQL pool connection closed.');
      process.exit(0);
    } catch (err) {
      console.error('Error during pool closing:', err);
      process.exit(1);
    }
  });

  // Force close after 10s if hanging
  setTimeout(() => {
    console.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
