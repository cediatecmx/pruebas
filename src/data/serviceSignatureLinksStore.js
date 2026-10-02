const crypto = require('crypto');
const db = require('./db');

const VALID_TYPES = new Set(['reception','authorization','delivery']);
function hashToken(token){ return crypto.createHash('sha256').update(String(token)).digest('hex'); }

async function create(orderId, type, user, ttlHours=168){
  if(!VALID_TYPES.has(type)) throw new Error('Tipo de firma inválido.');
  const token=crypto.randomBytes(32).toString('base64url');
  const tokenHash=hashToken(token);
  const expiresAt=new Date(Date.now()+ttlHours*60*60*1000);
  await db.query(`UPDATE service_signature_links SET revoked_at=NOW() WHERE order_id=$1 AND signature_type=$2 AND used_at IS NULL AND revoked_at IS NULL`,[orderId,type]);
  await db.query(`INSERT INTO service_signature_links(order_id,signature_type,token_hash,created_by,expires_at) VALUES($1,$2,$3,$4,$5)`,[orderId,type,tokenHash,user?.id||null,expiresAt]);
  return {token,expiresAt};
}
async function findValid(token){
  const {rows}=await db.query(`SELECT * FROM service_signature_links WHERE token_hash=$1 LIMIT 1`,[hashToken(token)]);
  const r=rows[0]; if(!r)return null;
  const valid=!r.used_at&&!r.revoked_at&&new Date(r.expires_at)>new Date();
  return valid ? r : null;
}
async function markUsed(id){await db.query(`UPDATE service_signature_links SET used_at=NOW() WHERE id=$1 AND used_at IS NULL`,[id]);}
module.exports={create,findValid,markUsed,VALID_TYPES};
