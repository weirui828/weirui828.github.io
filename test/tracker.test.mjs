import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

for(const file of ['index.html','handscroll/index.html']) {
  const source=fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
  const script=[...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(x=>x[1]).find(x=>x.includes('const API_BASE')&&x.includes('sendBeacon'));
  function harness({hidden=false,ignored=false}={}) {
    let now=0;const callbacks={},beacons=[];
    const document={referrer:'',visibilityState:hidden?'hidden':'visible',documentElement:{scrollTop:0,scrollHeight:1000,clientHeight:1000},body:{scrollTop:0,scrollHeight:1000},addEventListener(n,cb){callbacks[n]=cb;}};
    vm.runInNewContext(script,{URLSearchParams,URL,Date:{now:()=>now},localStorage:{getItem:()=>ignored?'1':null},
      location:{hostname:'weiniverse.com',pathname:'/',search:'',hash:''},document,window:{addEventListener(n,cb){callbacks[n]=cb;}},
      navigator:{sendBeacon(url,body){beacons.push({url,body:JSON.parse(body)});return true;}}
    });
    return {document,callbacks,beacons,advance(ms){now+=ms;}};
  }
  test(file+': fitting page does not report 100% scroll',()=>{
    const h=harness();h.advance(5000);h.callbacks.pagehide();
    assert.equal(h.beacons.length,2);assert.deepEqual(h.beacons[1].body.events,[{type:'duration',value:5}]);
  });
  test(file+': background-only page does not report reading duration',()=>{
    const h=harness({hidden:true});h.advance(20000);h.callbacks.pagehide();assert.equal(h.beacons.length,1);
  });
  test(file+': time before first visibility is excluded',()=>{
    const h=harness({hidden:true});h.advance(20000);h.document.visibilityState='visible';h.callbacks.visibilitychange();
    h.advance(5000);h.document.visibilityState='hidden';h.callbacks.visibilitychange();
    assert.equal(h.beacons[1].body.events.find(x=>x.type==='duration').value,5);
  });
  test(file+': own-browser opt-out suppresses all beacons',()=>{
    assert.equal(harness({ignored:true}).beacons.length,0);
  });
}
