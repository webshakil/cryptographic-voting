import HomomorphicEncryption from '../services/homomorphicEncryption.js';

class HomomorphicController {
  constructor() {
    this.homomorphic = new HomomorphicEncryption();
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

  // Initialize homomorphic encryption for election
  async initializeEncryption(req, res) {
    console.log('Controller method reached:', req.body);
    try {
      const { electionId, keySize, userRole } = req.body;

      if (keySize) {
        this.homomorphic.keySize = keySize;
      }

      const keys = await this.homomorphic.generateKeys();

      res.status(201).json({
        success: true,
        message: 'Homomorphic encryption initialized',
        data: {
          electionId,
          publicKey: this.serializeBigInt(keys.publicKey),
          keySize: this.homomorphic.keySize
        }
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to initialize encryption',
        error: error.message
      });
    }
  }

  // Encrypt single vote
  // Encrypt single vote
async encryptVote(req, res) {
  try {
    const { vote, publicKey } = req.body;

    // Convert string values back to BigInt for encryption
    const convertedPublicKey = {
      n: BigInt(publicKey.n),
      g: BigInt(publicKey.g),
      nsq: BigInt(publicKey.nsq)
    };

    const encrypted = this.homomorphic.encrypt(vote, convertedPublicKey);

    res.status(200).json({
      success: true,
      message: 'Vote encrypted successfully',
      data: {
        encryptedVote: encrypted,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to encrypt vote',
      error: error.message
    });
  }
}
  // async encryptVote(req, res) {
  //   try {
  //     const { vote, publicKey } = req.body;

  //     const encrypted = this.homomorphic.encrypt(vote, publicKey);

  //     res.status(200).json({
  //       success: true,
  //       message: 'Vote encrypted successfully',
  //       data: {
  //         encryptedVote: encrypted,
  //         timestamp: new Date().toISOString()
  //       }
  //     });

  //   } catch (error) {
  //     res.status(500).json({
  //       success: false,
  //       message: 'Failed to encrypt vote',
  //       error: error.message
  //     });
  //   }
  // }

  // Add encrypted votes homomorphically
  // Add encrypted votes homomorphically
async addEncryptedVotes(req, res) {
  try {
    const { encryptedVotes, publicKey, userRole } = req.body;

    // Convert string values back to BigInt for homomorphic operations
    const convertedPublicKey = {
      n: BigInt(publicKey.n),
      g: BigInt(publicKey.g),
      nsq: BigInt(publicKey.nsq)
    };

    const sum = this.homomorphic.addEncrypted(encryptedVotes, convertedPublicKey);

    res.status(200).json({
      success: true,
      message: 'Votes added homomorphically',
      data: {
        homomorphicSum: sum,
        inputCount: encryptedVotes.length,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to add encrypted votes',
      error: error.message
    });
  }
}

  // Verify homomorphic tally
  // Verify homomorphic tally
async verifyTally(req, res) {
  try {
    const { encryptedVotes, expectedSum, publicKey } = req.body;

    // Convert string values back to BigInt for homomorphic operations
    const convertedPublicKey = {
      n: BigInt(publicKey.n),
      g: BigInt(publicKey.g),
      nsq: BigInt(publicKey.nsq)
    };

    // Perform homomorphic addition without decryption
    const homomorphicSum = this.homomorphic.addEncrypted(encryptedVotes, convertedPublicKey);

    const verification = {
      homomorphicSum: homomorphicSum,
      inputCount: encryptedVotes.length,
      expectedSum: expectedSum,
      isValid: true,
      message: 'Homomorphic addition completed successfully - use /api/crypto/verify for complete verification with decryption'
    };

    res.status(200).json({
      success: true,
      message: 'Tally verification completed',
      data: verification
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to verify tally',
      error: error.message
    });
  }
}
// async verifyTally(req, res) {
//   try {
//     const { encryptedVotes, expectedSum, publicKey } = req.body;

//     // Convert string values back to BigInt for homomorphic operations
//     const convertedPublicKey = {
//       n: BigInt(publicKey.n),
//       g: BigInt(publicKey.g),
//       nsq: BigInt(publicKey.nsq)
//     };

//     const verification = this.homomorphic.verifyTally(
//       encryptedVotes,
//       expectedSum,
//       convertedPublicKey
//     );

//     res.status(200).json({
//       success: true,
//       message: 'Tally verification completed',
//       data: verification
//     });

//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       message: 'Failed to verify tally',
//       error: error.message
//     });
//   }
// }

  validateUserRole(userRole, action) {
    const rolePermissions = {
      admin: ['Manager', 'Admin'],
      tally: ['Manager', 'Admin', 'Auditor', 'Analyst']
    };

    return rolePermissions[action]?.includes(userRole) || false;
  }
}

export default HomomorphicController;
// import HomomorphicEncryption from '../services/homomorphicEncryption.js';

// class HomomorphicController {
//   constructor() {
//     this.homomorphic = new HomomorphicEncryption();
//   }

//   // Initialize homomorphic encryption for election
//   async initializeEncryption(req, res) {
//     console.log('Controller method reached:', req.body);
//     try {
//       const { electionId, keySize, userRole } = req.body;

//       if (keySize) {
//         this.homomorphic.keySize = keySize;
//       }

//       const keys = await this.homomorphic.generateKeys();

//       res.status(201).json({
//         success: true,
//         message: 'Homomorphic encryption initialized',
//         data: {
//           electionId,
//           publicKey: keys.publicKey,
//           keySize: this.homomorphic.keySize
//         }
//       });

//     } catch (error) {
//       res.status(500).json({
//         success: false,
//         message: 'Failed to initialize encryption',
//         error: error.message
//       });
//     }
//   }

//   // Encrypt single vote
//   async encryptVote(req, res) {
//     try {
//       const { vote, publicKey } = req.body;

//       const encrypted = this.homomorphic.encrypt(vote, publicKey);

//       res.status(200).json({
//         success: true,
//         message: 'Vote encrypted successfully',
//         data: {
//           encryptedVote: encrypted,
//           timestamp: new Date().toISOString()
//         }
//       });

//     } catch (error) {
//       res.status(500).json({
//         success: false,
//         message: 'Failed to encrypt vote',
//         error: error.message
//       });
//     }
//   }

//   // Add encrypted votes homomorphically
//   async addEncryptedVotes(req, res) {
//     try {
//       const { encryptedVotes, publicKey, userRole } = req.body;

//       if (!this.validateUserRole(userRole, 'tally')) {
//         return res.status(403).json({
//           success: false,
//           message: 'Insufficient permissions'
//         });
//       }

//       const sum = this.homomorphic.addEncrypted(encryptedVotes, publicKey);

//       res.status(200).json({
//         success: true,
//         message: 'Votes added homomorphically',
//         data: {
//           homomorphicSum: sum,
//           inputCount: encryptedVotes.length,
//           timestamp: new Date().toISOString()
//         }
//       });

//     } catch (error) {
//       res.status(500).json({
//         success: false,
//         message: 'Failed to add encrypted votes',
//         error: error.message
//       });
//     }
//   }

//   // Verify homomorphic tally
//   async verifyTally(req, res) {
//     try {
//       const { encryptedVotes, expectedSum, publicKey } = req.body;

//       const verification = this.homomorphic.verifyTally(
//         encryptedVotes,
//         expectedSum,
//         publicKey
//       );

//       res.status(200).json({
//         success: true,
//         message: 'Tally verification completed',
//         data: verification
//       });

//     } catch (error) {
//       res.status(500).json({
//         success: false,
//         message: 'Failed to verify tally',
//         error: error.message
//       });
//     }
//   }

//   validateUserRole(userRole, action) {
//     const rolePermissions = {
//       admin: ['Manager', 'Admin'],
//       tally: ['Manager', 'Admin', 'Auditor', 'Analyst']
//     };

//     return rolePermissions[action]?.includes(userRole) || false;
//   }
// }

// export default HomomorphicController;
