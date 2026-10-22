const {test}=require('node:test');const assert=require('node:assert/strict');const ts=require('typescript');const fs=require('node:fs');
function fixture({token='code',rows=[],error=null}={}){
 const calls=[];const supabase={rpc:async(name,args)=>{calls.push({name,args});return {data:rows,error};}};
 const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(__dirname+'/../src/services/orders.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText)(id=>id.includes('async-storage')?{getItem:async()=>token}:{supabase},m,m.exports);
 return {api:m.exports,calls};
}
test('detail uses token-bound server RPC rather than public table access',async()=>{const x=fixture({rows:[{id:'a'}]});assert.equal((await x.api.getOrderById('a')).id,'a');assert.deepEqual(x.calls,[{name:'driver_orders_secure',args:{p_token:'code',p_order_id:'a',p_history:false}}]);});
test('server rejection is not replaced by cached data',async()=>{const x=fixture({error:{message:'Código inválido'}});await assert.rejects(x.api.getOrderById('a'),/Código inválido/);});
test('missing assignment cannot open a detail',async()=>{const x=fixture();await assert.rejects(x.api.getOrderById('a'),/no asignado/);});
test('without token no server query is made',async()=>{const x=fixture({token:null});await assert.rejects(x.api.getAssignedOrders('a'));assert.equal(x.calls.length,0);});
test('active queue is oldest first',async()=>{const x=fixture({rows:[{id:'b',created_at:'2026-10-22T02:00:00Z'},{id:'a',created_at:'2026-10-22T01:00:00Z'}]});assert.deepEqual((await x.api.getAssignedOrders('driver')).map(o=>o.id),['a','b']);});
