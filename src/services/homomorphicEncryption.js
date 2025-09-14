import { randomBytes } from 'node:crypto';
import * as forge from 'node-forge';
import { modPow, modInv, isProbablyPrime, randBetween } from 'bigint-crypto-utils';

class HomomorphicEncryption {
constructor() {
  this.keySize = 1024; // Much smaller for testing
  this.publicKey = null;
  this.privateKey = null;
  this.privateKeyShares = null;
  this.thresholdParams = null;
}

  // Generate Paillier cryptosystem keys with threshold support
  async generateKeys() {
    const p = await this.generatePrime(this.keySize / 2);
    const q = await this.generatePrime(this.keySize / 2);
    
    const n = p * q;
    const lambda = this.lcm(p - 1n, q - 1n);
    
    // Choose g = n + 1 for simplicity
    const g = n + 1n;
    
    // Calculate mu = (L(g^lambda mod n^2))^-1 mod n
    const nsq = n * n;
    const gLambda = modPow(g, lambda, nsq);
    const l = this.L(gLambda, n);
    const mu = modInv(l, n);

    this.publicKey = { n, g, nsq };
    this.privateKey = { lambda, mu, n, nsq };

    // Generate threshold key shares using Shamir's Secret Sharing
    const thresholdN = 5; // Total number of shares
    const thresholdK = 3; // Minimum shares needed for decryption
    const shares = this.generateSecretShares(lambda, thresholdN, thresholdK, n);

    this.privateKeyShares = {
      shares: shares,
      mu: mu,
      n: n,
      nsq: nsq,
      thresholdN: thresholdN,
      thresholdK: thresholdK
    };

    this.thresholdParams = {
      n: thresholdN,
      k: thresholdK
    };

    return {
      publicKey: this.publicKey,
      privateKey: this.privateKey,
      privateKeyShares: this.privateKeyShares,
      thresholdN: thresholdN,
      thresholdK: thresholdK
    };
  }

  // Set public key from database data
  setPublicKey(publicKeyData) {
    try {
      // Handle both string and object formats
      let keyData = publicKeyData;
      if (typeof publicKeyData === 'string') {
        keyData = JSON.parse(publicKeyData);
      }
      
      // Convert string values back to BigInt
      this.publicKey = {
        n: BigInt(keyData.n),
        g: BigInt(keyData.g),
        nsq: BigInt(keyData.nsq)
      };
      
      console.log('Public key set successfully for encryption');
      return this.publicKey;
    } catch (error) {
      console.error('Error setting public key:', error);
      throw new Error('Invalid public key format');
    }
  }

  // Set private key from database data (if needed)
  setPrivateKey(privateKeyData) {
    try {
      let keyData = privateKeyData;
      if (typeof privateKeyData === 'string') {
        keyData = JSON.parse(privateKeyData);
      }
      
      this.privateKey = {
        lambda: BigInt(keyData.lambda),
        mu: BigInt(keyData.mu),
        n: BigInt(keyData.n),
        nsq: BigInt(keyData.nsq)
      };
      
      return this.privateKey;
    } catch (error) {
      console.error('Error setting private key:', error);
      throw new Error('Invalid private key format');
    }
  }

  // Set private key shares for threshold decryption
  setPrivateKeyShares(privateKeySharesData) {
    try {
      let shareData = privateKeySharesData;
      if (typeof privateKeySharesData === 'string') {
        shareData = JSON.parse(privateKeySharesData);
      }
      
      // Handle both threshold shares and single key formats
      if (shareData.shares && shareData.mu && shareData.n) {
        // Threshold shares format
        this.privateKeyShares = {
          shares: shareData.shares.map(share => ({
            id: share.id,
            value: BigInt(share.value)
          })),
          mu: BigInt(shareData.mu),
          n: BigInt(shareData.n),
          nsq: BigInt(shareData.nsq),
          thresholdN: shareData.thresholdN,
          thresholdK: shareData.thresholdK
        };
        
        this.thresholdParams = {
          n: shareData.thresholdN,
          k: shareData.thresholdK
        };
      } else if (shareData.lambda && shareData.mu && shareData.n) {
        // Single private key format - convert to threshold format
        this.privateKey = {
          lambda: BigInt(shareData.lambda),
          mu: BigInt(shareData.mu),
          n: BigInt(shareData.n),
          nsq: BigInt(shareData.nsq || shareData.n * shareData.n)
        };
        
        // Also set as shares for compatibility
        this.privateKeyShares = shareData;
      } else {
        throw new Error('Invalid private key shares format');
      }
      
      console.log('Private key shares loaded successfully');
      return this.privateKeyShares;
    } catch (error) {
      console.error('Error setting private key shares:', error);
      throw new Error('Invalid private key shares format');
    }
  }

  // Encrypt vote using Paillier homomorphic encryption
  encrypt(vote, publicKey = this.publicKey) {
    if (!publicKey) throw new Error('Public key required for encryption');
    
    const { n, g, nsq } = publicKey;
    const m = BigInt(vote);
    
    // Debug logging
    console.log('Encryption debug:', {
      vote: vote,
      n: n.toString(),
      nLength: n.toString().length,
      g: g.toString(),
      nsq: nsq.toString()
    });
    
    // Check if n is reasonable
    if (n <= 100n) {
      throw new Error(`Public key n is too small (${n}). Keys may be corrupted.`);
    }
    
    // Generate random r using a more robust approach
    let r;
    let attempts = 0;
    const maxAttempts = 1000;
    
    do {
      if (attempts++ > maxAttempts) {
        throw new Error('Failed to generate valid random number r');
      }
      
      // Use randomBytes directly (already imported at top)
      const buffer = randomBytes(Math.ceil(n.toString(2).length / 8));
      
      // Convert to BigInt
      r = 0n;
      for (let i = 0; i < buffer.length; i++) {
        r = (r << 8n) | BigInt(buffer[i]);
      }
      
      // Ensure r is in range [2, n-1]
      if (n <= 2n) {
        throw new Error('n is too small for encryption');
      }
      
      r = (r % (n - 2n)) + 2n;
      
    } while (this.gcd(r, n) !== 1n && attempts < maxAttempts);
    
    if (attempts >= maxAttempts) {
      throw new Error('Could not find coprime random number');
    }
    
    console.log('Generated r:', r.toString());

    // c = g^m * r^n mod n^2
    const gm = modPow(g, m, nsq);
    const rn = modPow(r, n, nsq);
    const c = (gm * rn) % nsq;

    return {
      ciphertext: c.toString(),
      randomness: r.toString()
    };
  }

  // Add encrypted votes (homomorphic property)
  addEncrypted(encryptedVotes, publicKey = this.publicKey) {
    if (!publicKey) throw new Error('Public key required for homomorphic addition');
    
    const { nsq } = publicKey;
    let result = 1n;
    
    console.log('Adding encrypted votes:', {
      voteCount: encryptedVotes.length,
      publicKeyExists: !!publicKey
    });
    
    for (const vote of encryptedVotes) {
      // Handle different vote object structures
      let ciphertext;
      if (typeof vote === 'string') {
        ciphertext = vote;
      } else if (vote.ciphertext) {
        ciphertext = vote.ciphertext;
      } else if (vote.homomorphic_data && vote.homomorphic_data.ciphertext) {
        ciphertext = vote.homomorphic_data.ciphertext;
      } else {
        throw new Error('Invalid vote structure for homomorphic addition');
      }
      
      const c = BigInt(ciphertext);
      result = (result * c) % nsq;
    }
    
    console.log('Homomorphic addition completed, result length:', result.toString().length);
    return result.toString();
  }

  // Decrypt result using single private key
  decrypt(ciphertext, privateKey = this.privateKey) {
    if (!privateKey) throw new Error('Private key required for decryption');
    
    const { lambda, mu, n, nsq } = privateKey;
    const c = BigInt(ciphertext);
    
    // m = L(c^lambda mod n^2) * mu mod n
    const cLambda = modPow(c, lambda, nsq);
    const l = this.L(cLambda, n);
    const m = (l * mu) % n;
    
    return Number(m);
  }

  // Threshold decryption using Shamir's Secret Sharing
  thresholdDecrypt(ciphertext, threshold) {
    try {
      // First try threshold decryption if shares are available
      if (this.privateKeyShares && this.privateKeyShares.shares && 
          this.privateKeyShares.shares.length >= threshold) {
        return this.performThresholdDecryption(ciphertext, threshold);
      }
      
      // Fallback to regular decryption if single private key is available
      if (this.privateKey) {
        console.log('Using single key decryption as fallback');
        return this.decrypt(ciphertext, this.privateKey);
      }
      
      throw new Error('No valid decryption keys available');
    } catch (error) {
      console.error('Threshold decryption failed:', error);
      throw error;
    }
  }

  // Perform actual threshold decryption
  performThresholdDecryption(ciphertext, threshold) {
    if (!this.privateKeyShares || !this.privateKeyShares.shares) {
      throw new Error('Private key shares not available for threshold decryption');
    }

    const { shares, mu, n, nsq } = this.privateKeyShares;
    const c = BigInt(ciphertext);
    
    // Use the first 'threshold' number of shares
    const activeShares = shares.slice(0, threshold);
    
    if (activeShares.length < threshold) {
      throw new Error(`Insufficient shares: need ${threshold}, have ${activeShares.length}`);
    }

    // Reconstruct the secret using Lagrange interpolation
    const reconstructedLambda = this.reconstructSecret(activeShares, n);
    
    // Perform decryption with reconstructed lambda
    const cLambda = modPow(c, reconstructedLambda, nsq);
    const l = this.L(cLambda, n);
    const m = (l * mu) % n;
    
    console.log('Threshold decryption completed successfully');
    return Number(m);
  }

  // Generate secret shares using Shamir's Secret Sharing
  generateSecretShares(secret, n, k, modulus) {
    const shares = [];
    
    // Generate k-1 random coefficients for polynomial
    const coefficients = [secret]; // a0 = secret
    for (let i = 1; i < k; i++) {
      coefficients.push(this.generateRandomBigInt(modulus));
    }
    
    // Generate n shares
    for (let x = 1; x <= n; x++) {
      let y = 0n;
      let xPower = 1n;
      
      // Evaluate polynomial at x: f(x) = a0 + a1*x + a2*x^2 + ... + ak-1*x^(k-1)
      for (let j = 0; j < k; j++) {
        y = (y + (coefficients[j] * xPower) % modulus) % modulus;
        xPower = (xPower * BigInt(x)) % modulus;
      }
      
      shares.push({
        id: x,
        value: y
      });
    }
    
    return shares;
  }

  // Reconstruct secret from shares using Lagrange interpolation
  reconstructSecret(shares, modulus) {
    let secret = 0n;
    
    for (let i = 0; i < shares.length; i++) {
      let numerator = 1n;
      let denominator = 1n;
      
      for (let j = 0; j < shares.length; j++) {
        if (i !== j) {
          numerator = (numerator * BigInt(-shares[j].id)) % modulus;
          denominator = (denominator * BigInt(shares[i].id - shares[j].id)) % modulus;
        }
      }
      
      // Calculate modular inverse of denominator
      const denominatorInv = modInv(denominator, modulus);
      const lagrangeCoeff = (numerator * denominatorInv) % modulus;
      
      secret = (secret + (shares[i].value * lagrangeCoeff) % modulus) % modulus;
    }
    
    // Ensure positive result
    secret = ((secret % modulus) + modulus) % modulus;
    return secret;
  }

  // Generate random BigInt within range
  generateRandomBigInt(max) {
    const byteLength = Math.ceil(max.toString(2).length / 8);
    const buffer = randomBytes(byteLength);
    
    let random = 0n;
    for (let i = 0; i < buffer.length; i++) {
      random = (random << 8n) | BigInt(buffer[i]);
    }
    
    return random % max;
  }

  // Helper functions
  async generatePrime(bits) {
    let attempts = 0;
    const maxAttempts = 2000;
    
    while (attempts < maxAttempts) {
      attempts++;
      
      // Generate random bytes for the bit length
      const byteLength = Math.ceil(bits / 8);
      const buffer = randomBytes(byteLength);
      
      // Convert to BigInt
      let candidate = 0n;
      for (let i = 0; i < buffer.length; i++) {
        candidate = (candidate << 8n) | BigInt(buffer[i]);
      }
      
      // Ensure exact bit length
      const bitMask = (1n << BigInt(bits)) - 1n;
      candidate = candidate & bitMask;
      
      // Set the highest bit to ensure exact bit length
      candidate = candidate | (1n << BigInt(bits - 1));
      
      // Make it odd
      candidate = candidate | 1n;
      
      // Quick divisibility tests for small primes
      if (candidate % 3n === 0n || candidate % 5n === 0n || 
          candidate % 7n === 0n || candidate % 11n === 0n || 
          candidate % 13n === 0n || candidate % 17n === 0n) {
        continue;
      }
      
      // Use Miller-Rabin primality test
      if (await isProbablyPrime(candidate, 15)) {
        return candidate;
      }
    }
    
    throw new Error(`Failed to generate ${bits}-bit prime after ${maxAttempts} attempts`);
  }

  L(u, n) {
    return (u - 1n) / n;
  }

  gcd(a, b) {
    while (b !== 0n) {
      [a, b] = [b, a % b];
    }
    return a;
  }

  lcm(a, b) {
    return (a * b) / this.gcd(a, b);
  }

  // Verify homomorphic tallying
  verifyTally(encryptedVotes, expectedSum, publicKey = this.publicKey) {
    const homomorphicSum = this.addEncrypted(encryptedVotes, publicKey);
    const decryptedSum = this.decrypt(homomorphicSum);
    
    return {
      isValid: decryptedSum === expectedSum,
      calculatedSum: decryptedSum,
      expectedSum,
      homomorphicResult: homomorphicSum
    };
  }

  // Get current key status for debugging
  getKeyStatus() {
    return {
      hasPublicKey: !!this.publicKey,
      hasPrivateKey: !!this.privateKey,
      hasPrivateKeyShares: !!this.privateKeyShares,
      keySize: this.keySize,
      thresholdParams: this.thresholdParams,
      publicKeyPreview: this.publicKey ? {
        nLength: this.publicKey.n.toString().length,
        gLength: this.publicKey.g.toString().length
      } : null
    };
  }
}

export default HomomorphicEncryption;
// import { randomBytes } from 'node:crypto';
// import * as forge from 'node-forge';
// import { modPow, modInv, isProbablyPrime, randBetween } from 'bigint-crypto-utils';

// class HomomorphicEncryption {
// constructor() {
//   this.keySize = 1024; // Much smaller for testing
//   this.publicKey = null;
//   this.privateKey = null;
// }

//   // Generate Paillier cryptosystem keys
//   async generateKeys() {
//     const p = await this.generatePrime(this.keySize / 2);
//     const q = await this.generatePrime(this.keySize / 2);
    
//     const n = p * q;
//     const lambda = this.lcm(p - 1n, q - 1n);
    
//     // Choose g = n + 1 for simplicity
//     const g = n + 1n;
    
//     // Calculate mu = (L(g^lambda mod n^2))^-1 mod n
//     const nsq = n * n;
//     const gLambda = modPow(g, lambda, nsq);
//     const l = this.L(gLambda, n);
//     const mu = modInv(l, n);

//     this.publicKey = { n, g, nsq };
//     this.privateKey = { lambda, mu, n, nsq };

//     return {
//       publicKey: this.publicKey,
//       privateKey: this.privateKey
//     };
//   }

//   // Set public key from database data
//   setPublicKey(publicKeyData) {
//     try {
//       // Handle both string and object formats
//       let keyData = publicKeyData;
//       if (typeof publicKeyData === 'string') {
//         keyData = JSON.parse(publicKeyData);
//       }
      
//       // Convert string values back to BigInt
//       this.publicKey = {
//         n: BigInt(keyData.n),
//         g: BigInt(keyData.g),
//         nsq: BigInt(keyData.nsq)
//       };
      
//       console.log('Public key set successfully for encryption');
//       return this.publicKey;
//     } catch (error) {
//       console.error('Error setting public key:', error);
//       throw new Error('Invalid public key format');
//     }
//   }

//   // Set private key from database data (if needed)
//   setPrivateKey(privateKeyData) {
//     try {
//       let keyData = privateKeyData;
//       if (typeof privateKeyData === 'string') {
//         keyData = JSON.parse(privateKeyData);
//       }
      
//       this.privateKey = {
//         lambda: BigInt(keyData.lambda),
//         mu: BigInt(keyData.mu),
//         n: BigInt(keyData.n),
//         nsq: BigInt(keyData.nsq)
//       };
      
//       return this.privateKey;
//     } catch (error) {
//       console.error('Error setting private key:', error);
//       throw new Error('Invalid private key format');
//     }
//   }

//   // Encrypt vote using Paillier homomorphic encryption
//   encrypt(vote, publicKey = this.publicKey) {
//     if (!publicKey) throw new Error('Public key required for encryption');
    
//     const { n, g, nsq } = publicKey;
//     const m = BigInt(vote);
    
//     // Debug logging
//     console.log('Encryption debug:', {
//       vote: vote,
//       n: n.toString(),
//       nLength: n.toString().length,
//       g: g.toString(),
//       nsq: nsq.toString()
//     });
    
//     // Check if n is reasonable
//     if (n <= 100n) {
//       throw new Error(`Public key n is too small (${n}). Keys may be corrupted.`);
//     }
    
//     // Generate random r using a more robust approach
//     let r;
//     let attempts = 0;
//     const maxAttempts = 1000;
    
//     do {
//       if (attempts++ > maxAttempts) {
//         throw new Error('Failed to generate valid random number r');
//       }
      
//       // Use randomBytes directly (already imported at top)
//       const buffer = randomBytes(Math.ceil(n.toString(2).length / 8));
      
//       // Convert to BigInt
//       r = 0n;
//       for (let i = 0; i < buffer.length; i++) {
//         r = (r << 8n) | BigInt(buffer[i]);
//       }
      
//       // Ensure r is in range [2, n-1]
//       if (n <= 2n) {
//         throw new Error('n is too small for encryption');
//       }
      
//       r = (r % (n - 2n)) + 2n;
      
//     } while (this.gcd(r, n) !== 1n && attempts < maxAttempts);
    
//     if (attempts >= maxAttempts) {
//       throw new Error('Could not find coprime random number');
//     }
    
//     console.log('Generated r:', r.toString());

//     // c = g^m * r^n mod n^2
//     const gm = modPow(g, m, nsq);
//     const rn = modPow(r, n, nsq);
//     const c = (gm * rn) % nsq;

//     return {
//       ciphertext: c.toString(),
//       randomness: r.toString()
//     };
//   }

//   // Add encrypted votes (homomorphic property) - MISSING METHOD ADDED
//   addEncrypted(encryptedVotes, publicKey = this.publicKey) {
//     if (!publicKey) throw new Error('Public key required for homomorphic addition');
    
//     const { nsq } = publicKey;
//     let result = 1n;
    
//     console.log('Adding encrypted votes:', {
//       voteCount: encryptedVotes.length,
//       publicKeyExists: !!publicKey
//     });
    
//     for (const vote of encryptedVotes) {
//       // Handle different vote object structures
//       let ciphertext;
//       if (typeof vote === 'string') {
//         ciphertext = vote;
//       } else if (vote.ciphertext) {
//         ciphertext = vote.ciphertext;
//       } else if (vote.homomorphic_data && vote.homomorphic_data.ciphertext) {
//         ciphertext = vote.homomorphic_data.ciphertext;
//       } else {
//         throw new Error('Invalid vote structure for homomorphic addition');
//       }
      
//       const c = BigInt(ciphertext);
//       result = (result * c) % nsq;
//     }
    
//     console.log('Homomorphic addition completed, result length:', result.toString().length);
//     return result.toString();
//   }

//   // Decrypt result
//   decrypt(ciphertext, privateKey = this.privateKey) {
//     if (!privateKey) throw new Error('Private key required for decryption');
    
//     const { lambda, mu, n, nsq } = privateKey;
//     const c = BigInt(ciphertext);
    
//     // m = L(c^lambda mod n^2) * mu mod n
//     const cLambda = modPow(c, lambda, nsq);
//     const l = this.L(cLambda, n);
//     const m = (l * mu) % n;
    
//     return Number(m);
//   }

//   // Helper functions
//   async generatePrime(bits) {
//     let attempts = 0;
//     const maxAttempts = 2000;
    
//     while (attempts < maxAttempts) {
//       attempts++;
      
//       // Generate random bytes for the bit length
//       const byteLength = Math.ceil(bits / 8);
//       const buffer = randomBytes(byteLength);
      
//       // Convert to BigInt
//       let candidate = 0n;
//       for (let i = 0; i < buffer.length; i++) {
//         candidate = (candidate << 8n) | BigInt(buffer[i]);
//       }
      
//       // Ensure exact bit length
//       const bitMask = (1n << BigInt(bits)) - 1n;
//       candidate = candidate & bitMask;
      
//       // Set the highest bit to ensure exact bit length
//       candidate = candidate | (1n << BigInt(bits - 1));
      
//       // Make it odd
//       candidate = candidate | 1n;
      
//       // Quick divisibility tests for small primes
//       if (candidate % 3n === 0n || candidate % 5n === 0n || 
//           candidate % 7n === 0n || candidate % 11n === 0n || 
//           candidate % 13n === 0n || candidate % 17n === 0n) {
//         continue;
//       }
      
//       // Use Miller-Rabin primality test
//       if (await isProbablyPrime(candidate, 15)) {
//         return candidate;
//       }
//     }
    
//     throw new Error(`Failed to generate ${bits}-bit prime after ${maxAttempts} attempts`);
//   }

//   L(u, n) {
//     return (u - 1n) / n;
//   }

//   gcd(a, b) {
//     while (b !== 0n) {
//       [a, b] = [b, a % b];
//     }
//     return a;
//   }

//   lcm(a, b) {
//     return (a * b) / this.gcd(a, b);
//   }

//   // Verify homomorphic tallying
//   verifyTally(encryptedVotes, expectedSum, publicKey = this.publicKey) {
//     const homomorphicSum = this.addEncrypted(encryptedVotes, publicKey);
//     const decryptedSum = this.decrypt(homomorphicSum);
    
//     return {
//       isValid: decryptedSum === expectedSum,
//       calculatedSum: decryptedSum,
//       expectedSum,
//       homomorphicResult: homomorphicSum
//     };
//   }

//   // Get current key status for debugging
//   getKeyStatus() {
//     return {
//       hasPublicKey: !!this.publicKey,
//       hasPrivateKey: !!this.privateKey,
//       keySize: this.keySize,
//       publicKeyPreview: this.publicKey ? {
//         nLength: this.publicKey.n.toString().length,
//         gLength: this.publicKey.g.toString().length
//       } : null
//     };
//   }
// }

// export default HomomorphicEncryption;
// // import { randomBytes } from 'node:crypto';
// // import * as forge from 'node-forge';
// // import { modPow, modInv, isProbablyPrime, randBetween } from 'bigint-crypto-utils';

// // class HomomorphicEncryption {
// // constructor() {
// //   this.keySize = 1024; // Much smaller for testing
// //   this.publicKey = null;
// //   this.privateKey = null;
// // }


// //   // Generate Paillier cryptosystem keys
// //   async generateKeys() {
// //     const p = await this.generatePrime(this.keySize / 2);
// //     const q = await this.generatePrime(this.keySize / 2);
    
// //     const n = p * q;
// //     const lambda = this.lcm(p - 1n, q - 1n);
    
// //     // Choose g = n + 1 for simplicity
// //     const g = n + 1n;
    
// //     // Calculate mu = (L(g^lambda mod n^2))^-1 mod n
// //     const nsq = n * n;
// //     const gLambda = modPow(g, lambda, nsq);
// //     const l = this.L(gLambda, n);
// //     const mu = modInv(l, n);

// //     this.publicKey = { n, g, nsq };
// //     this.privateKey = { lambda, mu, n, nsq };

// //     return {
// //       publicKey: this.publicKey,
// //       privateKey: this.privateKey
// //     };
// //   }

// //   // Set public key from database data
// //   setPublicKey(publicKeyData) {
// //     try {
// //       // Handle both string and object formats
// //       let keyData = publicKeyData;
// //       if (typeof publicKeyData === 'string') {
// //         keyData = JSON.parse(publicKeyData);
// //       }
      
// //       // Convert string values back to BigInt
// //       this.publicKey = {
// //         n: BigInt(keyData.n),
// //         g: BigInt(keyData.g),
// //         nsq: BigInt(keyData.nsq)
// //       };
      
// //       console.log('Public key set successfully for encryption');
// //       return this.publicKey;
// //     } catch (error) {
// //       console.error('Error setting public key:', error);
// //       throw new Error('Invalid public key format');
// //     }
// //   }

// //   // Set private key from database data (if needed)
// //   setPrivateKey(privateKeyData) {
// //     try {
// //       let keyData = privateKeyData;
// //       if (typeof privateKeyData === 'string') {
// //         keyData = JSON.parse(privateKeyData);
// //       }
      
// //       this.privateKey = {
// //         lambda: BigInt(keyData.lambda),
// //         mu: BigInt(keyData.mu),
// //         n: BigInt(keyData.n),
// //         nsq: BigInt(keyData.nsq)
// //       };
      
// //       return this.privateKey;
// //     } catch (error) {
// //       console.error('Error setting private key:', error);
// //       throw new Error('Invalid private key format');
// //     }
// //   }

// //   // Encrypt vote using Paillier homomorphic encryption
// //   encrypt(vote, publicKey = this.publicKey) {
// //     if (!publicKey) throw new Error('Public key required for encryption');
    
// //     const { n, g, nsq } = publicKey;
// //     const m = BigInt(vote);
    
// //     // Generate random r
// //     let r;
// //     do {
// //       r = randBetween(1n, n);
// //     } while (this.gcd(r, n) !== 1n);

// //     // c = g^m * r^n mod n^2
// //     const gm = modPow(g, m, nsq);
// //     const rn = modPow(r, n, nsq);
// //     const c = (gm * rn) % nsq;

// //     return {
// //       ciphertext: c.toString(),
// //       randomness: r.toString()
// //     };
// //   }

// //   // Add encrypted votes (homomorphic property)
// // encrypt(vote, publicKey = this.publicKey) {
// //   if (!publicKey) throw new Error('Public key required for encryption');
  
// //   const { n, g, nsq } = publicKey;
// //   const m = BigInt(vote);
  
// //   // Debug logging
// //   console.log('Encryption debug:', {
// //     vote: vote,
// //     n: n.toString(),
// //     nLength: n.toString().length,
// //     g: g.toString(),
// //     nsq: nsq.toString()
// //   });
  
// //   // Check if n is reasonable
// //   if (n <= 100n) {
// //     throw new Error(`Public key n is too small (${n}). Keys may be corrupted.`);
// //   }
  
// //   // Generate random r using a more robust approach
// //   let r;
// //   let attempts = 0;
// //   const maxAttempts = 1000;
  
// //   do {
// //     if (attempts++ > maxAttempts) {
// //       throw new Error('Failed to generate valid random number r');
// //     }
    
// //     // Use randomBytes directly (already imported at top)
// //     const buffer = randomBytes(Math.ceil(n.toString(2).length / 8));
    
// //     // Convert to BigInt
// //     r = 0n;
// //     for (let i = 0; i < buffer.length; i++) {
// //       r = (r << 8n) | BigInt(buffer[i]);
// //     }
    
// //     // Ensure r is in range [2, n-1]
// //     if (n <= 2n) {
// //       throw new Error('n is too small for encryption');
// //     }
    
// //     r = (r % (n - 2n)) + 2n;
    
// //   } while (this.gcd(r, n) !== 1n && attempts < maxAttempts);
  
// //   if (attempts >= maxAttempts) {
// //     throw new Error('Could not find coprime random number');
// //   }
  
// //   console.log('Generated r:', r.toString());

// //   // c = g^m * r^n mod n^2
// //   const gm = modPow(g, m, nsq);
// //   const rn = modPow(r, n, nsq);
// //   const c = (gm * rn) % nsq;

// //   return {
// //     ciphertext: c.toString(),
// //     randomness: r.toString()
// //   };
// // }
  

// //   // Decrypt result
// //   decrypt(ciphertext, privateKey = this.privateKey) {
// //     if (!privateKey) throw new Error('Private key required for decryption');
    
// //     const { lambda, mu, n, nsq } = privateKey;
// //     const c = BigInt(ciphertext);
    
// //     // m = L(c^lambda mod n^2) * mu mod n
// //     const cLambda = modPow(c, lambda, nsq);
// //     const l = this.L(cLambda, n);
// //     const m = (l * mu) % n;
    
// //     return Number(m);
// //   }

// //   // Helper functions
// //   async generatePrime(bits) {
// //   let attempts = 0;
// //   const maxAttempts = 2000;
  
// //   while (attempts < maxAttempts) {
// //     attempts++;
    
// //     // Generate random bytes for the bit length
// //     const byteLength = Math.ceil(bits / 8);
// //     const buffer = randomBytes(byteLength);
    
// //     // Convert to BigInt
// //     let candidate = 0n;
// //     for (let i = 0; i < buffer.length; i++) {
// //       candidate = (candidate << 8n) | BigInt(buffer[i]);
// //     }
    
// //     // Ensure exact bit length
// //     const bitMask = (1n << BigInt(bits)) - 1n;
// //     candidate = candidate & bitMask;
    
// //     // Set the highest bit to ensure exact bit length
// //     candidate = candidate | (1n << BigInt(bits - 1));
    
// //     // Make it odd
// //     candidate = candidate | 1n;
    
// //     // Quick divisibility tests for small primes
// //     if (candidate % 3n === 0n || candidate % 5n === 0n || 
// //         candidate % 7n === 0n || candidate % 11n === 0n || 
// //         candidate % 13n === 0n || candidate % 17n === 0n) {
// //       continue;
// //     }
    
// //     // Use Miller-Rabin primality test
// //     if (await isProbablyPrime(candidate, 15)) {
// //       return candidate;
// //     }
// //   }
  
// //   throw new Error(`Failed to generate ${bits}-bit prime after ${maxAttempts} attempts`);
// // }

// //   L(u, n) {
// //     return (u - 1n) / n;
// //   }

// //   gcd(a, b) {
// //     while (b !== 0n) {
// //       [a, b] = [b, a % b];
// //     }
// //     return a;
// //   }

// //   lcm(a, b) {
// //     return (a * b) / this.gcd(a, b);
// //   }

// //   // Verify homomorphic tallying
// //   verifyTally(encryptedVotes, expectedSum, publicKey = this.publicKey) {
// //     const homomorphicSum = this.addEncrypted(encryptedVotes, publicKey);
// //     const decryptedSum = this.decrypt(homomorphicSum);
    
// //     return {
// //       isValid: decryptedSum === expectedSum,
// //       calculatedSum: decryptedSum,
// //       expectedSum,
// //       homomorphicResult: homomorphicSum
// //     };
// //   }

// //   // Get current key status for debugging
// //   getKeyStatus() {
// //     return {
// //       hasPublicKey: !!this.publicKey,
// //       hasPrivateKey: !!this.privateKey,
// //       keySize: this.keySize,
// //       publicKeyPreview: this.publicKey ? {
// //         nLength: this.publicKey.n.toString().length,
// //         gLength: this.publicKey.g.toString().length
// //       } : null
// //     };
// //   }
// // }

// // export default HomomorphicEncryption;

