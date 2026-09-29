import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));

try {
  await page.goto('http://localhost:3000/');
  await page.locator('#demo-form').waitFor();
  assert.equal(await page.locator('a.nav-cta').getAttribute('href'), '/dashboard#agent');

  await page.goto('http://localhost:3000/dashboard#agent');
  await page.getByLabel('Workspace access token').waitFor();
  assert.equal(await page.getByRole('heading', { name: 'Masscall call center' }).count(), 1);
  assert.equal(await page.getByRole('button', { name: 'Close dialog' }).count(), 0);

  await page.getByLabel('Workspace access token').fill('invalid-workspace-token-12345');
  await page.getByRole('button', { name: 'Connect workspace' }).click();
  await page.getByText('Workspace authentication required.').waitFor();

  await page.goto('http://localhost:3000/studio');
  assert.equal(new URL(page.url()).pathname, '/dashboard');
  await page.getByLabel('Workspace access token').waitFor();

  await page.goto('http://localhost:3000/demo.html');
  assert.equal(new URL(page.url()).pathname, '/');
  await page.locator('#demo-form').waitFor();
  assert.deepEqual(errors, []);
  console.log('PASS: the site has one public test-call landing page and one consistently authenticated call center');
} finally {
  await browser.close();
}
