function clean(v=''){
  return String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^\x20-\x7E]/g,' ');
}
function wrap(text, max=88){
  const words=clean(text).split(/\s+/).filter(Boolean), lines=[]; let line='';
  for(const w of words){
    if((line+' '+w).trim().length>max){ if(line) lines.push(line); line=w; } else line=(line+' '+w).trim();
  }
  if(line) lines.push(line);
  return lines.length?lines:['-'];
}
function escPdf(s){ return clean(s).replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)'); }
function yn(v){ return v ? 'Si' : 'No'; }
function money(v){ return '$' + Number(v||0).toFixed(2) + ' MXN'; }
function signatureLine(label,sig){
  if(!sig) return `${label}: Pendiente`;
  const when=sig.signedAt?new Date(sig.signedAt).toLocaleString('es-MX'):'';
  return `${label}: Firmado por ${sig.signedBy||'Cliente'} (${sig.method==='remote'?'remota':'presencial'}) ${when}`;
}
function build(order){
  const lines=[];
  const add=(label,value='')=>{
    if(label) lines.push({text:label,bold:true});
    for(const l of wrap(value,92)) lines.push({text:l,bold:false});
  };
  lines.push({text:'FIXNBYTE / GRUPO CEDIA',bold:true,size:17});
  lines.push({text:'ORDEN DE SERVICIO TECNICO',bold:true,size:13});
  lines.push({text:`Folio: ${order.id}`,bold:true});
  lines.push({text:`Fecha: ${new Date(order.createdAt).toLocaleString('es-MX')}`});
  lines.push({text:`Estado: ${String(order.status||'').replaceAll('_',' ')}`});
  lines.push({text:'',gap:true});
  add('CLIENTE', `${order.customer?.name||''} | Tel. ${order.customer?.phone||''} | ${order.customer?.email||''}`);
  add('EQUIPO', `${order.equipment?.type||''} ${order.equipment?.brandModel||''} | S/N o IMEI: ${order.equipment?.serial||'No registrado'}`);
  add('FALLA REPORTADA', order.intake?.reportedFault||'');
  add('OBSERVACIONES TECNICAS', order.intake?.techNotes||'');
  add('RESPALDO', order.intake?.backup||'');
  add('PRESUPUESTO INICIAL', money(order.intake?.initialBudget));
  lines.push({text:'',gap:true});
  lines.push({text:'CHECKLIST DE RECEPCION',bold:true,size:12});
  [
    ['Pantalla con observaciones',order.physicalCheck?.screen],
    ['Carcasa con golpes/rayones',order.physicalCheck?.caseDamage],
    ['Puertos con observaciones',order.physicalCheck?.ports],
    ['Humedad detectada',order.physicalCheck?.humidity],
    ['Botones con observaciones',order.physicalCheck?.buttons],
  ].forEach(([k,v])=>lines.push({text:`${k}: ${yn(v)}`}));
  add('Observaciones fisicas',order.physicalCheck?.notes||'');
  [
    ['Enciende',order.functionCheck?.powersOn],['Imagen OK',order.functionCheck?.imageOk],
    ['Tactil/teclado OK',order.functionCheck?.inputOk],['Camaras OK',order.functionCheck?.camerasOk],
    ['Audio OK',order.functionCheck?.audioOk],['Wi-Fi/conectividad OK',order.functionCheck?.wifiOk]
  ].forEach(([k,v])=>lines.push({text:`${k}: ${yn(v)}`}));
  const acc=[];
  if(order.accessories?.charger) acc.push('Cargador');
  if(order.accessories?.caseProtector) acc.push('Funda/protector');
  if(order.accessories?.simSd) acc.push('SIM/Micro SD');
  if(order.accessories?.box) acc.push('Caja original');
  if(order.accessories?.other) acc.push(order.accessories.other);
  add('ACCESORIOS',acc.join(', ')||'Sin accesorios registrados');
  if(order.diagnosis?.text) add('DIAGNOSTICO',order.diagnosis.text);
  if(order.repair?.text) add('TRABAJO / PRESUPUESTO',order.repair.text);
  if(order.delivery?.notes) add('ENTREGA / OBSERVACIONES',order.delivery.notes);
  lines.push({text:'',gap:true});
  lines.push({text:'FIRMAS Y CONFORMIDAD',bold:true,size:12});
  const sig=order.signatures||{};
  lines.push({text:signatureLine('Recepcion / aceptacion',sig.reception)});
  lines.push({text:signatureLine('Autorizacion',sig.authorization)});
  lines.push({text:signatureLine('Entrega',sig.delivery)});
  lines.push({text:'',gap:true});
  lines.push({text:'Documento generado desde el expediente digital de FixnByte. Las firmas originales permanecen almacenadas en la orden electronica.'});
  return makePdf(lines);
}
function makePdf(lines){
  const pageW=612,pageH=792,left=46,top=748,bottom=46,lineH=14;
  const pages=[]; let page=[],y=top;
  for(const item of lines){
    const size=item.size||10;
    const needed=item.gap?10:(size>=16?24:size>=12?19:lineH);
    if(y-needed<bottom){ pages.push(page); page=[]; y=top; }
    if(item.gap){ y-=10; continue; }
    page.push({...item,y}); y-=needed;
  }
  if(page.length||!pages.length) pages.push(page);
  const objs=[null];
  const addObj=(buf)=>{objs.push(Buffer.isBuffer(buf)?buf:Buffer.from(buf,'latin1')); return objs.length-1;};
  const fontReg=addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const fontBold=addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
  const pagesObj=addObj(''); const pageIds=[];
  for(const pg of pages){
    let content='BT\n';
    for(const item of pg){
      const font=item.bold?'F2':'F1', size=item.size||10;
      content += `/${font} ${size} Tf\n1 0 0 1 ${left} ${item.y} Tm\n(${escPdf(item.text)}) Tj\n`;
    }
    content+='ET\n';
    const stream=Buffer.from(content,'latin1');
    const contentId=addObj(Buffer.concat([Buffer.from(`<< /Length ${stream.length} >>\nstream\n`,'latin1'),stream,Buffer.from('\nendstream','latin1')]));
    const pageId=addObj(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /Font << /F1 ${fontReg} 0 R /F2 ${fontBold} 0 R >> >> /Contents ${contentId} 0 R >>`);
    pageIds.push(pageId);
  }
  objs[pagesObj]=Buffer.from(`<< /Type /Pages /Kids [${pageIds.map(id=>`${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`,'latin1');
  const catalog=addObj(`<< /Type /Catalog /Pages ${pagesObj} 0 R >>`);
  let parts=[Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n','binary')], offsets=[0], pos=parts[0].length;
  for(let i=1;i<objs.length;i++){
    offsets[i]=pos;
    const head=Buffer.from(`${i} 0 obj\n`,'latin1'), tail=Buffer.from('\nendobj\n','latin1');
    parts.push(head,objs[i],tail); pos+=head.length+objs[i].length+tail.length;
  }
  const xrefPos=pos;
  let xref=`xref\n0 ${objs.length}\n0000000000 65535 f \n`;
  for(let i=1;i<objs.length;i++) xref+=String(offsets[i]).padStart(10,'0')+' 00000 n \n';
  xref+=`trailer\n<< /Size ${objs.length} /Root ${catalog} 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
  parts.push(Buffer.from(xref,'latin1'));
  return Buffer.concat(parts);
}
module.exports={build};
