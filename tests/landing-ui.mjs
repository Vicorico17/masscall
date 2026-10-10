import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:390,height:844}});
let calls=0,starts=0;const errors=[];page.on('pageerror',error=>errors.push(error.message));
try{
 await page.route('**/api/**',async route=>{
  const req=route.request(),url=new URL(req.url()),action=url.searchParams.get('action');
  assert.equal(url.pathname,'/api/demo');assert.equal(req.headers().authorization,undefined);
  if(action==='config')return route.fulfill({json:{enabled:true,turnstileSiteKey:null,from:null}});
  const body=req.postDataJSON();assert.equal(body.phone,'+40735555123');assert.equal(body.consent,true);
  if(action==='start'){starts++;return route.fulfill({json:{status:'code-sent'}})}
  if(action==='call'){
   if(body.code!=='123456')return route.fulfill({status:400,json:{error:'Codul nu este corect sau a expirat.'}});
   calls++;return route.fulfill({status:201,json:{status:'queued',token:'t'.repeat(32)}});
  }
  throw new Error('Unexpected action '+action);
 });
 await page.goto('http://localhost:3000/');await page.locator('#start-button:enabled').waitFor();
 assert.equal(await page.locator('input[type=password]').count(),0);
 const button=await page.locator('#start-button').boundingBox();assert.ok(button.y+button.height<844,'Test button visible without scrolling on mobile');
 await page.locator('#phone').fill('0735 555 123');await page.locator('#consent').check();await page.locator('#start-button').click();await page.locator('#code-form').waitFor({timeout:3000});assert.equal(starts,1);assert.equal(calls,0);
 await page.locator('#code').fill('000000');await page.locator('#code-form .primary-button').click();await page.getByText('Codul nu este corect sau a expirat.').waitFor();assert.equal(calls,0);
 await page.locator('#code').fill('123456');await page.locator('#code-form .primary-button').click();await page.getByText('Te sunăm acum',{exact:true}).waitFor();assert.equal(calls,1);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);
 console.log('PASS: mobile test visible, no workspace code, SMS verification, wrong-code retry, call request without admin credentials.');
}catch(error){console.error('Page message:',await page.locator('#demo-message').textContent());console.error('Browser errors:',errors);throw error}finally{await browser.close()}
