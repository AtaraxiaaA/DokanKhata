import bcrypt from 'bcryptjs';

// the seed hashes were made with PHP's password_hash() so they start with $2y$.
// $2y$ and $2b$ are the same bcrypt, bcryptjs just wants $2b$
const normalise = (hash: string) => hash.replace(/^\$2y\$/, '$2b$');

export const verifyPassword = (plain: string, hash: string) =>
  bcrypt.compare(plain, normalise(hash));
export const hashPassword = (plain: string) => bcrypt.hash(plain, 10);
