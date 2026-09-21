const express = require('express');
const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const auth = require('../security/auth');

const router = express.Router();
const uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
const rawImage = express.raw({ type: ['image/jpeg','image/png','image/webp'], limit: '5mb' });

function detectImage(buffer) {
  if (buffer?.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
  if (buffer?.length >= 8 && buffer.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))) return 'png';
  if (buffer?.length >= 12 && buffer.subarray(0,4).toString() === 'RIFF' && buffer.subarray(8,12).toString() === 'WEBP') return 'webp';
  return null;
}

router.post('/admin/uploads/:kind', auth.requireAdmin, auth.requireSameOrigin, rawImage, async (req,res,next) => {
  try {
    const folder = req.params.kind === 'banner' ? 'banners' : req.params.kind === 'product' ? 'products' : null;
    if (!folder) return res.status(404).json({error:'Tipo de carga inválido.'});
    const ext = detectImage(req.body);
    if (!ext) return res.status(400).json({error:'Solo se permiten imágenes JPG, PNG o WebP.'});
    const target = path.join(uploadDir, folder);
    await fs.mkdir(target,{recursive:true});
    const name = `${Date.now()}-${crypto.randomUUID()}.${ext}`;
    await fs.writeFile(path.join(target,name), req.body, {flag:'wx'});
    res.status(201).json({url:`/uploads/${folder}/${name}`});
  } catch(err){ next(err); }
});

module.exports = { router, uploadDir };
