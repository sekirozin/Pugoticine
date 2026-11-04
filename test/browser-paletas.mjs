// PQA-283: Temas Pugotilab (Lima #C8FF00 e Laranja #D97706) no menu da conta: duas opções, troca na hora, salva na
// conta (PATCH /auth/api/preferences {palette}) e persiste ao recarregar. Teste original do Codex em
// Codex/Projetos/pugotilab-temas-20261104/test/menu-paletas.mjs.
// Rodar: node test/browser-paletas.mjs (Pugoticine em http://127.0.0.1:3017)
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import pw from '/home/sekironote/IA/Ferramentas/pugotiread-app-deps/node_modules/playwright/index.js';
const base='http://127.0.0.1:3017';
const browser=await pw.chromium.launch({executablePath:'/usr/bin/chromium'});
try{
 const context=await browser.newContext();
 await context.addCookies([{name:'pugotilab_session',value:'dev-sekiro',url:base}]);
 await context.route(`${base}/pugoti-conta.js*`,async r=>r.fulfill({contentType:'text/javascript',body:await fs.readFile('/home/sekironote/IA/Codex/Projetos/pugotilab-temas-20261104/conta/pugoti-conta.js')}));
 await context.route(`${base}/temas.css*`,async r=>r.fulfill({contentType:'text/css',body:await fs.readFile('/home/sekironote/IA/Fontes/Pugoticine/public/temas.css')}));
 let palette='lima';
 await context.route('https://pugotilab.com/auth/api/session',r=>r.fulfill({json:{profile:{username:'sekiro',displayName:'Sekiro',role:'admin',preferences:{theme:'escuro',palette}}},headers:{'access-control-allow-origin':base,'access-control-allow-credentials':'true'}}));
 await context.route('https://pugotilab.com/auth/api/preferences',async r=>{const body=r.request().postDataJSON();palette=body.preferences.palette;await r.fulfill({json:{preferences:{theme:'escuro',palette}},headers:{'access-control-allow-origin':base,'access-control-allow-credentials':'true'}});});
 const p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(String(e)));await p.goto(base);await p.waitForSelector('pugoti-conta .pc-gatilho');await p.locator('pugoti-conta .pc-gatilho').click();
 assert.equal(await p.locator('[data-paleta]').count(),2);
 await p.locator('[data-paleta="laranja"]').click();
 assert.equal(await p.evaluate(()=>document.documentElement.dataset.pugotiPaleta),'laranja');
 assert.equal(palette,'laranja');
 assert.equal(await p.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--primary').trim()),'#d97706');
 await p.reload();await p.waitForSelector('pugoti-conta .pc-gatilho');
 assert.equal(await p.evaluate(()=>document.documentElement.dataset.pugotiPaleta),'laranja');
 await p.locator('pugoti-conta .pc-gatilho').click();await p.locator('[data-paleta="lima"]').click();
 assert.equal(await p.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--primary').trim()),'#c8ff00');
 assert.deepEqual(errors,[]);console.log('Lima/Laranja: menu, troca e persistência local OK');
}finally{await browser.close();}
