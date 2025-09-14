// =============================================================================
// src/models/AuditLog.js - Fixed to match vottery_vote_audit_logs table
// =============================================================================

import { query } from "../../config/database.js";

class AuditLog {
  constructor(data) {
    this.audit_id = data.audit_id;
    this.election_id = data.election_id;
    this.user_id = data.user_id;
    this.action_type = data.action_type;
    this.action_data = data.action_data;
    this.ip_address = data.ip_address;
    this.user_agent = data.user_agent;
    this.timestamp = data.timestamp;
    this.hash_chain = data.hash_chain;
    this.previous_hash = data.previous_hash;
  }

  static async create(logData) {
    const queryText = `
      INSERT INTO vottery_vote_audit_logs 
      (audit_id, election_id, user_id, action_type, action_data, hash_chain, previous_hash)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
    
    const values = [
      logData.audit_id || logData.log_id, // Support both naming conventions
      logData.election_id,
      logData.user_id || logData.actor_id, // Support both naming conventions
      logData.action_type,
      JSON.stringify(logData.action_data || logData.details), // Support both naming conventions
      logData.hash_chain,
      logData.previous_hash
    ];

    const result = await query(queryText, values);
    return new AuditLog(result.rows[0]);
  }

  static async getChain(electionId) {
    const queryText = `
      SELECT * FROM vottery_vote_audit_logs 
      WHERE election_id = $1 
      ORDER BY timestamp ASC
    `;
    
    const result = await query(queryText, [electionId]);
    return result.rows.map(row => new AuditLog(row));
  }

  static async findByElection(electionId) {
    const queryText = `
      SELECT * FROM vottery_vote_audit_logs 
      WHERE election_id = $1 
      ORDER BY timestamp DESC
    `;
    
    const result = await query(queryText, [electionId]);
    return result.rows.map(row => new AuditLog(row));
  }

  static async findByUser(userId) {
    const queryText = `
      SELECT * FROM vottery_vote_audit_logs 
      WHERE user_id = $1 
      ORDER BY timestamp DESC
    `;
    
    const result = await query(queryText, [userId]);
    return result.rows.map(row => new AuditLog(row));
  }
}

export { AuditLog };
// // =============================================================================
// // src/models/AuditLog.js - Updated with centralized database config
// // =============================================================================
// //import { query } from '../config/database.js';

// import { query } from "../../config/database.js";

// class AuditLog {
//   constructor(data) {
//     this.log_id = data.log_id;
//     this.election_id = data.election_id;
//     this.action_type = data.action_type;
//     this.actor_id = data.actor_id;
//     this.details = data.details;
//     this.hash_chain = data.hash_chain;
//     this.previous_hash = data.previous_hash;
//     this.created_at = data.created_at;
//   }

//   static async create(logData) {
//     const queryText = `
//       INSERT INTO vottery_audit_logs 
//       (log_id, election_id, action_type, actor_id, details, hash_chain, previous_hash)
//       VALUES ($1, $2, $3, $4, $5, $6, $7)
//       RETURNING *
//     `;
    
//     const values = [
//       logData.log_id,
//       logData.election_id,
//       logData.action_type,
//       logData.actor_id,
//       JSON.stringify(logData.details),
//       logData.hash_chain,
//       logData.previous_hash
//     ];

//     const result = await query(queryText, values);
//     return new AuditLog(result.rows[0]);
//   }

//   static async getChain(electionId) {
//     const queryText = `
//       SELECT * FROM vottery_audit_logs 
//       WHERE election_id = $1 
//       ORDER BY created_at ASC
//     `;
    
//     const result = await query(queryText, [electionId]);
//     return result.rows.map(row => new AuditLog(row));
//   }
// }

// export { AuditLog };
// class AuditLog {
//   constructor(data) {
//     this.log_id = data.log_id;
//     this.election_id = data.election_id;
//     this.action_type = data.action_type;
//     this.actor_id = data.actor_id;
//     this.details = data.details;
//     this.hash_chain = data.hash_chain;
//     this.previous_hash = data.previous_hash;
//     this.created_at = data.created_at;
//   }

//   static async create(logData) {
//     const query = `
//       INSERT INTO vottery_audit_logs 
//       (log_id, election_id, action_type, actor_id, details, hash_chain, previous_hash)
//       VALUES ($1, $2, $3, $4, $5, $6, $7)
//       RETURNING *
//     `;
    
//     const values = [
//       logData.log_id,
//       logData.election_id,
//       logData.action_type,
//       logData.actor_id,
//       JSON.stringify(logData.details),
//       logData.hash_chain,
//       logData.previous_hash
//     ];

//     const result = await pool.query(query, values);
//     return new AuditLog(result.rows[0]);
//   }

//   static async getChain(electionId) {
//     const query = `
//       SELECT * FROM vottery_audit_logs 
//       WHERE election_id = $1 
//       ORDER BY created_at ASC
//     `;
    
//     const result = await pool.query(query, [electionId]);
//     return result.rows.map(row => new AuditLog(row));
//   }
// }

// export { AuditLog };