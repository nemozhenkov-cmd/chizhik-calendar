import test from 'node:test';
import assert from 'node:assert/strict';
import {moscowDate,addDays,monthCells,rangeFor,validateOffer} from '../src/dates.mjs';
test('Moscow rolls date at 21:00 UTC',()=>{assert.equal(moscowDate(new Date('2026-10-24T21:00:00Z')),'2026-10-25');assert.equal(moscowDate(new Date('2026-10-24T20:59:59Z')),'2026-10-24');});
test('calendar Monday first, including month edges',()=>{const cells=monthCells('2026-10');assert.equal(cells[0],'2026-09-28');assert.equal(cells.at(-1),'2026-11-01');assert.equal(cells.length,35);assert.equal(cells.filter(x=>x.startsWith('2026-10')).length,31);});
test('leap day and year boundary',()=>{assert.equal(addDays('2028-02-28',1),'2028-02-29');assert.equal(addDays('2026-12-31',1),'2027-01-01');});
test('statistics ranges use calendar week and month',()=>{assert.deepEqual(rangeFor('week','2026-11-01'),['2026-10-26','2026-11-01']);assert.deepEqual(rangeFor('month','2028-02-15'),['2028-02-01','2028-02-29']);assert.deepEqual(rangeFor('day','2026-10-25'),['2026-10-25','2026-10-25']);});
test('offer validation rejects missing photo, fractional discount and outside date',()=>{const p={starts_on:'2026-11-01',ends_on:'2026-11-15'},o={name:'Тан FOODFEST',image_path:'brand/sample-tan.jpg',sale_date:'2026-11-01',discount:20};assert.doesNotThrow(()=>validateOffer(o,p));assert.throws(()=>validateOffer({...o,image_path:''},p));assert.throws(()=>validateOffer({...o,discount:20.5},p));assert.throws(()=>validateOffer({...o,sale_date:'2026-11-16'},p));});
