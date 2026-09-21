const syscom = require('../connectors/syscom');
const ctonline = require('../connectors/ctonline');
const tvc = require('../connectors/tvc');
const pricing = require('./pricingService');
const productsStore = require('../data/productsStore');
const promotionService = require('./promotionService');
const PROVIDERS = { syscom, ctonline, tvc };
const TEST_PRODUCT = {id:'local-PAGO-5',source:'local',sku:'PAGO-5',name:'Producto de prueba - Pago $5',brand:'CEDIA',category:'Pruebas',cost:5,price:5,currency:'MXN',stock:1000,images:['https://picsum.photos/seed/cedia-pago-5/600/600'],description:'Producto temporal para realizar pruebas de pago de Mercado Pago por $5 MXN.'};
const cache=new Map(); const TTL_MS=5*60*1000;
async function fetchFromProvider(name,query){const k=`${name}:${query||''}`;const c=cache.get(k);if(c&&Date.now()-c.ts<TTL_MS)return c.data;try{const data=await PROVIDERS[name].fetchProducts({query});cache.set(k,{data,ts:Date.now()});return data;}catch(err){console.error(`[catalogService] error trayendo catalogo de ${name}:`,err.message);return [];}}
async function withFinalPrice(product,isDistributor){return {id:`${product.source}-${product.sku}`,...product,price:await pricing.applyMarkup(product.cost,product.source,isDistributor)};}
async function prepareManual(p,isDistributor){const price=isDistributor&&p.distributorPrice!=null?p.distributorPrice:p.publicPrice;return {...p,price:Number(price),source:'cedia'};}
async function getCatalog({query,source,category,isDistributor=false}={}){
  let items=[];
  if(!source||source==='cedia'){const manual=await productsStore.list({activeOnly:true});items.push(...await Promise.all(manual.map(p=>prepareManual(p,isDistributor))));}
  if(!source||source!=='cedia'){
    const sources=source?[source]:Object.keys(PROVIDERS);
    const valid=sources.filter(s=>PROVIDERS[s]);
    const results=await Promise.all(valid.map(s=>fetchFromProvider(s,query)));
    items.push(...await Promise.all(results.flat().map(p=>withFinalPrice(p,isDistributor))));
  }
  items.unshift({...TEST_PRODUCT});
  if(query){const q=query.toLowerCase();items=items.filter(p=>[p.name,p.brand,p.sku,p.description].some(v=>String(v||'').toLowerCase().includes(q)));}
  if(category)items=items.filter(p=>(p.category||'').toLowerCase()===category.toLowerCase());
  return Promise.all(items.map(p=>promotionService.applyPromotion(p,isDistributor)));
}
async function getProductById(id,isDistributor=false){let product;if(id===TEST_PRODUCT.id)product={...TEST_PRODUCT};else if(String(id).startsWith('cedia-')){const p=await productsStore.findById(id);product=p&&p.active?await prepareManual(p,isDistributor):null;}else{const [source,...parts]=id.split('-');const sku=parts.join('-');if(!PROVIDERS[source])return null;const items=await fetchFromProvider(source);const found=items.find(p=>p.sku===sku);product=found?await withFinalPrice(found,isDistributor):null;}return product?promotionService.applyPromotion(product,isDistributor):null;}
function clearCache(){cache.clear();}
module.exports={getCatalog,getProductById,clearCache};
