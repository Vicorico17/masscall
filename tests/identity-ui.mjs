import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[];page.on('pageerror',error=>errors.push(error.message));
try{
 await page.goto('http://localhost:3000/dashboard#numbers');
 for(let i=0;i<2;i++){await page.getByRole('button',{name:'Choose ↗',exact:true}).first().click();await page.getByRole('button',{name:'Add preview number'}).click()}
 await page.locator('[data-identity]').first().click();
 const firstKey=await page.locator('#identity-number').inputValue();assert.ok(firstKey.startsWith('+40'));
 await page.locator('#agent-name').fill('Elena');
 await page.locator('#company-name').fill('Atelier SRL');
 await page.locator('#agent-goal').fill('Confirmă programarea de mâine.');
 await page.locator('#introduction').fill('Sunt {agent_name}, asistentul AI de la {company_name}.');
 await page.locator('#voice').selectOption('cedar');
 await page.getByRole('button',{name:'Salvează agentul'}).click();
 await page.locator('#identity-number').selectOption({index:2});
 assert.notEqual(await page.locator('#identity-number').inputValue(),firstKey);
 assert.equal(await page.locator('#agent-name').inputValue(),'Andreea');
 await page.locator('#agent-name').fill('Mihai');
 await page.getByRole('button',{name:'Salvează agentul'}).click();
 await page.locator('#identity-number').selectOption(firstKey);
 assert.equal(await page.locator('#agent-name').inputValue(),'Elena');
 assert.equal(await page.locator('#voice').inputValue(),'cedar');
 assert.equal(await page.locator('#agent-goal').inputValue(),'Confirmă programarea de mâine.');
 await page.reload();
 await page.locator('#identity-number').selectOption(firstKey);
 assert.equal(await page.locator('#agent-name').inputValue(),'Elena');
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);
 console.log('PASS: per-number goals, presentation, voice choice, persistence and mobile layout');
}finally{await browser.close()}
