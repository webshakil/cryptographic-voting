// =============================================================================
// src/app.js - Production-Ready with Port Detection
// =============================================================================

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { createServer } from 'http';

// Import database configuration
import { initializeDatabase, query } from '../config/database.js';

// Import routes
import cryptoRoutes from './routes/cryptoRoutes.js';
import homomorphicRoutes from './routes/homomorphicRoutes.js';
import zkProofRoutes from './routes/zkProofRoutes.js';

// Import middleware
import { errorHandler } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/logger.js';

dotenv.config();

const app = express();

// Try ports in order: ENV -> 3005 -> 3006 -> 3007 -> random
const findAvailablePort = async (startPort = 3005) => {
  const net = await import('net');
  
  return new Promise((resolve) => {
    const server = net.createServer();
    
    server.listen(startPort, () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    
    server.on('error', () => {
      // Port is busy, try next one
      resolve(findAvailablePort(startPort + 1));
    });
  });
};

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"]
    }
  }
}));

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}));

app.use(compression());

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 1000,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false
});

app.use(limiter);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging
app.use(requestLogger);

// Health check
app.get('/health', async (req, res) => {
  try {
    await query('SELECT 1');
    res.json({ 
      status: 'healthy', 
      service: 'cryptographic-voting',
      timestamp: new Date().toISOString(),
      port: process.env.PORT || 'auto-detected'
    });
  } catch (error) {
    res.status(503).json({ 
      status: 'unhealthy', 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// API routes
app.use('/api/crypto', cryptoRoutes);
app.use('/api/homomorphic', homomorphicRoutes);
app.use('/api/zkproof', zkProofRoutes);

// Error handling
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found',
    path: req.originalUrl
  });
});

// Initialize and start server
const startServer = async () => {
  try {
    // Initialize database connection
    console.log('🔌 Initializing database connection...');
    await initializeDatabase();
    
    // Get available port
    const preferredPort = process.env.PORT ? parseInt(process.env.PORT, 10) : 3005;
    const PORT = await findAvailablePort(preferredPort);
    
    if (PORT !== preferredPort) {
      console.log(`⚠️  Port ${preferredPort} was busy, using port ${PORT}`);
    }
    
    // Start server
    app.listen(PORT, () => {
      console.log(`🔐 Cryptographic Voting Service running on port ${PORT}`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`📊 Database: ${process.env.DB_NAME || 'vottery_db'}`);
    });
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Start the server
startServer();

export default app;
// // =============================================================================
// // src/app.js - Updated with Database Initialization
// // =============================================================================
// import express from 'express';
// import cors from 'cors';
// import helmet from 'helmet';
// import compression from 'compression';
// import rateLimit from 'express-rate-limit';
// import dotenv from 'dotenv';

// // Import database configuration
// //import { initializeDatabase, healthCheck } from './config/database.js';

// // Import routes
// import cryptoRoutes from './routes/cryptoRoutes.js';
// import homomorphicRoutes from './routes/homomorphicRoutes.js';
// import zkProofRoutes from './routes/zkProofRoutes.js';

// // Import middleware
// import { errorHandler } from './middleware/errorHandler.js';
// import { requestLogger } from './middleware/logger.js';
// import { healthCheck, initializeDatabase } from '../config/database.js';

// dotenv.config();

// const app = express();
// //const PORT = process.env.PORT || 3005;
// const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3005;

// // Security middleware
// app.use(helmet({
//   contentSecurityPolicy: {
//     directives: {
//       defaultSrc: ["'self'"],
//       scriptSrc: ["'self'", "'unsafe-inline'"],
//       styleSrc: ["'self'", "'unsafe-inline'"],
//       imgSrc: ["'self'", "data:", "https:"]
//     }
//   }
// }));

// app.use(cors({
//   origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
//   credentials: true
// }));

// app.use(compression());

// // Rate limiting
// const limiter = rateLimit({
//   windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
//   max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 1000,
//   message: 'Too many requests from this IP, please try again later.',
//   standardHeaders: true,
//   legacyHeaders: false
// });

// app.use(limiter);
// app.use(express.json({ limit: '10mb' }));
// app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// // Logging
// app.use(requestLogger);

// // Health check
// app.get('/health', async (req, res) => {
//   const dbHealth = await healthCheck();
  
//   res.status(dbHealth.status === 'healthy' ? 200 : 503).json({
//     status: dbHealth.status === 'healthy' ? 'healthy' : 'unhealthy',
//     service: 'cryptographic-voting',
//     timestamp: new Date().toISOString(),
//     version: '1.0.0',
//     database: dbHealth
//   });
// });

// // Database health endpoint
// app.get('/health/database', async (req, res) => {
//   const dbHealth = await healthCheck();
//   res.status(dbHealth.status === 'healthy' ? 200 : 503).json(dbHealth);
// });

// // API routes
// app.use('/api/crypto', cryptoRoutes);
// app.use('/api/homomorphic', homomorphicRoutes);
// app.use('/api/zkproof', zkProofRoutes);

// // Error handling
// app.use(errorHandler);

// // 404 handler
// app.use('*', (req, res) => {
//   res.status(404).json({
//     success: false,
//     message: 'Endpoint not found',
//     path: req.originalUrl
//   });
// });

// // Initialize and start server
// const startServer = async () => {
//   try {
//     // Initialize database connection
//     console.log('🔌 Initializing database connection...');
//     await initializeDatabase();
    
//     // Start server
//     app.listen(PORT, () => {
//       console.log(`🔐 Cryptographic Voting Service running on port ${PORT}`);
//       console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
//       console.log(`📊 Database: ${process.env.DB_NAME || 'vottery_db'}`);
//       console.log(`⚡ Rate limit: ${process.env.RATE_LIMIT_MAX_REQUESTS || 1000} requests per ${(parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000) / 60000} minutes`);
//     });
//   } catch (error) {
//     console.error('❌ Failed to start server:', error);
//     process.exit(1);
//   }
// };

// // Handle uncaught exceptions
// process.on('uncaughtException', (error) => {
//   console.error('Uncaught Exception:', error);
//   process.exit(1);
// });

// process.on('unhandledRejection', (reason, promise) => {
//   console.error('Unhandled Rejection at:', promise, 'reason:', reason);
//   process.exit(1);
// });

// // Start the server
// startServer();

// export default app;
