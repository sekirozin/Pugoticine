// PQA-272: oito combinações de paleta e aparência, persistência e fundo comum no modo escuro.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import pw from '/home/sekironote/IA/Ferramentas/pugotiread-app-deps/node_modules/playwright/index.js';
const base=process.env.PUGOTICINE_URL||'http://127.0.0.1:3012';
const frontend=process.env.PUGOTICINE_FRONTEND;
const browser=await pw.chromium.launch({executablePath:'/usr/bin/chromium'});
try {
 const ctx=await browser.newContext({viewport:{width:1440,height:900}});
 await ctx.addCookies([{name:'pugotilab_session',value:'dev-sekiro',url:base}]);
 if(frontend) await ctx.route(`${base}/**`,async route=>{
  const name=new URL(route.request().url()).pathname.slice(1)||'index.html';
  if(name.includes('/')||!/\.(html|css|js|svg)$/.test(name))return route.continue();
  try {await route.fulfill({body:await fs.readFile(path.join(frontend,name)),contentType:name.endsWith('.css')?'text/css':name.endsWith('.js')?'text/javascript':name.endsWith('.svg')?'image/svg+xml':'text/html'});}catch{return route.continue();}
 });
 const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(base);await page.waitForSelector('.titulo');await page.locator('#profile-button').click();
 for(const modo of ['escuro','claro'])for(const tema of ['1','2','3','4']){
  await page.locator('#modo-seletor').selectOption(modo);
  await page.locator('#tema-seletor').selectOption(tema);
  const state=await page.evaluate(()=>({modo:document.documentElement.dataset.modo,tema:document.documentElement.dataset.tema,body:getComputedStyle(document.body).backgroundColor,accent:getComputedStyle(document.documentElement).getPropertyValue('--primary').trim(),meta:document.querySelector('meta[name="theme-color"]').content}));
  assert.equal(state.modo,modo);assert.equal(state.tema,tema);
  assert.equal(state.body,modo==='escuro'?'rgb(16, 16, 16)':'rgb(245, 245, 245)');
  assert.equal(state.meta,modo==='escuro'?'#101010':'#f5f5f5');
  assert.equal(state.accent,({1:'#263dbb',2:'#c8ff00',3:'#ff5825',4:'#ff606a'})[tema]);
  await page.reload();await page.waitForSelector('.titulo');
  assert.deepEqual(await page.evaluate(()=>[document.documentElement.dataset.modo,document.documentElement.dataset.tema]),[modo,tema]);
  await page.locator('#profile-button').click();
 }
 assert.deepEqual(errors,[]);
 console.log('PQA-272: oito combinações, fundo, destaque e persistência OK');
}finally{await browser.close();}
