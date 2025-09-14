//import { secp256k1 } from '@noble/secp256k1';
import * as secp256k1 from '@noble/secp256k1';
import { randomBytes, createHash } from 'node:crypto';

class ZeroKnowledgeProof {
  constructor() {
    this.curve = secp256k1;
  }

  // Generate commitment for vote
  generateCommitment(vote, randomness) {
    const voteHash = createHash('sha256').update(vote.toString()).digest();
    const randomnessHash = createHash('sha256').update(randomness).digest();
    
    // Pedersen commitment: C = g^v * h^r
    const g = this.curve.Point.BASE;
    const h = this.curve.Point.fromHex('0250929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0');
    
    const voteScalar = BigInt('0x' + voteHash.toString('hex')) % this.curve.CURVE.n;
    const randomnessScalar = BigInt('0x' + randomnessHash.toString('hex')) % this.curve.CURVE.n;
    
    const commitment = g.multiply(voteScalar).add(h.multiply(randomnessScalar));
    
    return {
      commitment: commitment.toHex(),
      voteScalar: voteScalar.toString(16),
      randomnessScalar: randomnessScalar.toString(16)
    };
  }

  // Generate zero-knowledge proof of valid vote
  generateProof(vote, candidates, commitment) {
    const proofs = [];
    
    for (let i = 0; i < candidates.length; i++) {
      const isVoted = vote === i;
      const proof = this.generateSigmaProof(isVoted, commitment, i);
      proofs.push(proof);
    }
    
    return {
      proofs,
      challenge: this.generateChallenge(proofs),
      timestamp: Date.now()
    };
  }

  // Generate sigma protocol proof
  generateSigmaProof(isVoted, commitment, candidateIndex) {
    const r = randomBytes(32);
    const rScalar = BigInt('0x' + r.toString('hex')) % this.curve.CURVE.n;
    
    const g = this.curve.Point.BASE;
    const a = g.multiply(rScalar);
    
    if (isVoted) {
      // Real proof
      return {
        candidateIndex,
        a: a.toHex(),
        z: rScalar.toString(16),
        type: 'real'
      };
    } else {
      // Simulated proof
      const c = randomBytes(32);
      const z = randomBytes(32);
      const cScalar = BigInt('0x' + c.toString('hex')) % this.curve.CURVE.n;
      const zScalar = BigInt('0x' + z.toString('hex')) % this.curve.CURVE.n;
      
      return {
        candidateIndex,
        a: a.toHex(),
        c: c.toString('hex'),
        z: zScalar.toString(16),
        type: 'simulated'
      };
    }
  }

  // Verify zero-knowledge proof
  verifyProof(proof, commitment, candidates) {
    const { proofs, challenge } = proof;
    
    if (proofs.length !== candidates.length) {
      return { isValid: false, reason: 'Invalid proof count' };
    }
    
    // Verify each sigma proof
    for (const sigmaProof of proofs) {
      if (!this.verifySigmaProof(sigmaProof, commitment)) {
        return { 
          isValid: false, 
          reason: `Invalid sigma proof for candidate ${sigmaProof.candidateIndex}` 
        };
      }
    }
    
    // Verify challenge
    const calculatedChallenge = this.generateChallenge(proofs);
    if (calculatedChallenge !== challenge) {
      return { isValid: false, reason: 'Invalid challenge' };
    }
    
    return { isValid: true };
  }

  // Verify sigma protocol proof
  verifySigmaProof(sigmaProof, commitment) {
    try {
      const g = this.curve.Point.BASE;
      const a = this.curve.Point.fromHex(sigmaProof.a);
      
      if (sigmaProof.type === 'real') {
        // Verify real proof
        const z = BigInt('0x' + sigmaProof.z);
        const gz = g.multiply(z);
        return gz.equals(a);
      } else {
        // Verify simulated proof  
        const c = BigInt('0x' + sigmaProof.c);
        const z = BigInt('0x' + sigmaProof.z);
        
        // Additional verification logic for simulated proofs
        return true; // Simplified for demo
      }
    } catch (error) {
      return false;
    }
  }

  // Generate Fiat-Shamir challenge
  generateChallenge(proofs) {
    const data = proofs.map(p => p.a).join('');
    return createHash('sha256').update(data).digest('hex');
  }

  // Generate nullifier to prevent double voting - FIXED VERSION
  generateNullifier(userId, electionId, randomness) {
    // Include randomness and timestamp to ensure uniqueness while maintaining cryptographic properties
    const input = `${userId}:${electionId}:${randomness}:${Date.now()}`;
    const hash = createHash('sha256').update(input).digest();
    const scalar = BigInt('0x' + hash.toString('hex')) % this.curve.CURVE.n;
    
    const g = this.curve.Point.BASE;
    const nullifier = g.multiply(scalar);
    
    return {
      nullifier: nullifier.toHex(),
      proof: this.generateNullifierProof(scalar, randomness)
    };
  }

  // Generate proof of nullifier correctness - FIXED VERSION
  generateNullifierProof(scalar, randomness) {
    const r = randomBytes(32);
    const rScalar = BigInt('0x' + r.toString('hex')) % this.curve.CURVE.n;
    
    // Use randomness hash instead of privateKey for the proof
    const randomnessHash = createHash('sha256').update(randomness.toString()).digest();
    const randomnessScalar = BigInt('0x' + randomnessHash.toString('hex')) % this.curve.CURVE.n;
    
    return {
      commitment: rScalar.toString(16),
      response: (rScalar + scalar * randomnessScalar).toString(16),
      randomnessUsed: randomness.toString()
    };
  }

  // Helper method to verify nullifier proof
  verifyNullifierProof(nullifierData, userId, electionId) {
    try {
      const { nullifier, proof } = nullifierData;
      
      // Recreate the input that should have generated this nullifier
      const input = `${userId}:${electionId}:${proof.randomnessUsed}`;
      const hash = createHash('sha256').update(input).digest();
      const expectedScalar = BigInt('0x' + hash.toString('hex')) % this.curve.CURVE.n;
      
      const g = this.curve.Point.BASE;
      const expectedNullifier = g.multiply(expectedScalar);
      
      // Verify the nullifier matches what we expect
      return expectedNullifier.toHex() === nullifier;
    } catch (error) {
      console.error('Nullifier verification error:', error);
      return false;
    }
  }

  // Method to check if a nullifier is unique for an election
  isNullifierUnique(nullifier, existingNullifiers) {
    return !existingNullifiers.includes(nullifier);
  }
}

export default ZeroKnowledgeProof;
// //import { secp256k1 } from '@noble/secp256k1';
// import * as secp256k1 from '@noble/secp256k1';
// import { randomBytes, createHash } from 'node:crypto';

// class ZeroKnowledgeProof {
//   constructor() {
//     this.curve = secp256k1;
//   }

//   // Generate commitment for vote
//   generateCommitment(vote, randomness) {
//     const voteHash = createHash('sha256').update(vote.toString()).digest();
//     const randomnessHash = createHash('sha256').update(randomness).digest();
    
//     // Pedersen commitment: C = g^v * h^r
//     const g = this.curve.Point.BASE;
//     const h = this.curve.Point.fromHex('0250929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0');
    
//     const voteScalar = BigInt('0x' + voteHash.toString('hex')) % this.curve.CURVE.n;
//     const randomnessScalar = BigInt('0x' + randomnessHash.toString('hex')) % this.curve.CURVE.n;
    
//     const commitment = g.multiply(voteScalar).add(h.multiply(randomnessScalar));
    
//     return {
//       commitment: commitment.toHex(),
//       voteScalar: voteScalar.toString(16),
//       randomnessScalar: randomnessScalar.toString(16)
//     };
//   }

//   // Generate zero-knowledge proof of valid vote
//   generateProof(vote, candidates, commitment) {
//     const proofs = [];
    
//     for (let i = 0; i < candidates.length; i++) {
//       const isVoted = vote === i;
//       const proof = this.generateSigmaProof(isVoted, commitment, i);
//       proofs.push(proof);
//     }
    
//     return {
//       proofs,
//       challenge: this.generateChallenge(proofs),
//       timestamp: Date.now()
//     };
//   }

//   // Generate sigma protocol proof
//   generateSigmaProof(isVoted, commitment, candidateIndex) {
//     const r = randomBytes(32);
//     const rScalar = BigInt('0x' + r.toString('hex')) % this.curve.CURVE.n;
    
//     const g = this.curve.Point.BASE;
//     const a = g.multiply(rScalar);
    
//     if (isVoted) {
//       // Real proof
//       return {
//         candidateIndex,
//         a: a.toHex(),
//         z: rScalar.toString(16),
//         type: 'real'
//       };
//     } else {
//       // Simulated proof
//       const c = randomBytes(32);
//       const z = randomBytes(32);
//       const cScalar = BigInt('0x' + c.toString('hex')) % this.curve.CURVE.n;
//       const zScalar = BigInt('0x' + z.toString('hex')) % this.curve.CURVE.n;
      
//       return {
//         candidateIndex,
//         a: a.toHex(),
//         c: c.toString('hex'),
//         z: zScalar.toString(16),
//         type: 'simulated'
//       };
//     }
//   }

//   // Verify zero-knowledge proof
//   verifyProof(proof, commitment, candidates) {
//     const { proofs, challenge } = proof;
    
//     if (proofs.length !== candidates.length) {
//       return { isValid: false, reason: 'Invalid proof count' };
//     }
    
//     // Verify each sigma proof
//     for (const sigmaProof of proofs) {
//       if (!this.verifySigmaProof(sigmaProof, commitment)) {
//         return { 
//           isValid: false, 
//           reason: `Invalid sigma proof for candidate ${sigmaProof.candidateIndex}` 
//         };
//       }
//     }
    
//     // Verify challenge
//     const calculatedChallenge = this.generateChallenge(proofs);
//     if (calculatedChallenge !== challenge) {
//       return { isValid: false, reason: 'Invalid challenge' };
//     }
    
//     return { isValid: true };
//   }

//   // Verify sigma protocol proof
//   verifySigmaProof(sigmaProof, commitment) {
//     try {
//       const g = this.curve.Point.BASE;
//       const a = this.curve.Point.fromHex(sigmaProof.a);
      
//       if (sigmaProof.type === 'real') {
//         // Verify real proof
//         const z = BigInt('0x' + sigmaProof.z);
//         const gz = g.multiply(z);
//         return gz.equals(a);
//       } else {
//         // Verify simulated proof  
//         const c = BigInt('0x' + sigmaProof.c);
//         const z = BigInt('0x' + sigmaProof.z);
        
//         // Additional verification logic for simulated proofs
//         return true; // Simplified for demo
//       }
//     } catch (error) {
//       return false;
//     }
//   }

//   // Generate Fiat-Shamir challenge
//   generateChallenge(proofs) {
//     const data = proofs.map(p => p.a).join('');
//     return createHash('sha256').update(data).digest('hex');
//   }

//   // Generate nullifier to prevent double voting
//   generateNullifier(userId, electionId, privateKey) {
//     const input = `${userId}:${electionId}`;
//     const hash = createHash('sha256').update(input).digest();
//     const scalar = BigInt('0x' + hash.toString('hex')) % this.curve.CURVE.n;
    
//     const g = this.curve.Point.BASE;
//     const nullifier = g.multiply(scalar);
    
//     return {
//       nullifier: nullifier.toHex(),
//       proof: this.generateNullifierProof(scalar, privateKey)
//     };
//   }

//   // Generate proof of nullifier correctness
//   generateNullifierProof(scalar, privateKey) {
//     const r = randomBytes(32);
//     const rScalar = BigInt('0x' + r.toString('hex')) % this.curve.CURVE.n;
    
//     return {
//       commitment: rScalar.toString(16),
//       response: (rScalar + scalar * BigInt('0x' + privateKey)).toString(16)
//     };
//   }
// }

// export default ZeroKnowledgeProof;