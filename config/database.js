

// =============================================================================
// src/config/database.js - Absolute Minimal Database Configuration
// =============================================================================

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// Build connection string (remove sslmode=disable)
const connectionString = `postgresql://${process.env.DB_USER || 'postgres'}:${process.env.DB_PASSWORD}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME || 'vottery_db'}`;

// Database configuration using connection string
const dbConfig = {
  connectionString,
  
  // Connection pool settings
  max: 20, // Maximum number of clients in the pool
  min: 5,  // Minimum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 10000, // Return an error after 10 seconds if connection could not be established
  maxUses: 7500, // Close and replace a connection after it has been used 7500 times
  
  // Enable SSL (required by many cloud Postgres)
  ssl: {
    rejectUnauthorized: false, // Accept self-signed certificates
  },

  // Additional options
  application_name: 'vottery-crypto-service',
  statement_timeout: 30000, // 30 seconds
  query_timeout: 30000,
  allowExitOnIdle: true
};

// Create connection pool
const pool = new Pool(dbConfig);

// Track if pool is already closed
let poolClosed = false;

// Handle pool errors
pool.on('error', (err, client) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

// Test database connection
const testConnection = async () => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    console.log('Database connected successfully at:', result.rows[0].now);
    client.release();
    return true;
  } catch (err) {
    console.error('Database connection failed:', err.message);
    return false;
  }
};

// Initialize database connection
const initializeDatabase = async () => {
  const isConnected = await testConnection();
  if (!isConnected) {
    console.error('Failed to connect to database. Please check your configuration.');
    process.exit(1);
  }
};

// Query wrapper with error handling
const query = async (text, params) => {
  try {
    const result = await pool.query(text, params);
    return result;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
};

// Graceful shutdown - prevents multiple close attempts
// const closePool = async () => {
//   if (poolClosed) return;
//   try {
//     poolClosed = true;
//     await pool.end();
//     console.log('Database pool closed');
//   } catch (error) {
//     console.error('Error closing database pool:', error);
//   }
// };

// Handle process termination
// process.on('SIGINT', closePool);
// process.on('SIGTERM', closePool);

export {
  pool,
  query,
  initializeDatabase,
  testConnection
};

export default pool;
// // =============================================================================
// // src/config/database.js - Database Configuration (SSL-enabled)
// // =============================================================================

// import pg from 'pg';
// import dotenv from 'dotenv';
// import { EventEmitter } from 'events';

// // Fix MaxListeners warning
// EventEmitter.defaultMaxListeners = 15;

// dotenv.config();

// const { Pool } = pg;

// // Build connection string (remove sslmode=disable)
// const connectionString = `postgresql://${process.env.DB_USER || 'postgres'}:${process.env.DB_PASSWORD}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME || 'vottery_db'}`;

// // Database configuration using connection string
// const dbConfig = {
//   connectionString,
  
//   // Connection pool settings
//   max: 20, // Maximum number of clients in the pool
//   min: 5,  // Minimum number of clients in the pool
//   idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
//   connectionTimeoutMillis: 10000, // Return an error after 10 seconds if connection could not be established
//   maxUses: 7500, // Close and replace a connection after it has been used 7500 times
  
//   // Enable SSL (required by many cloud Postgres)
//   ssl: {
//     rejectUnauthorized: false, // Accept self-signed certificates
//   },

//   // Additional options
//   application_name: 'vottery-crypto-service',
//   statement_timeout: 30000, // 30 seconds
//   query_timeout: 30000,
//   allowExitOnIdle: true
// };

// // Create connection pool
// const pool = new Pool(dbConfig);

// // Handle pool errors
// pool.on('error', (err, client) => {
//   console.error('Unexpected error on idle client', err);
//   process.exit(-1);
// });

// // Test database connection
// const testConnection = async () => {
//   try {
//     const client = await pool.connect();
//     const result = await client.query('SELECT NOW()');
//     console.log('Database connected successfully at:', result.rows[0].now);
//     client.release();
//     return true;
//   } catch (err) {
//     console.error('Database connection failed:', err.message);
//     return false;
//   }
// };

// // Initialize database connection
// const initializeDatabase = async () => {
//   const isConnected = await testConnection();
//   if (!isConnected) {
//     console.error('Failed to connect to database. Please check your configuration.');
//     process.exit(1);
//   }
// };

// // Query wrapper with error handling
// const query = async (text, params) => {
//   const start = Date.now();
//   try {
//     const result = await pool.query(text, params);
//     const duration = Date.now() - start;
    
//     if (process.env.NODE_ENV === 'development') {
//       console.log('Executed query:', { text, duration, rows: result.rowCount });
//     }
    
//     return result;
//   } catch (error) {
//     console.error('Database query error:', error);
//     throw error;
//   }
// };

// // Transaction wrapper
// const transaction = async (callback) => {
//   const client = await pool.connect();
//   try {
//     await client.query('BEGIN');
//     const result = await callback(client);
//     await client.query('COMMIT');
//     return result;
//   } catch (error) {
//     await client.query('ROLLBACK');
//     throw error;
//   } finally {
//     client.release();
//   }
// };

// // Check if a table exists
// const tableExists = async (tableName) => {
//   try {
//     const result = await query(
//       `SELECT EXISTS (
//         SELECT FROM information_schema.tables 
//         WHERE table_schema = 'public' 
//         AND table_name = $1
//       )`,
//       [tableName]
//     );
//     return result.rows[0].exists;
//   } catch (error) {
//     console.error(`Error checking if table ${tableName} exists:`, error);
//     return false;
//   }
// };

// // Get database statistics
// const getDatabaseStats = async () => {
//   try {
//     const result = await query(`
//       SELECT 
//         schemaname,
//         tablename,
//         attname,
//         n_distinct,
//         correlation
//       FROM pg_stats 
//       WHERE schemaname = 'public' 
//       AND tablename LIKE 'vottery_%'
//       ORDER BY tablename, attname
//     `);
//     return result.rows;
//   } catch (error) {
//     console.error('Error getting database stats:', error);
//     return [];
//   }
// };

// // Check database health
// const healthCheck = async () => {
//   try {
//     const result = await query('SELECT 1 as health_check');
//     return {
//       status: 'healthy',
//       timestamp: new Date().toISOString(),
//       connection: true,
//       query: result.rows[0].health_check === 1
//     };
//   } catch (error) {
//     return {
//       status: 'unhealthy',
//       timestamp: new Date().toISOString(),
//       connection: false,
//       error: error.message
//     };
//   }
// };

// // Graceful shutdown
// const closePool = async () => {
//   try {
//     await pool.end();
//     console.log('Database pool closed');
//   } catch (error) {
//     console.error('Error closing database pool:', error);
//   }
// };

// // Remove the existing listeners before adding new ones
// process.removeAllListeners('SIGINT');
// process.removeAllListeners('SIGTERM');

// // Handle process termination
// process.on('SIGINT', closePool);
// process.on('SIGTERM', closePool);

// export {
//   pool,
//   query,
//   transaction,
//   initializeDatabase,
//   testConnection,
//   tableExists,
//   getDatabaseStats,
//   healthCheck,
//   closePool
// };

// export default pool;
