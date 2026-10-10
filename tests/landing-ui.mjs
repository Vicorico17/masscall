import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:390,height:844}});
let calls=0,status='ringing',payload;const errors=[];page.on('pageerror',error=>errors.push(error.message));
try{
 await page.route('**/api/**',async route=>{
  const req=route.request(),url=new URL(req.url()),action=url.searchParams.get('action');let data={enabled:false};
  if(url.pathname==='/api/telephony'){
   if(req.headers().authorization!=='Bearer test-token-at-least-24-characters')return route.fulfill({status:401,json:{error:'Unauthorized'}});
   if(action==='numbers')data={incoming_phone_numbers:[{phone_number:'+40210000104'}]};
   if(action==='call'){calls++;payload=req.postDataJSON();data={sid:'CA'+'a'.repeat(32),status}}
   if(action==='hangup')status='completed';
   if(action==='hangup'||action==='call-status')data={status};
  }
  await route.fulfill({json:data});
 });
 await page.goto('http://localhost:3000/');await page.locator('#workspace-test').waitFor();
 const button=await page.locator('#workspace-test button').boundingBox();assert.ok(button.y+button.height<844,'Call button visible without scrolling on mobile');
 await page.locator('#test-phone').fill('0735 555 123');await page.locator('#test-token').fill('wrong-token-at-least-24-characters');await page.locator('#test-consent').check();await page.locator('#workspace-test button').click();await page.getByText('Codul de acces este invalid. Folosește codul centrului de apeluri.').waitFor();assert.equal(calls,0);
 await page.locator('#test-token').fill('test-token-at-least-24-characters');await page.locator('#workspace-test button').click();await page.getByText('Telefonul sună',{exact:true}).waitFor();assert.equal(calls,1);assert.equal(payload.to,'+40735555123');assert.equal(payload.agent.language,'Romanian');assert.equal(payload.recordingConsent,true);assert.ok(payload.callPlan.completionTrigger);
 await page.locator('#workspace-hangup').click();await page.getByText('Apel încheiat',{exact:true}).waitFor();await page.locator('#workspace-retry').click();assert.equal(await page.locator('#test-phone').inputValue(),'0735 555 123');assert.equal(calls,1);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);
 await mkdir('output/playwright',{recursive:true});await page.locator('#test-token').fill('');await page.screenshot({path:'output/playwright/landing-test-mobile.png',fullPage:false});
 console.log('PASS: first-screen mobile call, authentication failure, call payload, hangup, repeat test without resetting phone.');
}finally{await browser.close()}
