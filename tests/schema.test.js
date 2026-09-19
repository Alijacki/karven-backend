import test from 'node:test';
import assert from 'node:assert/strict';
import { recordSchema, settingsSchema } from '../src/schema.js';

test('record schema accepts KARVEN record', () => {
  const parsed = recordSchema.parse({ kind:'customer', title:'Acme', status:'active' });
  assert.equal(parsed.kind, 'customer');
  assert.equal(parsed.title, 'Acme');
});

test('settings normalize currency', () => {
  const parsed = settingsSchema.parse({ brandName:'KARVEN', defaultCurrency:'usd' });
  assert.equal(parsed.defaultCurrency, 'USD');
});
