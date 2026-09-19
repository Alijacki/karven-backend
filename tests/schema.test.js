import test from 'node:test';
import assert from 'node:assert/strict';
import { registerSchema, companySchema, opportunitySchema, planSchema } from '../src/schema.js';
import { hashPassword, verifyPassword, hashToken } from '../src/security.js';

test('registration enforces a strong-enough password and valid email',()=>{
  assert.equal(registerSchema.safeParse({email:'a@example.com',password:'1234567890',fullName:'A',workspaceName:'KARVEN'}).success,true);
  assert.equal(registerSchema.safeParse({email:'bad',password:'short',fullName:'A',workspaceName:'KARVEN'}).success,false);
});

test('CRM schemas normalize core values',()=>{
  assert.equal(companySchema.parse({name:'Acme'}).domain,'');
  const o=opportunitySchema.parse({title:'Deal',currency:'usd'});
  assert.equal(o.currency,'USD');
  assert.equal(o.status,'open');
});

test('billing plan schema normalizes currency',()=>{
  const p=planSchema.parse({code:'pro',name:'Pro',priceCents:5000,currency:'usd',interval:'month'});
  assert.equal(p.currency,'USD');
});

test('password hashing verifies and token hashing is deterministic',async()=>{
  const h=await hashPassword('correct horse battery staple');
  assert.equal(await verifyPassword('correct horse battery staple',h),true);
  assert.equal(await verifyPassword('wrong password',h),false);
  assert.equal(hashToken('x'),hashToken('x'));
});
