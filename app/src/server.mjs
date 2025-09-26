import fastifyInit from 'fastify';
import path from 'node:path';
import fs from 'node:fs/promises';

const DATA_DIR = process.env.DATA_DIR || '/data';
const FONTS_DIR = path.join(DATA_DIR, 'fonts');
const CDN_BASE = process.env.CDN_BASE || 'https://cdn.fonts.lzray.com';
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS || 10_000);
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '127.0.0.1';

const fastify = fastifyInit({ logger: false });

let cache = { at: 0, families: [] };

// --- helpers ---

function norm(s){ return s.replace(/_/g,' ').trim(); }

function weightFromName(name){
  const n = name.toLowerCase();
  // numeric hints
  const mNum = n.match(/(?:^|[^\d])(100|200|300|400|500|600|700|800|900)(?:[^\d]|$)/);
  if(mNum){ return Number(mNum[1]); }
  // keywords
  const table = [
    [/thin|hairline/, 100],
    [/extra[-_\s]?light|ultra[-_\s]?light|xlight|xlite/, 200],
    [/(?:light|lite)/, 300],
    [/regular|book|normal|roman/, 400],
    [/medium|mdm/, 500],
    [/semi[-_\s]?bold|demi[-_\s]?bold|demibold/, 600],
    [/bold|bd/, 700],
    [/extra[-_\s]?bold|ultra[-_\s]?bold|heavy/, 800],
    [/black|extra[-_\s]?black|ultra[-_\s]?black/, 900],
  ];
  for(const [re, val] of table){
    if(re.test(n)) return val;
  }
  return 400;
}

function styleFromName(name){
  const n = name.toLowerCase();
  if (/(italic|ital|oblique|it)/.test(n)) return 'italic';
  return 'normal';
}

function sameStemPairs(files){
  // Pair .woff2 and .ttf with same stem (without extension)
  const stems = new Map();
  for(const f of files){
    const ext = path.extname(f).toLowerCase();
    if(ext !== '.woff2' && ext !== '.ttf') continue;
    const stem = f.slice(0, -ext.length);
    if(!stems.has(stem)) stems.set(stem, new Set());
    stems.get(stem).add(ext);
  }
  const pairs = [];
  for(const [stem, exts] of stems.entries()){
    pairs.push({ stem, hasWoff2: exts.has('.woff2'), hasTtf: exts.has('.ttf') });
  }
  return pairs;
}

async function scanOnce(){
  const families = [];
  try{
    const familyDirs = await fs.readdir(FONTS_DIR, { withFileTypes: true });
    for(const dirent of familyDirs){
      if(!dirent.isDirectory()) continue;
      const family = norm(dirent.name);
      const abs = path.join(FONTS_DIR, dirent.name);
      const files = (await fs.readdir(abs)).filter(f => f.endsWith('.woff2') || f.endsWith('.ttf'));
      if(files.length === 0) continue;

      const pairs = sameStemPairs(files).filter(p => p.hasWoff2 || p.hasTtf);
      const variants = [];
      for(const p of pairs){
        const baseName = p.stem;
        const weight = weightFromName(baseName);
        const style = styleFromName(baseName);
        const woff2 = p.hasWoff2 ? `${CDN_BASE}/fonts/${encodeURIComponent(dirent.name)}/${encodeURIComponent(baseName)}.woff2` : null;
        const ttf   = p.hasTtf   ? `${CDN_BASE}/fonts/${encodeURIComponent(dirent.name)}/${encodeURIComponent(baseName)}.ttf`   : null;
        variants.push({ basename: baseName, weight, style, woff2, ttf });
      }
      // sort by weight, normal first
      variants.sort((a,b)=> (a.style===b.style ? a.weight-b.weight : (a.style==='normal'? -1:1)));
      families.push({ family, dir: dirent.name, variants });
    }
    // sort families alpha
    families.sort((a,b)=> a.family.localeCompare(b.family, 'zh-Hans-CN'));
  }catch(e){
    // ignore
  }
  return families;
}

async function getIndex(){
  const now = Date.now();
  if (now - cache.at < CACHE_TTL_MS && cache.families.length) return cache;
  const families = await scanOnce();
  cache = { at: now, families };
  return cache;
}

// --- routes ---
fastify.get('/health', async ()=>({ ok: true }));

fastify.get('/api/fonts', async (req, reply) => {
  const idx = await getIndex();
  reply.header('Cache-Control', 'public, max-age=5');
  reply.header('Access-Control-Allow-Origin', '*');
  return { updatedAt: cache.at, families: idx.families };
});

// css2: like Google Fonts
fastify.get('/css2', async (req, reply) => {
  const url = new URL(req.url, 'http://x');
  const familiesQ = url.searchParams.getAll('family');
  const display = url.searchParams.get('display') || 'swap';

  const idx = await getIndex();
  const dirByName = new Map(idx.families.map(f => [f.family.toLowerCase(), f]));

  let css = '';
  for (const raw of familiesQ){
    const [nameRaw, axis] = raw.split(':');
    const familyName = decodeURIComponent(nameRaw.replace(/\+/g,' '));
    const fam = dirByName.get(familyName.toLowerCase());
    if(!fam) continue;
    let weights = null;
    if(axis && axis.startsWith('wght@')){
      weights = axis.slice('wght@'.length).split(';').map(s=>Number(s)).filter(Boolean);
    }
    const variants = fam.variants.filter(v => v.woff2);
    const pool = weights ? variants.filter(v => weights.includes(v.weight)) : variants;
    for (const v of pool){
      css += `@font-face{font-family:'${fam.family}';font-style:${v.style};font-weight:${v.weight};font-display:${display};src:url('${v.woff2}') format('woff2');}\n`;
    }
  }
  reply.header('Content-Type', 'text/css; charset=utf-8');
  reply.header('Cache-Control', 'public, max-age=86400');
  reply.header('Access-Control-Allow-Origin', '*');
  return css || '/* no fonts matched */';
});

// start
fastify.listen({ host: HOST, port: PORT }).then(()=>{
  console.log('fonts-api listening on http://' + HOST + ':' + PORT);
}).catch(err=>{
  console.error(err);
  process.exit(1);
});
