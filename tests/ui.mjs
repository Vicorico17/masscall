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

  const numbers = [
    { phone_number: '+14155550104', friendly_name: 'Main line' },
    { phone_number: '+1 (415) 555-0104', friendly_name: 'Duplicate main line' }
  ];
  await page.route('**/api/telephony?action=numbers', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ incoming_phone_numbers: numbers })
  }));
  await page.route('**/api/telephony?action=calls', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ calls: [] })
  }));
  await page.route('**/api/telephony?action=rename-number', async route => {
    const body = route.request().postDataJSON();
    assert.equal(body.friendlyName, 'Support line');
    numbers[0].friendly_name = body.friendlyName;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sid: numbers[0].sid, friendly_name: body.friendlyName }) });
  });
  numbers[0].sid = `PN${'a'.repeat(32)}`;
  numbers[1].sid = `PN${'b'.repeat(32)}`;
  await page.goto('http://localhost:3000/dashboard');
  await page.getByLabel('Workspace access token').fill('valid-test-workspace-token-123');
  await page.getByRole('button', { name: 'Connect workspace' }).click();
  await page.getByRole('heading', { name: 'Your call center' }).waitFor();
  assert.equal(await page.locator('#real-from option').count(), 2); // placeholder plus one unique number
  await page.getByLabel('Twilio number name').fill('Support line');
  await page.getByRole('button', { name: 'Save number name' }).click();
  await page.locator('#real-from option').filter({ hasText: 'Support line' }).waitFor();
  await page.getByRole('button', { name: 'Edit this number’s agent' }).click();
  await page.getByRole('button', { name: 'Agent', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
  assert.equal(await page.locator('.live-workspace-tabs button.active').innerText(), 'Dashboard');
  await page.waitForFunction(() => {
    const rect = document.querySelector('#real-call-card').getBoundingClientRect();
    return rect.top < innerHeight && rect.bottom > 0;
  });

  await page.goto('http://localhost:3000/demo.html');
  assert.equal(new URL(page.url()).pathname, '/');
  await page.locator('#demo-form').waitFor();
  assert.deepEqual(errors, []);
  console.log('PASS: landing, authenticated dashboard navigation, unique Twilio numbers, and legacy URL redirects');
} finally {
  await browser.close();
}
