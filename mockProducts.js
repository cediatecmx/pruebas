// Catalogo de muestra por proveedor. Se usa solo mientras ese proveedor
// no tenga credenciales reales configuradas en el archivo .env
// (ver src/config.js -> enabled). En cuanto agregues las credenciales,
// el conector correspondiente empieza a traer productos reales en vivo.

const syscom = [
  {
    sku: 'SYS-CAM-4520',
    name: 'Camara IP domo 4MP vision nocturna exterior',
    brand: 'Hikvision',
    category: 'Videovigilancia',
    cost: 1180.5,
    currency: 'MXN',
    stock: 34,
    images: ['https://picsum.photos/seed/syscam1/600/600'],
    description: 'Camara tipo domo 4 megapixeles con IR de 30m, IP67, para exterior.',
  },
  {
    sku: 'SYS-SW-2408',
    name: 'Switch administrable 24 puertos Gigabit',
    brand: 'TP-Link',
    category: 'Redes',
    cost: 2450,
    currency: 'MXN',
    stock: 12,
    images: ['https://picsum.photos/seed/sysswitch/600/600'],
    description: 'Switch L2+ administrable con 24 puertos Gigabit y 4 SFP.',
  },
  {
    sku: 'SYS-NAS-2BAY',
    name: 'NAS 2 bahias para respaldo y videovigilancia',
    brand: 'Synology',
    category: 'Almacenamiento',
    cost: 3890,
    currency: 'MXN',
    stock: 8,
    images: ['https://picsum.photos/seed/sysnas/600/600'],
    description: 'Servidor NAS de 2 bahias, ideal para respaldo de PYMES.',
  },
];

const ctonline = [
  {
    sku: 'CT-LAP-I5-8G',
    name: 'Laptop Core i5 8GB RAM 256GB SSD 15.6"',
    brand: 'HP',
    category: 'Computo',
    cost: 10990,
    currency: 'MXN',
    stock: 6,
    images: ['https://picsum.photos/seed/ctlaptop/600/600'],
    description: 'Laptop para oficina, procesador Core i5, 8GB RAM, SSD 256GB.',
  },
  {
    sku: 'CT-MON-24-IPS',
    name: 'Monitor 24" IPS Full HD',
    brand: 'LG',
    category: 'Monitores',
    cost: 2190,
    currency: 'MXN',
    stock: 20,
    images: ['https://picsum.photos/seed/ctmonitor/600/600'],
    description: 'Monitor IPS de 24 pulgadas, resolucion 1920x1080, HDMI/VGA.',
  },
  {
    sku: 'CT-UPS-1500',
    name: 'No break UPS 1500VA',
    brand: 'APC',
    category: 'Energia',
    cost: 2650,
    currency: 'MXN',
    stock: 15,
    images: ['https://picsum.photos/seed/ctups/600/600'],
    description: 'UPS de 1500VA/900W con 8 contactos y proteccion de linea.',
  },
];

const tvc = [
  {
    sku: 'TVC-IMP-L3250',
    name: 'Impresora multifuncional laser monocromatica',
    brand: 'Brother',
    category: 'Impresion',
    cost: 3290,
    currency: 'MXN',
    stock: 10,
    images: ['https://picsum.photos/seed/tvcimpresora/600/600'],
    description: 'Multifuncional laser B/N: imprime, escanea y copia.',
  },
  {
    sku: 'TVC-TEL-A15',
    name: 'Smartphone 128GB 6.5" camara triple',
    brand: 'Samsung',
    category: 'Telefonia',
    cost: 4790,
    currency: 'MXN',
    stock: 18,
    images: ['https://picsum.photos/seed/tvctel/600/600'],
    description: 'Smartphone gama media, 128GB, pantalla de 6.5 pulgadas.',
  },
  {
    sku: 'TVC-AUD-BT01',
    name: 'Audifonos inalambricos Bluetooth con estuche',
    brand: 'JBL',
    category: 'Audio',
    cost: 690,
    currency: 'MXN',
    stock: 40,
    images: ['https://picsum.photos/seed/tvcaudio/600/600'],
    description: 'Audifonos in-ear Bluetooth 5.0, hasta 20h de bateria con estuche.',
  },
];

module.exports = { syscom, ctonline, tvc };
