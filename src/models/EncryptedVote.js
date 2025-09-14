// =============================================================================
// src/models/EncryptedVote.js - Updated with centralized database config
// =============================================================================

import { query } from "../../config/database.js";

class EncryptedVote {
  constructor(data) {
    this.vote_id = data.vote_id;
    this.election_id = data.election_id;
    this.user_id = data.user_id;
    this.encrypted_vote = data.encrypted_vote;
    this.homomorphic_data = data.homomorphic_data;
    this.zk_proof = data.zk_proof;
    this.mixnet_data = data.mixnet_data;
    this.commitment = data.commitment;
    this.nullifier = data.nullifier;
    this.vote_hash = data.vote_hash;
    this.encryption_version = data.encryption_version;
    this.created_at = data.created_at;
    this.verified_at = data.verified_at;
    this.processed_at = data.processed_at;
  }

  static async create(voteData) {
    const queryText = `
      INSERT INTO vottery_encrypted_votes 
      (id, vote_id, election_id, user_id, encrypted_vote, homomorphic_data, 
       zk_proof, mixnet_data, commitment, nullifier, vote_hash, encryption_version)
      VALUES (DEFAULT, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;
    
    const values = [
      voteData.vote_id,
      voteData.election_id,
      voteData.user_id,  // Added this back
      JSON.stringify(voteData.encrypted_vote),
      JSON.stringify(voteData.homomorphic_data),
      JSON.stringify(voteData.zk_proof),
      JSON.stringify(voteData.mixnet_data),
      voteData.commitment,
      voteData.nullifier,
      voteData.vote_hash,
      voteData.encryption_version || '1.0'
    ];

    const result = await query(queryText, values);
    return new EncryptedVote(result.rows[0]);
  }

  static async findByElection(electionId) {
    const queryText = `
      SELECT * FROM vottery_encrypted_votes 
      WHERE election_id = $1 
      ORDER BY created_at DESC
    `;
    
    const result = await query(queryText, [electionId]);
    return result.rows.map(row => new EncryptedVote(row));
  }

  static async findByVoteId(voteId) {
    const queryText = `
      SELECT * FROM vottery_encrypted_votes 
      WHERE vote_id = $1
    `;
    
    const result = await query(queryText, [voteId]);
    return result.rows.length > 0 ? new EncryptedVote(result.rows[0]) : null;
  }

  static async findByUserId(userId) {
    const queryText = `
      SELECT * FROM vottery_encrypted_votes 
      WHERE user_id = $1 
      ORDER BY created_at DESC
    `;
    
    const result = await query(queryText, [userId]);
    return result.rows.map(row => new EncryptedVote(row));
  }

  static async findByElectionAndUser(electionId, userId) {
    const queryText = `
      SELECT * FROM vottery_encrypted_votes 
      WHERE election_id = $1 AND user_id = $2
    `;
    
    const result = await query(queryText, [electionId, userId]);
    return result.rows.length > 0 ? new EncryptedVote(result.rows[0]) : null;
  }

  static async verifyVote(voteId) {
    const queryText = `
      UPDATE vottery_encrypted_votes 
      SET verified_at = CURRENT_TIMESTAMP 
      WHERE vote_id = $1 
      RETURNING *
    `;
    
    const result = await query(queryText, [voteId]);
    return result.rows.length > 0 ? new EncryptedVote(result.rows[0]) : null;
  }

  static async markProcessed(voteId) {
    const queryText = `
      UPDATE vottery_encrypted_votes 
      SET processed_at = CURRENT_TIMESTAMP 
      WHERE vote_id = $1 
      RETURNING *
    `;
    
    const result = await query(queryText, [voteId]);
    return result.rows.length > 0 ? new EncryptedVote(result.rows[0]) : null;
  }

  static async checkNullifierExists(nullifier) {
    const queryText = `
      SELECT vote_id FROM vottery_encrypted_votes 
      WHERE nullifier = $1
    `;
    
    const result = await query(queryText, [nullifier]);
    return result.rows.length > 0;
  }

  static async getElectionVoteCount(electionId) {
    const queryText = `
      SELECT COUNT(*) as vote_count 
      FROM vottery_encrypted_votes 
      WHERE election_id = $1
    `;
    
    const result = await query(queryText, [electionId]);
    return parseInt(result.rows[0].vote_count);
  }
}

export default EncryptedVote;
// // =============================================================================
// // src/models/EncryptedVote.js - Updated with centralized database config
// // =============================================================================
// //import { query, transaction } from '../config/database.js';

// import { query } from "../../config/database.js";

// class EncryptedVote {
//   constructor(data) {
//     this.vote_id = data.vote_id;
//     this.election_id = data.election_id;
//     this.encrypted_vote = data.encrypted_vote;
//     this.homomorphic_data = data.homomorphic_data;
//     this.zk_proof = data.zk_proof;
//     this.mixnet_data = data.mixnet_data;
//     this.commitment = data.commitment;
//     this.nullifier = data.nullifier;
//     this.created_at = data.created_at;
//     this.verified_at = data.verified_at;
//   }

//   static async create(voteData) {
//     const queryText = `
//       INSERT INTO vottery_encrypted_votes 
//       (vote_id, election_id, encrypted_vote, homomorphic_data, 
//        zk_proof, mixnet_data, commitment, nullifier)
//       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
//       RETURNING *
//     `;
    
//     const values = [
//       voteData.vote_id,
//       voteData.election_id,
//       JSON.stringify(voteData.encrypted_vote),
//       JSON.stringify(voteData.homomorphic_data),
//       JSON.stringify(voteData.zk_proof),
//       JSON.stringify(voteData.mixnet_data),
//       voteData.commitment,
//       voteData.nullifier
//     ];

//     const result = await query(queryText, values);
//     return new EncryptedVote(result.rows[0]);
//   }

//   static async findByElection(electionId) {
//     const queryText = `
//       SELECT * FROM vottery_encrypted_votes 
//       WHERE election_id = $1 
//       ORDER BY created_at DESC
//     `;
    
//     const result = await query(queryText, [electionId]);
//     return result.rows.map(row => new EncryptedVote(row));
//   }

//   static async findByVoteId(voteId) {
//     const queryText = `
//       SELECT * FROM vottery_encrypted_votes 
//       WHERE vote_id = $1
//     `;
    
//     const result = await query(queryText, [voteId]);
//     return result.rows.length > 0 ? new EncryptedVote(result.rows[0]) : null;
//   }

//   static async verifyVote(voteId) {
//     const queryText = `
//       UPDATE vottery_encrypted_votes 
//       SET verified_at = CURRENT_TIMESTAMP 
//       WHERE vote_id = $1 
//       RETURNING *
//     `;
    
//     const result = await query(queryText, [voteId]);
//     return result.rows.length > 0 ? new EncryptedVote(result.rows[0]) : null;
//   }
// }

// export default EncryptedVote;



