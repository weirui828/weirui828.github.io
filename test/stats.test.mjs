import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../stats/index.html',import.meta.url),'utf8');
const scripts=[...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(x=>x[1]).filter(x=>x.trim());
const sample={since:'2026-11-15',days:1,totals:{views:0,visitors:0},daily:[],pages:[],referrers:[],countries:[],devices:[],os:[],browsers:[],networks:[],sections:[],outbounds:[],scrolls:[],campaigns:[],duration:{avg_seconds:0,count:0}};
const SAVED='Basic '+btoa('wei:synthetic-test-password');
function harness(saved={},firstResponse) {
  const nodes=new Map(), calls=[], writes=[], store=new Map(Object.entries(saved));
  function node(id) {
    if(!nodes.has(id)) nodes.set(id,{id,hidden:['report','controls','signout','panel-geo'].includes(id),value:id==='username'?'wei':'',dataset:{},callbacks:{},style:{},
      addEventListener(name,cb){this.callbacks[name]=cb;},setAttribute(){},getAttribute(){return '';},
      querySelector(){return {remove(){},addEventListener(){}};},insertAdjacentHTML(_where,html){this.innerHTML=html;},tBodies:[{}]
    });
    return nodes.get(id);
  }
  let respond=firstResponse||(async()=>Response.json(sample)), reloads=0;
  const context=vm.createContext({Intl,TextEncoder,btoa,CSS:{escape:String},console,location:{hash:'#summary',reload(){reloads++;}},
    document:{getElementById:node,querySelectorAll:()=>[]},addEventListener(){},requestAnimationFrame(cb){cb();},
    localStorage:{getItem(k){return store.has(k)?store.get(k):null;},setItem(k,v){writes.push([k,v]);store.set(k,String(v));},removeItem(k){store.delete(k);}},
    fetch:async(url,options)=>{calls.push({url,options});return respond(url,options);}
  });
  for(const script of scripts) vm.runInContext(script,context);
  return {node,calls,writes,store,context,setResponse(fn){respond=fn;},get reloads(){return reloads;}};
}
async function settle(){await new Promise(r=>setTimeout(r,10));}
function login(h){h.node('password').value='synthetic-test-password';h.node('login').callbacks.submit({preventDefault(){}});}

test('dashboard loads with no analytics request before sign-in',()=>{
  const h=harness();assert.equal(h.calls.length,0);assert.equal(h.node('report').hidden,true);
});
test('sign-in sends credentials only to API and remembers them after success',async()=>{
  const h=harness();login(h);await settle();
  assert.equal(h.calls.length,1);const {url,options}=h.calls[0];
  assert.equal(url,'https://weiniverse-stats.aug828.workers.dev/stats?days=30');
  assert.equal(atob(options.headers.Authorization.slice(6)),'wei:synthetic-test-password');
  assert.equal(options.cache,'no-store');assert.equal(options.redirect,'error');
  assert.equal(h.node('password').value,'');
  assert.deepEqual(h.writes,[['stats-sign-in',SAVED]]);
  assert.equal(h.node('report').hidden,false);assert.equal(h.node('login').hidden,true);
});
test('a saved sign-in loads the stats on open without the form',async()=>{
  const h=harness({'stats-sign-in':SAVED});await settle();
  assert.equal(h.calls.length,1);assert.equal(h.calls[0].options.headers.Authorization,SAVED);
  assert.equal(h.node('report').hidden,false);assert.equal(h.node('login').hidden,true);
});
test('wrong credentials keep analytics hidden, are not saved, and clear in-memory authentication',async()=>{
  const h=harness();h.setResponse(async()=>new Response('Authentication required',{status:401}));login(h);await settle();
  assert.equal(h.node('report').hidden,true);assert.equal(h.node('login').hidden,false);
  assert.match(h.node('status').textContent,/Sign-in failed/);assert.equal(h.writes.length,0);
  await vm.runInContext('load(7)',h.context);assert.equal(h.calls.length,1);
});
test('a saved sign-in that stops working is forgotten',async()=>{
  const h=harness({'stats-sign-in':SAVED},async()=>new Response('Authentication required',{status:401}));await settle();
  assert.equal(h.store.has('stats-sign-in'),false);assert.equal(h.node('login').hidden,false);
});
test('a network error keeps the saved sign-in',async()=>{
  const h=harness({'stats-sign-in':SAVED},async()=>{throw new TypeError('offline');});await settle();
  assert.equal(h.store.get('stats-sign-in'),SAVED);assert.match(h.node('status').textContent,/could not be loaded/);
});
test('sign-out clears credentials, forgets the saved sign-in, and reloads away rendered data',async()=>{
  const h=harness();login(h);await settle();h.node('signout').callbacks.click();
  assert.equal(h.store.has('stats-sign-in'),false);
  assert.equal(h.reloads,1);await vm.runInContext('load(7)',h.context);assert.equal(h.calls.length,1);
});
test('an old authenticated response cannot render after sign-out',async()=>{
  const h=harness();let resolve;h.setResponse(()=>new Promise(r=>{resolve=r;}));login(h);
  h.node('signout').callbacks.click();resolve(Response.json(sample));await settle();assert.equal(h.node('report').hidden,true);
});
test('hostile labels are escaped in both attributes and display text',()=>{
  const h=harness();vm.runInContext('drawList("pages", [{name: \'a" data-audit="marker"><b>x</b>\', views:1}]);',h.context);
  const html=h.node('pages').innerHTML;
  assert(!html.includes('<b>'));assert(html.includes('data-code="a&#34; data-audit=&#34;marker&#34;&#62;&#60;b&#62;x&#60;/b&#62;"'));
});
