//role based access control from database
import express from 'express';
import HomomorphicController from '../controllers/homomorphicController.js';
import { roleBasedAccess, requireAuth } from '../middleware/roleBasedAccess.js';

const router = express.Router();
const homomorphicController = new HomomorphicController();

// Initialize homomorphic encryption
router.post('/initialize',
  requireAuth,
  roleBasedAccess(['Manager', 'Admin']),
  homomorphicController.initializeEncryption.bind(homomorphicController)
);

// Encrypt vote
router.post('/encrypt',
  requireAuth,
  homomorphicController.encryptVote.bind(homomorphicController)
);

// Add encrypted votes
router.post('/add',
  requireAuth,
  roleBasedAccess(['Manager', 'Admin', 'Auditor', 'Analyst']),
  homomorphicController.addEncryptedVotes.bind(homomorphicController)
);

// Verify tally
router.post('/verify-tally',
  requireAuth,
  homomorphicController.verifyTally.bind(homomorphicController)
);

export default router;

//this role based check is not from database
// import express from 'express';
// import HomomorphicController from '../controllers/homomorphicController.js';
// import { roleBasedAccess } from '../middleware/roleBasedAccess.js';

// const router = express.Router();
// const homomorphicController = new HomomorphicController();

// // Initialize homomorphic encryption
// router.post('/initialize',
//   roleBasedAccess(['Manager', 'Admin']),
//   homomorphicController.initializeEncryption.bind(homomorphicController)
// );

// // Encrypt vote
// router.post('/encrypt',
//   homomorphicController.encryptVote.bind(homomorphicController)
// );

// // Add encrypted votes
// router.post('/add',
//   roleBasedAccess(['Manager', 'Admin', 'Auditor', 'Analyst']),
//   homomorphicController.addEncryptedVotes.bind(homomorphicController)
// );

// // Verify tally
// router.post('/verify-tally',
//   homomorphicController.verifyTally.bind(homomorphicController)
// );

// export default router;

