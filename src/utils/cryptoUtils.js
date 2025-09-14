import { createHash, randomBytes } from 'node:crypto';

export const generateSecureRandom = (bytes = 32) => {
  return randomBytes(bytes);
};

export const hashData = (data, algorithm = 'sha256') => {
  const hash = createHash(algorithm);
  hash.update(typeof data === 'string' ? data : JSON.stringify(data));
  return hash.digest('hex');
};

export const generateSalt = (length = 32) => {
  return randomBytes(length).toString('hex');
};

export const combineHashes = (hash1, hash2) => {
  return hashData(hash1 + hash2);
};