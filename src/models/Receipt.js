// =============================================================================
// src/models/Receipt.js - Updated with centralized database config
// =============================================================================

import { query } from "../../config/database.js";

class Receipt {
 constructor(data) {
   this.receipt_id = data.receipt_id;
   this.vote_id = data.vote_id;
   this.election_id = data.election_id;
   this.id = data.id;
   this.receipt_hash = data.receipt_hash;
   this.verification_code = data.verification_code;
   this.receipt_data = data.receipt_data;
   this.receipt_version = data.receipt_version;
   this.is_verified = data.is_verified;
   this.verified_at = data.verified_at;
   this.created_at = data.created_at;
   this.expires_at = data.expires_at;
 }

static async create(receiptData) {
  const queryText = `
    INSERT INTO vottery_receipts 
    (id, receipt_id, vote_id, election_id, user_id, receipt_hash, 
     verification_code, receipt_data, receipt_version)
    VALUES (DEFAULT, $1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
  `;
  
  const values = [
    receiptData.receipt_id,
    receiptData.vote_id,
    receiptData.election_id,
    receiptData.user_id,  // Add this back
    receiptData.receipt_hash,
    receiptData.verification_code,
    JSON.stringify(receiptData.receipt_data),
    receiptData.receipt_version || '1.0'
  ];

  const result = await query(queryText, values);
  return new Receipt(result.rows[0]);
}

 static async findByCode(verificationCode) {
   const queryText = `
     SELECT * FROM vottery_receipts 
     WHERE verification_code = $1
   `;
   
   const result = await query(queryText, [verificationCode]);
   return result.rows.length > 0 ? new Receipt(result.rows[0]) : null;
 }

 static async findByVoteId(voteId) {
   const queryText = `
     SELECT * FROM vottery_receipts 
     WHERE vote_id = $1
   `;
   
   const result = await query(queryText, [voteId]);
   return result.rows.length > 0 ? new Receipt(result.rows[0]) : null;
 }
}

export { Receipt };
// // =============================================================================
// // src/models/Receipt.js - Updated with centralized database config
// // =============================================================================
// //import { query } from '../config/database.js';

// import { query } from "../../config/database.js";

// class Receipt {
//   constructor(data) {
//     this.receipt_id = data.receipt_id;
//     this.vote_id = data.vote_id;
//     this.election_id = data.election_id;
//     this.user_id = data.user_id;
//     this.receipt_hash = data.receipt_hash;
//     this.verification_code = data.verification_code;
//     this.receipt_data = data.receipt_data;
//     this.created_at = data.created_at;
//   }

//   static async create(receiptData) {
//     const queryText = `
//       INSERT INTO vottery_receipts 
//       (receipt_id, vote_id, election_id, user_id, receipt_hash, 
//        verification_code, receipt_data)
//       VALUES ($1, $2, $3, $4, $5, $6, $7)
//       RETURNING *
//     `;
    
//     const values = [
//       receiptData.receipt_id,
//       receiptData.vote_id,
//       receiptData.election_id,
//       receiptData.user_id,
//       receiptData.receipt_hash,
//       receiptData.verification_code,
//       JSON.stringify(receiptData.receipt_data)
//     ];

//     const result = await query(queryText, values);
//     return new Receipt(result.rows[0]);
//   }

//   static async findByCode(verificationCode) {
//     const queryText = `
//       SELECT * FROM vottery_receipts 
//       WHERE verification_code = $1
//     `;
    
//     const result = await query(queryText, [verificationCode]);
//     return result.rows.length > 0 ? new Receipt(result.rows[0]) : null;
//   }

//   static async findByVoteId(voteId) {
//     const queryText = `
//       SELECT * FROM vottery_receipts 
//       WHERE vote_id = $1
//     `;
    
//     const result = await query(queryText, [voteId]);
//     return result.rows.length > 0 ? new Receipt(result.rows[0]) : null;
//   }
// }

// export { Receipt };
// // class Receipt {
// //   constructor(data) {
// //     this.receipt_id = data.receipt_id;
// //     this.vote_id = data.vote_id;
// //     this.election_id = data.election_id;
// //     this.user_id = data.user_id;
// //     this.receipt_hash = data.receipt_hash;
// //     this.verification_code = data.verification_code;
// //     this.receipt_data = data.receipt_data;
// //     this.created_at = data.created_at;
// //   }

// //   static async create(receiptData) {
// //     const query = `
// //       INSERT INTO vottery_receipts 
// //       (receipt_id, vote_id, election_id, user_id, receipt_hash, 
// //        verification_code, receipt_data)
// //       VALUES ($1, $2, $3, $4, $5, $6, $7)
// //       RETURNING *
// //     `;
    
// //     const values = [
// //       receiptData.receipt_id,
// //       receiptData.vote_id,
// //       receiptData.election_id,
// //       receiptData.user_id,
// //       receiptData.receipt_hash,
// //       receiptData.verification_code,
// //       JSON.stringify(receiptData.receipt_data)
// //     ];

// //     const result = await pool.query(query, values);
// //     return new Receipt(result.rows[0]);
// //   }

// //   static async findByCode(verificationCode) {
// //     const query = `
// //       SELECT * FROM vottery_receipts 
// //       WHERE verification_code = $1
// //     `;
    
// //     const result = await pool.query(query, [verificationCode]);
// //     return result.rows.length > 0 ? new Receipt(result.rows[0]) : null;
// //   }

// //   static async findByVoteId(voteId) {
// //     const query = `
// //       SELECT * FROM vottery_receipts 
// //       WHERE vote_id = $1
// //     `;
    
// //     const result = await pool.query(query, [voteId]);
// //     return result.rows.length > 0 ? new Receipt(result.rows[0]) : null;
// //   }
// // }

// // export { Receipt };