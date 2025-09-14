import express from 'express';
import ZKProofController from '../controllers/zkProofController.js';

const router = express.Router();
const zkProofController = new ZKProofController();

// Generate commitment
router.post('/commitment',
  zkProofController.generateCommitment.bind(zkProofController)
);

// Generate proof
router.post('/proof',
  zkProofController.generateProof.bind(zkProofController)
);

// Verify proof
router.post('/verify',
  zkProofController.verifyProof.bind(zkProofController)
);

// Generate nullifier
router.post('/nullifier',
  zkProofController.generateNullifier.bind(zkProofController)
);

export default router;