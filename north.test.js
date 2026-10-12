import test from 'node:test'
import assert from 'node:assert/strict'
import {createPlan,drawOrderWithNorth,encountersFor} from './engine.js'

test('optional North assignments preserve unique players and encounter quality',()=>{
 for(const [count,mode,exclusions,assignments] of [[20,'normal',[],{1:20,2:1,3:6}],[9,'mixed',[],{1:9,2:1}],[17,'morts',[],{1:17}],[17,'excluded',[17],{1:16,2:1}]]) {
  const order=drawOrderWithNorth(count,mode,exclusions,123,assignments)
  assert.equal(new Set(order).size,count)
  const plan=createPlan(count,4,mode,exclusions,true,123,order)
  for(const table of plan.rotations['Manche 1']) if(assignments[table.table]) assert.equal(table.joueurs[0].id,assignments[table.table])
  const repeats=p=>encountersFor(p).flat().reduce((s,e)=>s+e.times-1,0)
  assert.equal(repeats(plan),repeats(createPlan(count,4,mode,exclusions,true,123)))
 }
})
test('North rejects duplicate choices, excluded players and fixed morts',()=>{
 assert.throws(()=>drawOrderWithNorth(20,'normal',[],123,{1:2,2:2}))
 assert.throws(()=>drawOrderWithNorth(17,'excluded',[17],123,{1:17}))
 const first=createPlan(17,1,'morts');const mort=first.rotations['Manche 1'].find(t=>t.joueurs[0].id===null)
 assert.throws(()=>drawOrderWithNorth(17,'morts',[],123,{[mort.table]:1}))
})
