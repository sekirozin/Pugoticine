// PQA-270/271: paleta Lima é única e padrão; perfil sem seletores; visual móvel sem overflow.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import pw from '/home/sekironote/IA/Ferramentas/pugotiread-app-deps/node_modules/playwright/index.js';
const base=process.env.PUGOTICINE_URL||'http://127.0.0.1:3012';
const dir=process.env.PUGOTICINE_FRONTEND;
const browser=await pw.chromium.launch({executablePath:'/usr/bin/chromium'});
try{
 for(const size of [{width:1440,height:900},{width:390,height:844}]){
  const context=await browser.newContext({viewport:size});
  await context.addCookies([{name:'pugotilab_session',value:'dev-sekiro',url:base}]);
  if(dir)await context.route(`${base}/**`,async route=>{const name=new URL(route.request().url()).pathname.slice(1)||'index.html';if(name.includes('/')||!/\.(html|css|js|svg)$/.test(name))return route.continue();try{await route.fulfill({body:await fs.readFile(path.join(dir,name)),contentType:name.endsWith('.css')?'text/css':name.endsWith('.js')?'text/javascript':name.endsWith('.svg')?'image/svg+xml':'text/html'});}catch{return route.continue();}});
  await context.addInitScript(()=>{localStorage.setItem('pugoticine:tema','4');localStorage.setItem('pugoticine:modo','claro');});
  const p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(String(e)));await p.goto(base);await p.waitForSelector('.titulo');
  await p.locator('#profile-button').click();
  assert.equal(await p.locator('#tema-seletor,#modo-seletor').count(),0);
  const state=await p.evaluate(()=>({bg:getComputedStyle(document.body).backgroundColor,text:getComputedStyle(document.body).color,primary:getComputedStyle(document.documentElement).getPropertyValue('--primary').trim(),tema:document.documentElement.dataset.tema,modo:document.documentElement.dataset.modo,storage:[localStorage.getItem('pugoticine:tema'),localStorage.getItem('pugoticine:modo')],width:document.documentElement.scrollWidth}));
  assert.deepEqual([state.bg,state.text,state.primary,state.tema,state.modo,state.storage],['rgb(16, 16, 16)','rgb(255, 255, 255)','#c8ff00','2','escuro',[null,null]]);
  assert.ok(state.width<=size.width,`overflow ${size.width}: ${state.width}`);assert.deepEqual(errors,[]);await context.close();
 }
 console.log('PQA-270/271: Lima padrão em desktop/celular, preferências antigas removidas');
}finally{await browser.close();}
