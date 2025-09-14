import HomomorphicEncryption from '../services/homomorphicEncryption.js';
import ZeroKnowledgeProof from '../services/zeroKnowledgeProof.js';
import Mixnets from '../services/mixnets.js';
import ReceiptGeneration from '../services/receiptGeneration.js';
import EncryptedVote from '../models/EncryptedVote.js';
import { Receipt } from '../models/Receipt.js';
import { AuditLog } from '../models/AuditLog.js';
import { v4 as uuidv4 } from 'uuid';
import pool from '../../config/database.js';

class CryptoController {
  constructor() {
    this.homomorphic = new HomomorphicEncryption();
    this.zkProof = new ZeroKnowledgeProof();
    this.mixnets = new Mixnets();
    this.receiptGen = new ReceiptGeneration();
  }

  // Helper function to convert BigInt to string
  serializeBigInt(obj) {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'bigint') return obj.toString();
    if (Array.isArray(obj)) {
      return obj.map(item => this.serializeBigInt(item));
    }
    if (typeof obj === 'object') {
      const result = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.serializeBigInt(value);
      }
      return result;
    }
    return obj;
  }


  async loadElectionKeys(electionId, includePrivateKey = false, userRole = null) {
  try {
    const keyQuery = `
      SELECT public_key, private_key_shares, key_size, key_status, threshold_n, threshold_k
      FROM vottery_homomorphic_keys 
      WHERE election_id = $1 AND key_status = 'active'
    `;
    
    const result = await pool.query(keyQuery, [electionId]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const keyData = result.rows[0];
    
    // Set the public key in the homomorphic service
    this.homomorphic.setPublicKey(keyData.public_key);
    
    // Load private key/shares for authorized operations (tally calculation)
    if (includePrivateKey) {
      console.log('Loading private keys for tally calculation...');
      console.log('Key data available:', {
        hasPrivateKeyShares: !!keyData.private_key_shares,
        userRole: userRole
      });
      
      // Check if user has permission for private key operations
      if (this.hasPrivateKeyPermission(userRole)) {
        if (keyData.private_key_shares) {
          console.log('Setting private key shares...');
          this.homomorphic.setPrivateKeyShares(keyData.private_key_shares);
        } else {
          console.error('No private key shares found in database');
          throw new Error('Private key shares not found in database');
        }
      } else {
        throw new Error(`User role '${userRole}' does not have permission to access private keys`);
      }
    }
    
    return keyData;
  } catch (error) {
    console.error('Error loading election keys:', error);
    throw error;
  }
}

  // Check if user role has permission to access private keys
  hasPrivateKeyPermission(userRole) {
    const authorizedRoles = ['Admin', 'Manager', 'Auditor'];
    return authorizedRoles.includes(userRole);
  }

  // Process encrypted vote with full cryptographic pipeline
  async processVote(req, res) {
    try {
      const { electionId, userId, vote, candidates, userRole } = req.body;

      // Load keys for this election (only public key needed for voting)
      const keyData = await this.loadElectionKeys(electionId, false);
      
      if (!keyData) {
        return res.status(400).json({
          success: false,
          message: 'Election keys not found. Please generate keys first using /api/crypto/keys endpoint.'
        });
      }

      // Generate cryptographic components
      const voteId = uuidv4();
      
      // 1. Homomorphic encryption
      const encryptedVote = this.homomorphic.encrypt(vote);
      
      // 2. Zero-knowledge proof
      const commitment = this.zkProof.generateCommitment(vote, encryptedVote.randomness);
      const proof = this.zkProof.generateProof(vote, candidates, commitment);
      
      // 3. Nullifier for double-vote prevention
      const nullifier = this.zkProof.generateNullifier(userId, electionId, encryptedVote.randomness);
      
      // 4. Prepare for mixnet processing
      const mixnetData = {
        encryptedVote: encryptedVote.ciphertext,
        timestamp: Date.now(),
        round: 0
      };

      // Store encrypted vote
      const voteData = {
        vote_id: voteId,
        election_id: electionId,
        user_id: userId,
        encrypted_vote: encryptedVote,
        homomorphic_data: {
          ciphertext: encryptedVote.ciphertext,
          publicKey: this.serializeBigInt(this.homomorphic.publicKey)
        },
        zk_proof: proof,
        mixnet_data: mixnetData,
        commitment: commitment.commitment,
        nullifier: nullifier.nullifier,
        vote_hash: await this.calculateVoteHash(voteId, encryptedVote),
        encryption_version: '1.0'
      };

      const savedVote = await EncryptedVote.create(voteData);

      // 5. Generate digital receipt
      const receipt = this.receiptGen.generateReceipt(
        { voteId, electionId, userId, electionHash: 'election_hash_placeholder' },
        { commitment: commitment.commitment },
        proof
      );

      await Receipt.create({
        receipt_id: receipt.receiptId,
        vote_id: voteId,
        election_id: electionId,
        user_id: userId,
        receipt_hash: receipt.receiptHash,
        verification_code: receipt.verificationCode,
        receipt_data: receipt.receiptData
      });

      // 6. Log audit trail
      await AuditLog.create({
        log_id: uuidv4(),
        election_id: electionId,
        action_type: 'VOTE_CAST',
        actor_id: userId,
        details: {
          voteId,
          timestamp: new Date().toISOString(),
          cryptoComponents: ['homomorphic', 'zkproof', 'nullifier']
        },
        hash_chain: await this.calculateHashChain(voteId, electionId),
        previous_hash: 'previous_hash_placeholder'
      });

      res.status(201).json({
        success: true,
        message: 'Vote processed successfully',
        data: {
          voteId,
          receipt: {
            receiptId: receipt.receiptId,
            verificationCode: receipt.verificationCode,
            receiptHash: receipt.receiptHash
          },
          cryptoProofs: {
            commitment: commitment.commitment,
            nullifier: nullifier.nullifier,
            zkProofValid: true
          }
        }
      });

    } catch (error) {
      console.error('Vote processing error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to process vote',
        error: error.message
      });
    }
  }

  // Generate election keys and store in database
  async generateElectionKeys(req, res) {
  try {
    const { electionId, userRole, userId } = req.body;

    // Check if keys already exist for this election
    const existingKeysQuery = `
      SELECT key_id FROM vottery_homomorphic_keys 
      WHERE election_id = $1 AND key_status = 'active'
    `;
    
    const existingResult = await pool.query(existingKeysQuery, [electionId]);
    
    if (existingResult.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Keys already exist for this election'
      });
    }

    // Generate homomorphic encryption keys
    const keys = await this.homomorphic.generateKeys();

    console.log('Generated keys structure:', {
      hasPublicKey: !!keys.publicKey,
      hasPrivateKey: !!keys.privateKey,
      hasPrivateKeyShares: !!keys.privateKeyShares,
      thresholdN: keys.thresholdN,
      thresholdK: keys.thresholdK
    });

    // Store keys in database - CRITICAL: Store the actual private key as shares
    const privateKeyForStorage = keys.privateKeyShares || keys.privateKey;
    
    const insertKeyQuery = `
      INSERT INTO vottery_homomorphic_keys (
        election_id, 
        public_key, 
        private_key_shares,
        key_size, 
        threshold_n,
        threshold_k,
        generated_by,
        key_status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING key_id
    `;
    
    const keyResult = await pool.query(insertKeyQuery, [
      electionId,
      JSON.stringify(this.serializeBigInt(keys.publicKey)),
      JSON.stringify(this.serializeBigInt(privateKeyForStorage)), // Store private key as shares
      this.homomorphic.keySize || 2048,
      keys.thresholdN || 3,
      keys.thresholdK || 2,
      userId,
      'active'
    ]);

    console.log('Keys stored in database successfully');

    // Log audit trail
    await AuditLog.create({
      log_id: uuidv4(),
      election_id: electionId,
      action_type: 'KEYS_GENERATED',
      actor_id: userId || 'system',
      details: {
        keyType: 'homomorphic',
        keySize: this.homomorphic.keySize || 2048,
        keyId: keyResult.rows[0].key_id,
        thresholdN: keys.thresholdN || 3,
        thresholdK: keys.thresholdK || 2,
        timestamp: new Date().toISOString()
      },
      hash_chain: await this.calculateHashChain('keys', electionId),
      previous_hash: 'previous_hash_placeholder'
    });

    res.status(201).json({
      success: true,
      message: 'Election keys generated successfully',
      data: {
        electionId,
        keyId: keyResult.rows[0].key_id,
        publicKey: this.serializeBigInt(keys.publicKey),
        keyGenerated: true,
        thresholdConfig: {
          n: keys.thresholdN || 3,
          k: keys.thresholdK || 2
        },
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Key generation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate keys',
      error: error.message
    });
  }
}
  // async generateElectionKeys(req, res) {
  //   try {
  //     const { electionId, userRole, userId } = req.body;

  //     // Check if keys already exist for this election
  //     const existingKeysQuery = `
  //       SELECT key_id FROM vottery_homomorphic_keys 
  //       WHERE election_id = $1 AND key_status = 'active'
  //     `;
      
  //     const existingResult = await pool.query(existingKeysQuery, [electionId]);
      
  //     if (existingResult.rows.length > 0) {
  //       return res.status(409).json({
  //         success: false,
  //         message: 'Keys already exist for this election'
  //       });
  //     }

  //     // Generate homomorphic encryption keys
  //     const keys = await this.homomorphic.generateKeys();

  //     // Store keys in database (including private key shares for threshold decryption)
  //     const insertKeyQuery = `
  //       INSERT INTO vottery_homomorphic_keys (
  //         election_id, 
  //         public_key, 
  //         private_key_shares,
  //         key_size, 
  //         threshold_n,
  //         threshold_k,
  //         generated_by,
  //         key_status
  //       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  //       RETURNING key_id
  //     `;
      
  //     const keyResult = await pool.query(insertKeyQuery, [
  //       electionId,
  //       JSON.stringify(this.serializeBigInt(keys.publicKey)),
  //       JSON.stringify(this.serializeBigInt(keys.privateKeyShares)), // Store private key shares
  //       this.homomorphic.keySize || 2048,
  //       keys.thresholdN || 3, // Default threshold parameters
  //       keys.thresholdK || 2,
  //       userId,
  //       'active'
  //     ]);

  //     // Log audit trail
  //     await AuditLog.create({
  //       log_id: uuidv4(),
  //       election_id: electionId,
  //       action_type: 'KEYS_GENERATED',
  //       actor_id: userId || 'system',
  //       details: {
  //         keyType: 'homomorphic',
  //         keySize: this.homomorphic.keySize || 2048,
  //         keyId: keyResult.rows[0].key_id,
  //         thresholdN: keys.thresholdN || 3,
  //         thresholdK: keys.thresholdK || 2,
  //         timestamp: new Date().toISOString()
  //       },
  //       hash_chain: await this.calculateHashChain('keys', electionId),
  //       previous_hash: 'previous_hash_placeholder'
  //     });

  //     res.status(201).json({
  //       success: true,
  //       message: 'Election keys generated successfully',
  //       data: {
  //         electionId,
  //         keyId: keyResult.rows[0].key_id,
  //         publicKey: this.serializeBigInt(keys.publicKey),
  //         keyGenerated: true,
  //         thresholdConfig: {
  //           n: keys.thresholdN || 3,
  //           k: keys.thresholdK || 2
  //         },
  //         timestamp: new Date().toISOString()
  //       }
  //     });

  //   } catch (error) {
  //     console.error('Key generation error:', error);
  //     res.status(500).json({
  //       success: false,
  //       message: 'Failed to generate keys',
  //       error: error.message
  //     });
  //   }
  // }

  // Homomorphic tally calculation
  async calculateTally(req, res) {
    try {
      const { electionId, userRole, userId } = req.body;

      // Verify user has permission to calculate tally
      if (!this.hasPrivateKeyPermission(userRole)) {
        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions to calculate tally. Admin role required.'
        });
      }

      // Load keys for this election (including private key for decryption)
      const keyData = await this.loadElectionKeys(electionId, true, userRole);
      
      if (!keyData) {
        return res.status(400).json({
          success: false,
          message: 'Election keys not found'
        });
      }

      // Get all encrypted votes for election
      const encryptedVotes = await EncryptedVote.findByElection(electionId);
      
      if (encryptedVotes.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'No votes found for election'
        });
      }

      // Extract homomorphic data
      const homomorphicVotes = encryptedVotes.map(vote => ({
        ciphertext: vote.homomorphic_data.ciphertext,
        voteId: vote.vote_id
      }));

      // Perform homomorphic addition
      const homomorphicSum = this.homomorphic.addEncrypted(
        homomorphicVotes,
        this.homomorphic.publicKey
      );

      // Decrypt the result using threshold decryption or direct decryption
      let totalVotes;
      try {
        if (keyData.threshold_k && keyData.threshold_n) {
          // Use threshold decryption
          totalVotes = this.homomorphic.thresholdDecrypt(
            homomorphicSum, 
            keyData.threshold_k
          );
        } else {
          // Use direct decryption (for testing/development)
          totalVotes = this.homomorphic.decrypt(homomorphicSum);
        }
      } catch (decryptError) {
        console.error('Decryption failed:', decryptError);
        return res.status(500).json({
          success: false,
          message: 'Failed to decrypt tally. Private key configuration issue.',
          error: decryptError.message
        });
      }

      // Log audit trail
      await AuditLog.create({
        log_id: uuidv4(),
        election_id: electionId,
        action_type: 'TALLY_CALCULATED',
        actor_id: userId || 'system',
        details: {
          totalVotes,
          encryptedVotesCount: encryptedVotes.length,
          homomorphicSum: homomorphicSum.toString(),
          decryptionMethod: keyData.threshold_k ? 'threshold' : 'direct',
          timestamp: new Date().toISOString()
        },
        hash_chain: await this.calculateHashChain('tally', electionId),
        previous_hash: 'previous_hash_placeholder'
      });

      res.status(200).json({
        success: true,
        message: 'Tally calculated successfully',
        data: {
          electionId,
          totalVotes,
          encryptedVotesCount: encryptedVotes.length,
          homomorphicSum: homomorphicSum.toString(),
          decryptionMethod: keyData.threshold_k ? 'threshold' : 'direct',
          verificationData: {
            publicKey: this.serializeBigInt(this.homomorphic.publicKey),
            timestamp: new Date().toISOString()
          }
        }
      });

    } catch (error) {
      console.error('Tally calculation error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to calculate tally',
        error: error.message
      });
    }
  }

  // Verify vote integrity
  async verifyVote(req, res) {
    try {
      const { voteId, verificationCode } = req.body;

      let vote;
      if (voteId) {
        vote = await EncryptedVote.findByVoteId(voteId);
      } else if (verificationCode) {
        const receipt = await Receipt.findByCode(verificationCode);
        if (receipt) {
          vote = await EncryptedVote.findByVoteId(receipt.vote_id);
        }
      }

      if (!vote) {
        return res.status(404).json({
          success: false,
          message: 'Vote not found'
        });
      }

      // Load keys for verification
      await this.loadElectionKeys(vote.election_id);

      // Verify zero-knowledge proof
      const zkVerification = this.zkProof.verifyProof(
        vote.zk_proof,
        vote.commitment,
        ['candidate1', 'candidate2'] // Should come from election data
      );

      // Verify receipt if verification code provided
      let receiptVerification = null;
      if (verificationCode) {
        const receipt = await Receipt.findByCode(verificationCode);
        if (receipt) {
          receiptVerification = this.receiptGen.verifyReceipt(receipt.receipt_data);
        }
      }

      res.status(200).json({
        success: true,
        message: 'Vote verification completed',
        data: {
          voteId: vote.vote_id,
          electionId: vote.election_id,
          verification: {
            zkProof: zkVerification,
            receipt: receiptVerification,
            timestamp: vote.created_at,
            verified: zkVerification.isValid && (receiptVerification?.isValid ?? true)
          }
        }
      });

    } catch (error) {
      console.error('Vote verification error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to verify vote',
        error: error.message
      });
    }
  }

  // Process votes through mixnet
  async processMixnet(req, res) {
    try {
      const { electionId, userRole } = req.body;

      // Get all encrypted votes
      const encryptedVotes = await EncryptedVote.findByElection(electionId);
      
      // Process through mixnet
      const mixnetResult = await this.mixnets.shuffleVotes(
        encryptedVotes.map(vote => vote.mixnet_data)
      );

      // Log audit trail
      await AuditLog.create({
        log_id: uuidv4(),
        election_id: electionId,
        action_type: 'MIXNET_PROCESSED',
        actor_id: req.body.userId || 'system',
        details: {
          inputVotes: encryptedVotes.length,
          mixNodes: mixnetResult.mixNodes,
          rounds: mixnetResult.rounds,
          timestamp: new Date().toISOString()
        },
        hash_chain: await this.calculateHashChain('mixnet', electionId),
        previous_hash: 'previous_hash_placeholder'
      });

      res.status(200).json({
        success: true,
        message: 'Mixnet processing completed',
        data: {
          electionId,
          mixnetResult: {
            shuffledVotes: mixnetResult.shuffledVotes.length,
            proofs: mixnetResult.proofs,
            statistics: this.mixnets.getStatistics()
          }
        }
      });

    } catch (error) {
      console.error('Mixnet processing error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to process mixnet',
        error: error.message
      });
    }
  }

  // Helper methods
  async calculateHashChain(data, electionId) {
    const { createHash } = await import('node:crypto');
    return createHash('sha256')
      .update(`${data}:${electionId}:${Date.now()}`)
      .digest('hex');
  }

  async calculateVoteHash(voteId, encryptedVote) {
    const { createHash } = await import('node:crypto');
    return createHash('sha256')
      .update(`${voteId}:${JSON.stringify(encryptedVote)}`)
      .digest('hex');
  }
}

export default CryptoController;
// import HomomorphicEncryption from '../services/homomorphicEncryption.js';
// import ZeroKnowledgeProof from '../services/zeroKnowledgeProof.js';
// import Mixnets from '../services/mixnets.js';
// import ReceiptGeneration from '../services/receiptGeneration.js';
// import EncryptedVote from '../models/EncryptedVote.js';
// import { Receipt } from '../models/Receipt.js';
// import { AuditLog } from '../models/AuditLog.js';
// //import { pool } from '../config/database.js'; // Add this import
// import { v4 as uuidv4 } from 'uuid';
// import pool from '../../config/database.js';

// class CryptoController {
//   constructor() {
//     this.homomorphic = new HomomorphicEncryption();
//     this.zkProof = new ZeroKnowledgeProof();
//     this.mixnets = new Mixnets();
//     this.receiptGen = new ReceiptGeneration();
//   }

//   // Helper function to convert BigInt to string
//   serializeBigInt(obj) {
//     if (obj === null || obj === undefined) return obj;
//     if (typeof obj === 'bigint') return obj.toString();
//     if (Array.isArray(obj)) {
//       return obj.map(item => this.serializeBigInt(item));
//     }
//     if (typeof obj === 'object') {
//       const result = {};
//       for (const [key, value] of Object.entries(obj)) {
//         result[key] = this.serializeBigInt(value);
//       }
//       return result;
//     }
//     return obj;
//   }

//   // Helper function to load keys from database
//   async loadElectionKeys(electionId) {
//     try {
//       const keyQuery = `
//         SELECT public_key, key_size, key_status
//         FROM vottery_homomorphic_keys 
//         WHERE election_id = $1 AND key_status = 'active'
//       `;
      
//       const result = await pool.query(keyQuery, [electionId]);
      
//       if (result.rows.length === 0) {
//         return null;
//       }
      
//       const keyData = result.rows[0];
      
//       // Set the public key in the homomorphic service
//       this.homomorphic.setPublicKey(keyData.public_key);
      
//       return keyData;
//     } catch (error) {
//       console.error('Error loading election keys:', error);
//       throw error;
//     }
//   }

//   // Process encrypted vote with full cryptographic pipeline
//   async processVote(req, res) {
//     try {
//       const { electionId, userId, vote, candidates, userRole } = req.body;


//       // Load keys for this election
//       const keyData = await this.loadElectionKeys(electionId);
      
//       if (!keyData) {
//         return res.status(400).json({
//           success: false,
//           message: 'Election keys not found. Please generate keys first using /api/crypto/keys endpoint.'
//         });
//       }

//       // Generate cryptographic components
//       const voteId = uuidv4();
      
//       // 1. Homomorphic encryption
//       const encryptedVote = this.homomorphic.encrypt(vote);
      
//       // 2. Zero-knowledge proof
//       const commitment = this.zkProof.generateCommitment(vote, encryptedVote.randomness);
//       const proof = this.zkProof.generateProof(vote, candidates, commitment);
      
//       // 3. Nullifier for double-vote prevention
//       const nullifier = this.zkProof.generateNullifier(userId, electionId, encryptedVote.randomness);
      
//       // 4. Prepare for mixnet processing
//       const mixnetData = {
//         encryptedVote: encryptedVote.ciphertext,
//         timestamp: Date.now(),
//         round: 0
//       };

//       // Store encrypted vote - only fields that exist in actual database table
//   // In your processVote method:
// const voteData = {
//   vote_id: voteId,
//   election_id: electionId,
//   user_id: userId,  // Now this column exists
//   encrypted_vote: encryptedVote,
//   homomorphic_data: {
//     ciphertext: encryptedVote.ciphertext,
//     publicKey: this.serializeBigInt(this.homomorphic.publicKey)
//   },
//   zk_proof: proof,
//   mixnet_data: mixnetData,
//   commitment: commitment.commitment,
//   nullifier: nullifier.nullifier,
//   vote_hash: await this.calculateVoteHash(voteId, encryptedVote),
//   encryption_version: '1.0'
// };

//       const savedVote = await EncryptedVote.create(voteData);

//       // 5. Generate digital receipt
//       const receipt = this.receiptGen.generateReceipt(
//         { voteId, electionId, userId, electionHash: 'election_hash_placeholder' },
//         { commitment: commitment.commitment },
//         proof
//       );


// await Receipt.create({
//   receipt_id: receipt.receiptId,
//   vote_id: voteId,
//   election_id: electionId,
//   user_id: userId,  // Make sure this is here
//   receipt_hash: receipt.receiptHash,
//   verification_code: receipt.verificationCode,
//   receipt_data: receipt.receiptData
// });

//       // 6. Log audit trail
//       await AuditLog.create({
//         log_id: uuidv4(),
//         election_id: electionId,
//         action_type: 'VOTE_CAST',
//         actor_id: userId,
//         details: {
//           voteId,
//           timestamp: new Date().toISOString(),
//           cryptoComponents: ['homomorphic', 'zkproof', 'nullifier']
//         },
//         hash_chain: await this.calculateHashChain(voteId, electionId),
//         previous_hash: 'previous_hash_placeholder'
//       });

//       res.status(201).json({
//         success: true,
//         message: 'Vote processed successfully',
//         data: {
//           voteId,
//           receipt: {
//             receiptId: receipt.receiptId,
//             verificationCode: receipt.verificationCode,
//             receiptHash: receipt.receiptHash
//           },
//           cryptoProofs: {
//             commitment: commitment.commitment,
//             nullifier: nullifier.nullifier,
//             zkProofValid: true
//           }
//         }
//       });

//     } catch (error) {
//       console.error('Vote processing error:', error);
//       res.status(500).json({
//         success: false,
//         message: 'Failed to process vote',
//         error: error.message
//       });
//     }
//   }

//   // Generate election keys and store in database
//   async generateElectionKeys(req, res) {
//     try {
//       const { electionId, userRole, userId } = req.body;

//       // Check if keys already exist for this election
//       const existingKeysQuery = `
//         SELECT key_id FROM vottery_homomorphic_keys 
//         WHERE election_id = $1 AND key_status = 'active'
//       `;
      
//       const existingResult = await pool.query(existingKeysQuery, [electionId]);
      
//       if (existingResult.rows.length > 0) {
//         return res.status(409).json({
//           success: false,
//           message: 'Keys already exist for this election'
//         });
//       }

//       // Generate homomorphic encryption keys
//       const keys = await this.homomorphic.generateKeys();

//       // Store keys in database
//       const insertKeyQuery = `
//         INSERT INTO vottery_homomorphic_keys (
//           election_id, 
//           public_key, 
//           key_size, 
//           generated_by,
//           key_status
//         ) VALUES ($1, $2, $3, $4, $5)
//         RETURNING key_id
//       `;
      
//       const keyResult = await pool.query(insertKeyQuery, [
//         electionId,
//         JSON.stringify(this.serializeBigInt(keys.publicKey)),
//         this.homomorphic.keySize || 2048,
//         userId,
//         'active'
//       ]);

//       // Log audit trail
//       await AuditLog.create({
//         log_id: uuidv4(),
//         election_id: electionId,
//         action_type: 'KEYS_GENERATED',
//         actor_id: userId || 'system',
//         details: {
//           keyType: 'homomorphic',
//           keySize: this.homomorphic.keySize || 2048,
//           keyId: keyResult.rows[0].key_id,
//           timestamp: new Date().toISOString()
//         },
//         hash_chain: await this.calculateHashChain('keys', electionId),
//         previous_hash: 'previous_hash_placeholder'
//       });

//       res.status(201).json({
//         success: true,
//         message: 'Election keys generated successfully',
//         data: {
//           electionId,
//           keyId: keyResult.rows[0].key_id,
//           publicKey: this.serializeBigInt(keys.publicKey),
//           keyGenerated: true,
//           timestamp: new Date().toISOString()
//         }
//       });

//     } catch (error) {
//       console.error('Key generation error:', error);
//       res.status(500).json({
//         success: false,
//         message: 'Failed to generate keys',
//         error: error.message
//       });
//     }
//   }

//   // Homomorphic tally calculation
//   async calculateTally(req, res) {
//     try {
//       const { electionId, userRole } = req.body;

//       // Load keys for this election
//       const keyData = await this.loadElectionKeys(electionId);
      
//       if (!keyData) {
//         return res.status(400).json({
//           success: false,
//           message: 'Election keys not found'
//         });
//       }

//       // Get all encrypted votes for election
//       const encryptedVotes = await EncryptedVote.findByElection(electionId);
      
//       if (encryptedVotes.length === 0) {
//         return res.status(404).json({
//           success: false,
//           message: 'No votes found for election'
//         });
//       }

//       // Extract homomorphic data
//       const homomorphicVotes = encryptedVotes.map(vote => ({
//         ciphertext: vote.homomorphic_data.ciphertext,
//         voteId: vote.vote_id
//       }));

//       // Perform homomorphic addition
//       const homomorphicSum = this.homomorphic.addEncrypted(
//         homomorphicVotes,
//         this.homomorphic.publicKey
//       );

//       // For demonstration, decrypt the result (in practice, might use threshold decryption)
//       const totalVotes = this.homomorphic.decrypt(homomorphicSum);

//       // Log audit trail
//       await AuditLog.create({
//         log_id: uuidv4(),
//         election_id: electionId,
//         action_type: 'TALLY_CALCULATED',
//         actor_id: req.body.userId || 'system',
//         details: {
//           totalVotes,
//           encryptedVotesCount: encryptedVotes.length,
//           homomorphicSum: homomorphicSum.toString(),
//           timestamp: new Date().toISOString()
//         },
//         hash_chain: await this.calculateHashChain('tally', electionId),
//         previous_hash: 'previous_hash_placeholder'
//       });

//       res.status(200).json({
//         success: true,
//         message: 'Tally calculated successfully',
//         data: {
//           electionId,
//           totalVotes,
//           encryptedVotesCount: encryptedVotes.length,
//           homomorphicSum: homomorphicSum.toString(),
//           verificationData: {
//             publicKey: this.serializeBigInt(this.homomorphic.publicKey),
//             timestamp: new Date().toISOString()
//           }
//         }
//       });

//     } catch (error) {
//       console.error('Tally calculation error:', error);
//       res.status(500).json({
//         success: false,
//         message: 'Failed to calculate tally',
//         error: error.message
//       });
//     }
//   }

//   // Verify vote integrity
//   async verifyVote(req, res) {
//     try {
//       const { voteId, verificationCode } = req.body;

//       let vote;
//       if (voteId) {
//         vote = await EncryptedVote.findByVoteId(voteId);
//       } else if (verificationCode) {
//         const receipt = await Receipt.findByCode(verificationCode);
//         if (receipt) {
//           vote = await EncryptedVote.findByVoteId(receipt.vote_id);
//         }
//       }

//       if (!vote) {
//         return res.status(404).json({
//           success: false,
//           message: 'Vote not found'
//         });
//       }

//       // Load keys for verification
//       await this.loadElectionKeys(vote.election_id);

//       // Verify zero-knowledge proof
//       const zkVerification = this.zkProof.verifyProof(
//         vote.zk_proof,
//         vote.commitment,
//         ['candidate1', 'candidate2'] // Should come from election data
//       );

//       // Verify receipt if verification code provided
//       let receiptVerification = null;
//       if (verificationCode) {
//         const receipt = await Receipt.findByCode(verificationCode);
//         if (receipt) {
//           receiptVerification = this.receiptGen.verifyReceipt(receipt.receipt_data);
//         }
//       }

//       res.status(200).json({
//         success: true,
//         message: 'Vote verification completed',
//         data: {
//           voteId: vote.vote_id,
//           electionId: vote.election_id,
//           verification: {
//             zkProof: zkVerification,
//             receipt: receiptVerification,
//             timestamp: vote.created_at,
//             verified: zkVerification.isValid && (receiptVerification?.isValid ?? true)
//           }
//         }
//       });

//     } catch (error) {
//       console.error('Vote verification error:', error);
//       res.status(500).json({
//         success: false,
//         message: 'Failed to verify vote',
//         error: error.message
//       });
//     }
//   }

//   // Process votes through mixnet
//   async processMixnet(req, res) {
//     try {
//       const { electionId, userRole } = req.body;

//       // Get all encrypted votes
//       const encryptedVotes = await EncryptedVote.findByElection(electionId);
      
//       // Process through mixnet
//       const mixnetResult = await this.mixnets.shuffleVotes(
//         encryptedVotes.map(vote => vote.mixnet_data)
//       );

//       // Log audit trail
//       await AuditLog.create({
//         log_id: uuidv4(),
//         election_id: electionId,
//         action_type: 'MIXNET_PROCESSED',
//         actor_id: req.body.userId || 'system',
//         details: {
//           inputVotes: encryptedVotes.length,
//           mixNodes: mixnetResult.mixNodes,
//           rounds: mixnetResult.rounds,
//           timestamp: new Date().toISOString()
//         },
//         hash_chain: await this.calculateHashChain('mixnet', electionId),
//         previous_hash: 'previous_hash_placeholder'
//       });

//       res.status(200).json({
//         success: true,
//         message: 'Mixnet processing completed',
//         data: {
//           electionId,
//           mixnetResult: {
//             shuffledVotes: mixnetResult.shuffledVotes.length,
//             proofs: mixnetResult.proofs,
//             statistics: this.mixnets.getStatistics()
//           }
//         }
//       });

//     } catch (error) {
//       console.error('Mixnet processing error:', error);
//       res.status(500).json({
//         success: false,
//         message: 'Failed to process mixnet',
//         error: error.message
//       });
//     }
//   }

//   // Helper methods
//   async calculateHashChain(data, electionId) {
//     const { createHash } = await import('node:crypto');
//     return createHash('sha256')
//       .update(`${data}:${electionId}:${Date.now()}`)
//       .digest('hex');
//   }

//   async calculateVoteHash(voteId, encryptedVote) {
//     const { createHash } = await import('node:crypto');
//     return createHash('sha256')
//       .update(`${voteId}:${JSON.stringify(encryptedVote)}`)
//       .digest('hex');
//   }
// }

// export default CryptoController;
// import HomomorphicEncryption from '../services/homomorphicEncryption.js';
// import ZeroKnowledgeProof from '../services/zeroKnowledgeProof.js';
// import Mixnets from '../services/mixnets.js';
// import ReceiptGeneration from '../services/receiptGeneration.js';
// import EncryptedVote from '../models/EncryptedVote.js';
// import { Receipt } from '../models/Receipt.js';
// import { AuditLog } from '../models/AuditLog.js';
// //import { pool } from '../config/database.js'; // Add this import
// import { v4 as uuidv4 } from 'uuid';
// import pool from '../../config/database.js';

// class CryptoController {
//   constructor() {
//     this.homomorphic = new HomomorphicEncryption();
//     this.zkProof = new ZeroKnowledgeProof();
//     this.mixnets = new Mixnets();
//     this.receiptGen = new ReceiptGeneration();
//   }

//   // Helper function to convert BigInt to string
//   serializeBigInt(obj) {
//     if (obj === null || obj === undefined) return obj;
//     if (typeof obj === 'bigint') return obj.toString();
//     if (Array.isArray(obj)) {
//       return obj.map(item => this.serializeBigInt(item));
//     }
//     if (typeof obj === 'object') {
//       const result = {};
//       for (const [key, value] of Object.entries(obj)) {
//         result[key] = this.serializeBigInt(value);
//       }
//       return result;
//     }
//     return obj;
//   }

//   // Helper function to load keys from database
//   async loadElectionKeys(electionId) {
//     try {
//       const keyQuery = `
//         SELECT public_key, key_size, key_status
//         FROM vottery_homomorphic_keys 
//         WHERE election_id = $1 AND key_status = 'active'
//       `;
      
//       const result = await pool.query(keyQuery, [electionId]);
      
//       if (result.rows.length === 0) {
//         return null;
//       }
      
//       const keyData = result.rows[0];
      
//       // Set the public key in the homomorphic service
//       this.homomorphic.setPublicKey(keyData.public_key);
      
//       return keyData;
//     } catch (error) {
//       console.error('Error loading election keys:', error);
//       throw error;
//     }
//   }

//   // Process encrypted vote with full cryptographic pipeline
//   async processVote(req, res) {
//     try {
//       const { electionId, userId, vote, candidates, userRole } = req.body;

//       // Load keys for this election
//       const keyData = await this.loadElectionKeys(electionId);
      
//       if (!keyData) {
//         return res.status(400).json({
//           success: false,
//           message: 'Election keys not found. Please generate keys first using /api/crypto/keys endpoint.'
//         });
//       }

//       // Generate cryptographic components
//       const voteId = uuidv4();
      
//       // 1. Homomorphic encryption
//       const encryptedVote = this.homomorphic.encrypt(vote);
      
//       // 2. Zero-knowledge proof
//       const commitment = this.zkProof.generateCommitment(vote, encryptedVote.randomness);
//       const proof = this.zkProof.generateProof(vote, candidates, commitment);
      
//       // 3. Nullifier for double-vote prevention
//       const nullifier = this.zkProof.generateNullifier(userId, electionId, encryptedVote.randomness);
      
//       // 4. Prepare for mixnet processing
//       const mixnetData = {
//         encryptedVote: encryptedVote.ciphertext,
//         timestamp: Date.now(),
//         round: 0
//       };

//       // Store encrypted vote
//       const voteData = {
//         vote_id: voteId,
//         election_id: electionId,
//         user_id: userId, // Add user_id to match database schema
//         encrypted_vote: encryptedVote,
//         homomorphic_data: {
//           ciphertext: encryptedVote.ciphertext,
//           publicKey: this.serializeBigInt(this.homomorphic.publicKey)
//         },
//         zk_proof: proof,
//         mixnet_data: mixnetData,
//         commitment: commitment.commitment,
//         nullifier: nullifier.nullifier,
//         vote_hash: await this.calculateVoteHash(voteId, encryptedVote) // Add vote hash
//       };

//       const savedVote = await EncryptedVote.create(voteData);

//       // 5. Generate digital receipt
//       const receipt = this.receiptGen.generateReceipt(
//         { voteId, electionId, userId, electionHash: 'election_hash_placeholder' },
//         { commitment: commitment.commitment },
//         proof
//       );

//       await Receipt.create({
//         receipt_id: receipt.receiptId,
//         vote_id: voteId,
//         election_id: electionId,
//         user_id: userId,
//         receipt_hash: receipt.receiptHash,
//         verification_code: receipt.verificationCode,
//         receipt_data: receipt.receiptData
//       });

//       // 6. Log audit trail
//       await AuditLog.create({
//         log_id: uuidv4(),
//         election_id: electionId,
//         action_type: 'VOTE_CAST',
//         actor_id: userId,
//         details: {
//           voteId,
//           timestamp: new Date().toISOString(),
//           cryptoComponents: ['homomorphic', 'zkproof', 'nullifier']
//         },
//         hash_chain: await this.calculateHashChain(voteId, electionId),
//         previous_hash: 'previous_hash_placeholder'
//       });

//       res.status(201).json({
//         success: true,
//         message: 'Vote processed successfully',
//         data: {
//           voteId,
//           receipt: {
//             receiptId: receipt.receiptId,
//             verificationCode: receipt.verificationCode,
//             receiptHash: receipt.receiptHash
//           },
//           cryptoProofs: {
//             commitment: commitment.commitment,
//             nullifier: nullifier.nullifier,
//             zkProofValid: true
//           }
//         }
//       });

//     } catch (error) {
//       console.error('Vote processing error:', error);
//       res.status(500).json({
//         success: false,
//         message: 'Failed to process vote',
//         error: error.message
//       });
//     }
//   }

//   // Generate election keys and store in database
//   async generateElectionKeys(req, res) {
//     try {
//       const { electionId, userRole, userId } = req.body;

//       // Check if keys already exist for this election
//       const existingKeysQuery = `
//         SELECT key_id FROM vottery_homomorphic_keys 
//         WHERE election_id = $1 AND key_status = 'active'
//       `;
      
//       const existingResult = await pool.query(existingKeysQuery, [electionId]);
      
//       if (existingResult.rows.length > 0) {
//         return res.status(409).json({
//           success: false,
//           message: 'Keys already exist for this election'
//         });
//       }

//       // Generate homomorphic encryption keys
//       const keys = await this.homomorphic.generateKeys();

//       // Store keys in database
//       const insertKeyQuery = `
//         INSERT INTO vottery_homomorphic_keys (
//           election_id, 
//           public_key, 
//           key_size, 
//           generated_by,
//           key_status
//         ) VALUES ($1, $2, $3, $4, $5)
//         RETURNING key_id
//       `;
      
//       const keyResult = await pool.query(insertKeyQuery, [
//         electionId,
//         JSON.stringify(this.serializeBigInt(keys.publicKey)),
//         this.homomorphic.keySize || 2048,
//         userId,
//         'active'
//       ]);

//       // Log audit trail
//       await AuditLog.create({
//         log_id: uuidv4(),
//         election_id: electionId,
//         action_type: 'KEYS_GENERATED',
//         actor_id: userId || 'system',
//         details: {
//           keyType: 'homomorphic',
//           keySize: this.homomorphic.keySize || 2048,
//           keyId: keyResult.rows[0].key_id,
//           timestamp: new Date().toISOString()
//         },
//         hash_chain: await this.calculateHashChain('keys', electionId),
//         previous_hash: 'previous_hash_placeholder'
//       });

//       res.status(201).json({
//         success: true,
//         message: 'Election keys generated successfully',
//         data: {
//           electionId,
//           keyId: keyResult.rows[0].key_id,
//           publicKey: this.serializeBigInt(keys.publicKey),
//           keyGenerated: true,
//           timestamp: new Date().toISOString()
//         }
//       });

//     } catch (error) {
//       console.error('Key generation error:', error);
//       res.status(500).json({
//         success: false,
//         message: 'Failed to generate keys',
//         error: error.message
//       });
//     }
//   }

//   // Homomorphic tally calculation
//   async calculateTally(req, res) {
//     try {
//       const { electionId, userRole } = req.body;

//       // Load keys for this election
//       const keyData = await this.loadElectionKeys(electionId);
      
//       if (!keyData) {
//         return res.status(400).json({
//           success: false,
//           message: 'Election keys not found'
//         });
//       }

//       // Get all encrypted votes for election
//       const encryptedVotes = await EncryptedVote.findByElection(electionId);
      
//       if (encryptedVotes.length === 0) {
//         return res.status(404).json({
//           success: false,
//           message: 'No votes found for election'
//         });
//       }

//       // Extract homomorphic data
//       const homomorphicVotes = encryptedVotes.map(vote => ({
//         ciphertext: vote.homomorphic_data.ciphertext,
//         voteId: vote.vote_id
//       }));

//       // Perform homomorphic addition
//       const homomorphicSum = this.homomorphic.addEncrypted(
//         homomorphicVotes,
//         this.homomorphic.publicKey
//       );

//       // For demonstration, decrypt the result (in practice, might use threshold decryption)
//       const totalVotes = this.homomorphic.decrypt(homomorphicSum);

//       // Log audit trail
//       await AuditLog.create({
//         log_id: uuidv4(),
//         election_id: electionId,
//         action_type: 'TALLY_CALCULATED',
//         actor_id: req.body.userId || 'system',
//         details: {
//           totalVotes,
//           encryptedVotesCount: encryptedVotes.length,
//           homomorphicSum: homomorphicSum.toString(),
//           timestamp: new Date().toISOString()
//         },
//         hash_chain: await this.calculateHashChain('tally', electionId),
//         previous_hash: 'previous_hash_placeholder'
//       });

//       res.status(200).json({
//         success: true,
//         message: 'Tally calculated successfully',
//         data: {
//           electionId,
//           totalVotes,
//           encryptedVotesCount: encryptedVotes.length,
//           homomorphicSum: homomorphicSum.toString(),
//           verificationData: {
//             publicKey: this.serializeBigInt(this.homomorphic.publicKey),
//             timestamp: new Date().toISOString()
//           }
//         }
//       });

//     } catch (error) {
//       console.error('Tally calculation error:', error);
//       res.status(500).json({
//         success: false,
//         message: 'Failed to calculate tally',
//         error: error.message
//       });
//     }
//   }

//   // Verify vote integrity
//   async verifyVote(req, res) {
//     try {
//       const { voteId, verificationCode } = req.body;

//       let vote;
//       if (voteId) {
//         vote = await EncryptedVote.findByVoteId(voteId);
//       } else if (verificationCode) {
//         const receipt = await Receipt.findByCode(verificationCode);
//         if (receipt) {
//           vote = await EncryptedVote.findByVoteId(receipt.vote_id);
//         }
//       }

//       if (!vote) {
//         return res.status(404).json({
//           success: false,
//           message: 'Vote not found'
//         });
//       }

//       // Load keys for verification
//       await this.loadElectionKeys(vote.election_id);

//       // Verify zero-knowledge proof
//       const zkVerification = this.zkProof.verifyProof(
//         vote.zk_proof,
//         vote.commitment,
//         ['candidate1', 'candidate2'] // Should come from election data
//       );

//       // Verify receipt if verification code provided
//       let receiptVerification = null;
//       if (verificationCode) {
//         const receipt = await Receipt.findByCode(verificationCode);
//         if (receipt) {
//           receiptVerification = this.receiptGen.verifyReceipt(receipt.receipt_data);
//         }
//       }

//       res.status(200).json({
//         success: true,
//         message: 'Vote verification completed',
//         data: {
//           voteId: vote.vote_id,
//           electionId: vote.election_id,
//           verification: {
//             zkProof: zkVerification,
//             receipt: receiptVerification,
//             timestamp: vote.created_at,
//             verified: zkVerification.isValid && (receiptVerification?.isValid ?? true)
//           }
//         }
//       });

//     } catch (error) {
//       console.error('Vote verification error:', error);
//       res.status(500).json({
//         success: false,
//         message: 'Failed to verify vote',
//         error: error.message
//       });
//     }
//   }

//   // Process votes through mixnet
//   async processMixnet(req, res) {
//     try {
//       const { electionId, userRole } = req.body;

//       // Get all encrypted votes
//       const encryptedVotes = await EncryptedVote.findByElection(electionId);
      
//       // Process through mixnet
//       const mixnetResult = await this.mixnets.shuffleVotes(
//         encryptedVotes.map(vote => vote.mixnet_data)
//       );

//       // Log audit trail
//       await AuditLog.create({
//         log_id: uuidv4(),
//         election_id: electionId,
//         action_type: 'MIXNET_PROCESSED',
//         actor_id: req.body.userId || 'system',
//         details: {
//           inputVotes: encryptedVotes.length,
//           mixNodes: mixnetResult.mixNodes,
//           rounds: mixnetResult.rounds,
//           timestamp: new Date().toISOString()
//         },
//         hash_chain: await this.calculateHashChain('mixnet', electionId),
//         previous_hash: 'previous_hash_placeholder'
//       });

//       res.status(200).json({
//         success: true,
//         message: 'Mixnet processing completed',
//         data: {
//           electionId,
//           mixnetResult: {
//             shuffledVotes: mixnetResult.shuffledVotes.length,
//             proofs: mixnetResult.proofs,
//             statistics: this.mixnets.getStatistics()
//           }
//         }
//       });

//     } catch (error) {
//       console.error('Mixnet processing error:', error);
//       res.status(500).json({
//         success: false,
//         message: 'Failed to process mixnet',
//         error: error.message
//       });
//     }
//   }

//   // Helper methods
//   async calculateHashChain(data, electionId) {
//     const { createHash } = await import('node:crypto');
//     return createHash('sha256')
//       .update(`${data}:${electionId}:${Date.now()}`)
//       .digest('hex');
//   }

//   async calculateVoteHash(voteId, encryptedVote) {
//     const { createHash } = await import('node:crypto');
//     return createHash('sha256')
//       .update(`${voteId}:${JSON.stringify(encryptedVote)}`)
//       .digest('hex');
//   }
// }

// export default CryptoController;
// import HomomorphicEncryption from '../services/homomorphicEncryption.js';
// import ZeroKnowledgeProof from '../services/zeroKnowledgeProof.js';
// import Mixnets from '../services/mixnets.js';
// import ReceiptGeneration from '../services/receiptGeneration.js';
// import EncryptedVote from '../models/EncryptedVote.js';
// import { Receipt } from '../models/Receipt.js';
// import { AuditLog } from '../models/AuditLog.js';
// import { v4 as uuidv4 } from 'uuid';

// class CryptoController {
//   constructor() {
//     this.homomorphic = new HomomorphicEncryption();
//     this.zkProof = new ZeroKnowledgeProof();
//     this.mixnets = new Mixnets();
//     this.receiptGen = new ReceiptGeneration();
//   }

//   // Helper function to convert BigInt to string
//   serializeBigInt(obj) {
//     if (obj === null || obj === undefined) return obj;
//     if (typeof obj === 'bigint') return obj.toString();
//     if (Array.isArray(obj)) {
//       return obj.map(item => this.serializeBigInt(item));
//     }
//     if (typeof obj === 'object') {
//       const result = {};
//       for (const [key, value] of Object.entries(obj)) {
//         result[key] = this.serializeBigInt(value);
//       }
//       return result;
//     }
//     return obj;
//   }

//   // Process encrypted vote with full cryptographic pipeline
//   async processVote(req, res) {
 
//     try {
//       const { electionId, userId, vote, candidates, userRole } = req.body;
//          console.log('=== DEBUG VOTE PROCESSING ===');
//     console.log('Request body userRole:', userRole);
//     console.log('Middleware permissions:', req.userPermissions);
//     console.log('User from middleware:', req.user);
//     console.log('============================');

//       // Validate role-based access
//       if (!this.validateUserRole(userRole, 'vote')) {
//         return res.status(403).json({
//           success: false,
//           message: 'Insufficient permissions to vote'
//         });
//       }

//       // Generate cryptographic components
//       const voteId = uuidv4();
      
//       // 1. Homomorphic encryption
//       const encryptedVote = this.homomorphic.encrypt(vote);
      
//       // 2. Zero-knowledge proof
//       const commitment = this.zkProof.generateCommitment(vote, encryptedVote.randomness);
//       const proof = this.zkProof.generateProof(vote, candidates, commitment);
      
//       // 3. Nullifier for double-vote prevention
//       const nullifier = this.zkProof.generateNullifier(userId, electionId, encryptedVote.randomness);
      
//       // 4. Prepare for mixnet processing
//       const mixnetData = {
//         encryptedVote: encryptedVote.ciphertext,
//         timestamp: Date.now(),
//         round: 0
//       };

//       // Store encrypted vote
//       const voteData = {
//         vote_id: voteId,
//         election_id: electionId,
//         encrypted_vote: encryptedVote,
//         homomorphic_data: {
//           ciphertext: encryptedVote.ciphertext,
//           publicKey: this.serializeBigInt(this.homomorphic.publicKey)
//         },
//         zk_proof: proof,
//         mixnet_data: mixnetData,
//         commitment: commitment.commitment,
//         nullifier: nullifier.nullifier
//       };

//       const savedVote = await EncryptedVote.create(voteData);

//       // 5. Generate digital receipt
//       const receipt = this.receiptGen.generateReceipt(
//         { voteId, electionId, userId, electionHash: 'election_hash_placeholder' },
//         { commitment: commitment.commitment },
//         proof
//       );

//       await Receipt.create({
//         receipt_id: receipt.receiptId,
//         vote_id: voteId,
//         election_id: electionId,
//         user_id: userId,
//         receipt_hash: receipt.receiptHash,
//         verification_code: receipt.verificationCode,
//         receipt_data: receipt.receiptData
//       });

//       // 6. Log audit trail
//       await AuditLog.create({
//         log_id: uuidv4(),
//         election_id: electionId,
//         action_type: 'VOTE_CAST',
//         actor_id: userId,
//         details: {
//           voteId,
//           timestamp: new Date().toISOString(),
//           cryptoComponents: ['homomorphic', 'zkproof', 'nullifier']
//         },
//         hash_chain: await this.calculateHashChain(voteId, electionId),
//         previous_hash: 'previous_hash_placeholder'
//       });

//       res.status(201).json({
//         success: true,
//         message: 'Vote processed successfully',
//         data: {
//           voteId,
//           receipt: {
//             receiptId: receipt.receiptId,
//             verificationCode: receipt.verificationCode,
//             receiptHash: receipt.receiptHash
//           },
//           cryptoProofs: {
//             commitment: commitment.commitment,
//             nullifier: nullifier.nullifier,
//             zkProofValid: true
//           }
//         }
//       });

//     } catch (error) {
//       console.error('Vote processing error:', error);
//       res.status(500).json({
//         success: false,
//         message: 'Failed to process vote',
//         error: error.message
//       });
//     }
//   }

//   // Homomorphic tally calculation
//   async calculateTally(req, res) {
//     try {
//       const { electionId, userRole } = req.body;

//       // Validate role-based access
//       if (!this.validateUserRole(userRole, 'tally')) {
//         return res.status(403).json({
//           success: false,
//           message: 'Insufficient permissions to calculate tally'
//         });
//       }

//       // Get all encrypted votes for election
//       const encryptedVotes = await EncryptedVote.findByElection(electionId);
      
//       if (encryptedVotes.length === 0) {
//         return res.status(404).json({
//           success: false,
//           message: 'No votes found for election'
//         });
//       }

//       // Extract homomorphic data
//       const homomorphicVotes = encryptedVotes.map(vote => ({
//         ciphertext: vote.homomorphic_data.ciphertext,
//         voteId: vote.vote_id
//       }));

//       // Perform homomorphic addition
//       const homomorphicSum = this.homomorphic.addEncrypted(
//         homomorphicVotes,
//         this.homomorphic.publicKey
//       );

//       // For demonstration, decrypt the result (in practice, might use threshold decryption)
//       const totalVotes = this.homomorphic.decrypt(homomorphicSum);

//       // Log audit trail
//       await AuditLog.create({
//         log_id: uuidv4(),
//         election_id: electionId,
//         action_type: 'TALLY_CALCULATED',
//         actor_id: req.body.userId || 'system',
//         details: {
//           totalVotes,
//           encryptedVotesCount: encryptedVotes.length,
//           homomorphicSum: homomorphicSum.toString(),
//           timestamp: new Date().toISOString()
//         },
//         hash_chain: await this.calculateHashChain('tally', electionId),
//         previous_hash: 'previous_hash_placeholder'
//       });

//       res.status(200).json({
//         success: true,
//         message: 'Tally calculated successfully',
//         data: {
//           electionId,
//           totalVotes,
//           encryptedVotesCount: encryptedVotes.length,
//           homomorphicSum: homomorphicSum.toString(),
//           verificationData: {
//             publicKey: this.serializeBigInt(this.homomorphic.publicKey),
//             timestamp: new Date().toISOString()
//           }
//         }
//       });

//     } catch (error) {
//       console.error('Tally calculation error:', error);
//       res.status(500).json({
//         success: false,
//         message: 'Failed to calculate tally',
//         error: error.message
//       });
//     }
//   }

//   // Verify vote integrity
//   async verifyVote(req, res) {
//     try {
//       const { voteId, verificationCode } = req.body;

//       let vote;
//       if (voteId) {
//         vote = await EncryptedVote.findByVoteId(voteId);
//       } else if (verificationCode) {
//         const receipt = await Receipt.findByCode(verificationCode);
//         if (receipt) {
//           vote = await EncryptedVote.findByVoteId(receipt.vote_id);
//         }
//       }

//       if (!vote) {
//         return res.status(404).json({
//           success: false,
//           message: 'Vote not found'
//         });
//       }

//       // Verify zero-knowledge proof
//       const zkVerification = this.zkProof.verifyProof(
//         vote.zk_proof,
//         vote.commitment,
//         ['candidate1', 'candidate2'] // Should come from election data
//       );

//       // Verify receipt if verification code provided
//       let receiptVerification = null;
//       if (verificationCode) {
//         const receipt = await Receipt.findByCode(verificationCode);
//         if (receipt) {
//           receiptVerification = this.receiptGen.verifyReceipt(receipt.receipt_data);
//         }
//       }

//       res.status(200).json({
//         success: true,
//         message: 'Vote verification completed',
//         data: {
//           voteId: vote.vote_id,
//           electionId: vote.election_id,
//           verification: {
//             zkProof: zkVerification,
//             receipt: receiptVerification,
//             timestamp: vote.created_at,
//             verified: zkVerification.isValid && (receiptVerification?.isValid ?? true)
//           }
//         }
//       });

//     } catch (error) {
//       console.error('Vote verification error:', error);
//       res.status(500).json({
//         success: false,
//         message: 'Failed to verify vote',
//         error: error.message
//       });
//     }
//   }

//   // Process votes through mixnet
//   async processMixnet(req, res) {
//     try {
//       const { electionId, userRole } = req.body;

//       // Validate role-based access
//       if (!this.validateUserRole(userRole, 'mixnet')) {
//         return res.status(403).json({
//           success: false,
//           message: 'Insufficient permissions to process mixnet'
//         });
//       }

//       // Get all encrypted votes
//       const encryptedVotes = await EncryptedVote.findByElection(electionId);
      
//       // Process through mixnet
//       const mixnetResult = await this.mixnets.shuffleVotes(
//         encryptedVotes.map(vote => vote.mixnet_data)
//       );

//       // Log audit trail
//       await AuditLog.create({
//         log_id: uuidv4(),
//         election_id: electionId,
//         action_type: 'MIXNET_PROCESSED',
//         actor_id: req.body.userId || 'system',
//         details: {
//           inputVotes: encryptedVotes.length,
//           mixNodes: mixnetResult.mixNodes,
//           rounds: mixnetResult.rounds,
//           timestamp: new Date().toISOString()
//         },
//         hash_chain: await this.calculateHashChain('mixnet', electionId),
//         previous_hash: 'previous_hash_placeholder'
//       });

//       res.status(200).json({
//         success: true,
//         message: 'Mixnet processing completed',
//         data: {
//           electionId,
//           mixnetResult: {
//             shuffledVotes: mixnetResult.shuffledVotes.length,
//             proofs: mixnetResult.proofs,
//             statistics: this.mixnets.getStatistics()
//           }
//         }
//       });

//     } catch (error) {
//       console.error('Mixnet processing error:', error);
//       res.status(500).json({
//         success: false,
//         message: 'Failed to process mixnet',
//         error: error.message
//       });
//     }
//   }

//   // Generate election keys
//   async generateElectionKeys(req, res) {
//     try {
//       const { electionId, userRole } = req.body;

//       // Validate role-based access
//       if (!this.validateUserRole(userRole, 'admin')) {
//         return res.status(403).json({
//           success: false,
//           message: 'Insufficient permissions to generate keys'
//         });
//       }

//       // Generate homomorphic encryption keys
//       const keys = await this.homomorphic.generateKeys();

//       // Log audit trail
//       await AuditLog.create({
//         log_id: uuidv4(),
//         election_id: electionId,
//         action_type: 'KEYS_GENERATED',
//         actor_id: req.body.userId || 'system',
//         details: {
//           keyType: 'homomorphic',
//           keySize: this.homomorphic.keySize,
//           timestamp: new Date().toISOString()
//         },
//         hash_chain: await this.calculateHashChain('keys', electionId),
//         previous_hash: 'previous_hash_placeholder'
//       });

//       res.status(201).json({
//         success: true,
//         message: 'Election keys generated successfully',
//         data: {
//           electionId,
//           publicKey: this.serializeBigInt(keys.publicKey),
//           keyGenerated: true,
//           timestamp: new Date().toISOString()
//         }
//       });

//     } catch (error) {
//       console.error('Key generation error:', error);
//       res.status(500).json({
//         success: false,
//         message: 'Failed to generate keys',
//         error: error.message
//       });
//     }
//   }

//   // Helper methods
//   validateUserRole(userRole, action) {
//   const rolePermissions = {
//     vote: ['individual_election_creator', 'organization_election_creator', 'voter'],
//     tally: ['manager', 'admin', 'auditor', 'analyst'],
//     mixnet: ['manager', 'admin', 'auditor'], 
//     admin: ['manager', 'admin']
//   };

//   // Normalize the input role to lowercase for comparison
//   const normalizedRole = userRole.toLowerCase();
//   return rolePermissions[action]?.includes(normalizedRole) || false;
// }
//   // validateUserRole(userRole, action) {
//   //   const rolePermissions = {
//   //     vote: ['Individual Election Creators', 'Organization Election Creators', 'Voters'],
//   //     tally: ['Manager', 'Admin', 'Auditor', 'Analyst'],
//   //     mixnet: ['Manager', 'Admin', 'Auditor'],
//   //     admin: ['Manager', 'Admin']
//   //   };

//   //   return rolePermissions[action]?.includes(userRole) || false;
//   // }

//   async calculateHashChain(data, electionId) {
//     const { createHash } = await import('node:crypto');
//     return createHash('sha256')
//       .update(`${data}:${electionId}:${Date.now()}`)
//       .digest('hex');
//   }
// }

// export default CryptoController;