const crypto = require('crypto');
const password = process.argv[2];
if (!password || password.length < 12) {
  console.error('Uso: node scripts/generate-admin-hash.js "UnaClaveDe12+Caracteres"');
  process.exit(1);
}
const N = 16384, r = 8, p = 1;
const salt = crypto.randomBytes(16);
const hash = crypto.scryptSync(password, salt, 64, { N, r, p, maxmem: 32 * 1024 * 1024 });
console.log(`ADMIN_PASSWORD_HASH=scrypt$${N}$${r}$${p}$${salt.toString('base64url')}$${hash.toString('base64url')}`);
