//role absed access from database
import express from 'express';
import CryptoController from '../controllers/cryptoController.js';
import { validateVoteData, validateTallyData } from '../middleware/validation.js';
import { roleBasedAccess, requireAuth } from '../middleware/roleBasedAccess.js';

const router = express.Router();
const cryptoController = new CryptoController();

// Process encrypted vote
router.post('/vote', 
  requireAuth,
  validateVoteData,
  roleBasedAccess(['Individual Election Creators', 'Organization Election Creators', 'Voters']),
  cryptoController.processVote.bind(cryptoController)
);

// Calculate homomorphic tally
router.post('/tally',
  requireAuth,
  validateTallyData,
  roleBasedAccess(['Manager', 'Admin', 'Auditor', 'Analyst']),
  cryptoController.calculateTally.bind(cryptoController)
);

// Verify vote integrity
router.post('/verify',
  requireAuth,
  cryptoController.verifyVote.bind(cryptoController)
);

// Process mixnet
router.post('/mixnet',
  requireAuth,
  roleBasedAccess(['Manager', 'Admin', 'Auditor']),
  cryptoController.processMixnet.bind(cryptoController)
);

// Generate election keys
router.post('/keys',
  requireAuth,
  roleBasedAccess(['Manager', 'Admin']),
  cryptoController.generateElectionKeys.bind(cryptoController)
);

export default router;

//this is not checking from database
// import express from 'express';
// import CryptoController from '../controllers/cryptoController.js';
// import { validateVoteData, validateTallyData } from '../middleware/validation.js';
// import { roleBasedAccess } from '../middleware/roleBasedAccess.js';

// const router = express.Router();
// const cryptoController = new CryptoController();

// // Process encrypted vote
// router.post('/vote', 
//   validateVoteData,
//   roleBasedAccess(['Individual Election Creators', 'Organization Election Creators', 'Voters']),
//   cryptoController.processVote.bind(cryptoController)
// );

// // Calculate homomorphic tally
// router.post('/tally',
//   validateTallyData,
//   roleBasedAccess(['Manager', 'Admin', 'Auditor', 'Analyst']),
//   cryptoController.calculateTally.bind(cryptoController)
// );

// // Verify vote integrity
// router.post('/verify',
//   cryptoController.verifyVote.bind(cryptoController)
// );

// // Process mixnet
// router.post('/mixnet',
//   roleBasedAccess(['Manager', 'Admin', 'Auditor']),
//   cryptoController.processMixnet.bind(cryptoController)
// );

// // Generate election keys
// router.post('/keys',
//   roleBasedAccess(['Manager', 'Admin']),
//   cryptoController.generateElectionKeys.bind(cryptoController)
// );

// export default router;