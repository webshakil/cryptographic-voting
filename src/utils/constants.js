export const CRYPTO_CONSTANTS = {
  DEFAULT_KEY_SIZE: 2048,
  HASH_ALGORITHM: 'sha256',
  CURVE_NAME: 'secp256k1',
  SALT_LENGTH: 32,
  PROOF_CHALLENGE_LENGTH: 32,
  RECEIPT_CODE_LENGTH: 12,
  MIX_ROUNDS: 3,
  ZK_PROOF_VERSION: '1.0',
  HOMOMORPHIC_VERSION: '1.0'
};

export const ROLE_PERMISSIONS = {
  VOTE: ['Individual Election Creators', 'Organization Election Creators', 'Voters'],
  TALLY: ['Manager', 'Admin', 'Auditor', 'Analyst'],
  MIXNET: ['Manager', 'Admin', 'Auditor'],
  ADMIN: ['Manager', 'Admin'],
  VERIFY: ['Manager', 'Admin', 'Auditor', 'Individual Election Creators', 'Organization Election Creators', 'Voters']
};