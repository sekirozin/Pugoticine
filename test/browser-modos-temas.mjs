// PQA-272: decisão substituída; a preferência antiga de modo claro não afeta a paleta Lima fixa.
import assert from 'node:assert/strict';
import pw from '/home/sekironote/IA/Ferramentas/pugotiread-app-deps/node_modules/playwright/index.js';
const browser=await pw.chromium.launch({executablePath:'/usr/bin/chromium'});
try{
 const page=await browser.newPage();
 await page.goto(process.env.PUGOTICINE_URL||'http://127.0.0.1:3012');
 const css=await page.evaluate(()=>({modo:document.documentElement.dataset.modo,tema:document.documentElement.dataset.tema,fundo:getComputedStyle(document.body).backgroundColor}));
 assert.deepEqual(css,{modo:'escuro',tema:'2',fundo:'rgb(16, 16, 16)'});
 console.log('PQA-272: modo antigo substituído por Lima padrão');
}finally{await browser.close();}
