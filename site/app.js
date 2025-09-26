const app = document.getElementById('app');
const tpl = document.getElementById('card-tpl');

const state = { fonts: [], filtered: [] };

async function fetchFonts(){
  const res = await fetch('/api/fonts');
  if(!res.ok){ throw new Error('API failed'); }
  const data = await res.json();
  state.fonts = data.families || [];
  state.filtered = state.fonts;
  render();
}

function render(){
  app.innerHTML = '';
  state.filtered.forEach(fam => {
    const node = tpl.content.cloneNode(true);
    const h2 = node.querySelector('.family');
    h2.textContent = fam.family;
    const sample = document.createElement('div');
    sample.className = 'family-sample';
    sample.textContent = '云想衣裳花想容 ABC abc 1234';
    sample.style.fontFamily = `'${fam.family}', system-ui, sans-serif`;
    node.querySelector('.card').appendChild(sample);

    const variants = node.querySelector('.variants');
    fam.variants.forEach(v => {
      const badge = document.createElement('div');
      badge.className = 'badge';
      const weight = document.createElement('span');
      weight.textContent = v.style + ' ' + v.weight;
      badge.appendChild(weight);
      const links = document.createElement('span');
      links.className = 'meta';
      links.innerHTML = `&nbsp;·&nbsp;<a href="${v.woff2}" target="_blank">woff2</a>&nbsp;/&nbsp;<a href="${v.ttf}" target="_blank">ttf</a>`;
      badge.appendChild(links);
      variants.appendChild(badge);
    });

    const css2 = buildCss2Url(fam);
    const copyLinkBtn = node.querySelector('.copy-link');
    copyLinkBtn.addEventListener('click', () => {
      const s = `<link rel="preconnect" href="https://cdn.fonts.lzray.com" crossorigin>\n<link href="${css2}" rel="stylesheet">`;
      navigator.clipboard.writeText(s);
      copyLinkBtn.textContent = '已复制';
      setTimeout(()=>copyLinkBtn.textContent='复制 <link>', 1200);
    });

    const copyFaceBtn = node.querySelector('.copy-face');
    copyFaceBtn.addEventListener('click', () => {
      const s = fam.variants.map(v => `@font-face{font-family:'${fam.family}';font-style:${v.style};font-weight:${v.weight};font-display:swap;src:url('${v.woff2}') format('woff2');}`).join('\n');
      navigator.clipboard.writeText(s);
      copyFaceBtn.textContent = '已复制';
      setTimeout(()=>copyFaceBtn.textContent='@font-face', 1200);
    });

    app.appendChild(node);
  });
}

function buildCss2Url(fam){
  const weights = Array.from(new Set(fam.variants.filter(v=>v.style==='normal').map(v=>v.weight))).sort((a,b)=>a-b);
  const familyEnc = encodeURIComponent(fam.family).replace(/%20/g,'+');
  const axis = weights.length ? `:wght@${weights.join(';')}` : '';
  return `https://cdn.fonts.lzray.com/css2?family=${familyEnc}${axis}&display=swap`;
}

document.getElementById('q').addEventListener('input', (e) => {
  const q = e.target.value.trim().toLowerCase();
  if(!q){ state.filtered = state.fonts; render(); return; }
  state.filtered = state.fonts.filter(f => {
    if(f.family.toLowerCase().includes(q)) return true;
    return f.variants.some(v => (v.style + ' ' + v.weight).toLowerCase().includes(q));
  });
  render();
});

fetchFonts().catch(e => {
  app.innerHTML = '<p class="small">加载失败：' + e.message + '</p>';
});
