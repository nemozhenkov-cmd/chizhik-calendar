import test from 'node:test';
import assert from 'node:assert/strict';
import {getVisitorId} from '../src/visitor.mjs';
const id='11111111-1111-4111-8111-111111111111';
test('same browser retains identity across sessions',()=>{const data=new Map();const storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};assert.equal(getVisitorId(storage,()=>id),id);assert.equal(getVisitorId(storage,()=>{throw Error('should reuse');}),id);});
test('unavailable storage never fabricates a unique visitor',()=>{assert.equal(getVisitorId({getItem(){throw Error('denied');}},()=>id),null);assert.equal(getVisitorId({getItem(){return null;},setItem(){}},()=>id),null);});
test('invalid stored ID is replaced',()=>{let v='invalid';const s={getItem:()=>v,setItem:(k,x)=>{v=x;}};assert.equal(getVisitorId(s,()=>id),id);});
