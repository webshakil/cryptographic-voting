import ZeroKnowledgeProof from '../services/zeroKnowledgeProof.js';

class ZKProofController {
  constructor() {
    this.zkProof = new ZeroKnowledgeProof();
  }

  // Generate commitment for vote
  async generateCommitment(req, res) {
    try {
      const { vote, randomness } = req.body;

      const commitment = this.zkProof.generateCommitment(vote, randomness);

      res.status(201).json({
        success: true,
        message: 'Commitment generated successfully',
        data: commitment
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to generate commitment',
        error: error.message
      });
    }
  }

  // Generate zero-knowledge proof
  async generateProof(req, res) {
    try {
      const { vote, candidates, commitment } = req.body;

      const proof = this.zkProof.generateProof(vote, candidates, commitment);

      res.status(201).json({
        success: true,
        message: 'Zero-knowledge proof generated',
        data: proof
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to generate proof',
        error: error.message
      });
    }
  }

  // Verify zero-knowledge proof
  async verifyProof(req, res) {
    try {
      const { proof, commitment, candidates } = req.body;

      const verification = this.zkProof.verifyProof(proof, commitment, candidates);

      res.status(200).json({
        success: true,
        message: 'Proof verification completed',
        data: verification
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to verify proof',
        error: error.message
      });
    }
  }

  // Generate nullifier
  async generateNullifier(req, res) {
    try {
      const { userId, electionId, privateKey } = req.body;

      const nullifier = this.zkProof.generateNullifier(userId, electionId, privateKey);

      res.status(201).json({
        success: true,
        message: 'Nullifier generated successfully',
        data: nullifier
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to generate nullifier',
        error: error.message
      });
    }
  }
}

export default ZKProofController;