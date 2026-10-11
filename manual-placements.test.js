import test from 'node:test'
import assert from 'node:assert/strict'
import { createPlan, exchangeRoundPlayers, applyRoundOrders, encountersFor, positionsFor } from './engine.js'

test('an exchange updates only the chosen round and its encounters', () => {
  const plan = createPlan(16, 4, 'normal')
  const before = structuredClone(plan)
  const tables = Object.values(plan.rotations)[2]
  const a = tables[0].joueurs[0].id, b = tables[1].joueurs[1].id
  const positionA = positionsFor(plan,a)[2], positionB = positionsFor(plan,b)[2]
  assert.equal(exchangeRoundPlayers(plan,2,a,b),true)
  assert.deepEqual(positionsFor(plan,a)[2],positionB)
  assert.deepEqual(positionsFor(plan,b)[2],positionA)
  for (const index of [0,1,3]) assert.deepEqual(Object.values(plan.rotations)[index],Object.values(before.rotations)[index])
  assert.notDeepEqual(encountersFor(plan),encountersFor(before))
  const encounters = encountersFor(plan)
  for (const [index,row] of encounters.entries()) for (const {id,times} of row) assert.equal(encounters[id-1].find(other=>other.id===index+1).times,times)
})

test('manual round orders survive serialization and reject missing players or moved morts', () => {
  const plan = createPlan(17, 3, 'morts')
  const original = structuredClone(plan)
  const active = Object.values(plan.rotations)[1].flatMap(table=>table.joueurs).filter(player=>player.id!==null)
  assert.equal(exchangeRoundPlayers(plan,1,active[0].id,active.at(-1).id),true)
  const order = Object.values(plan.rotations)[1].flatMap(table=>table.joueurs.map(player=>player.id))
  const restored = structuredClone(original)
  applyRoundOrders(restored,JSON.parse(JSON.stringify({1:order})))
  assert.deepEqual(restored,plan)
  const invalid = [...order]; invalid[invalid.indexOf(null)] = active[0].id
  const unchanged = structuredClone(original)
  applyRoundOrders(unchanged,{1:invalid})
  assert.deepEqual(unchanged,original)
  assert.equal(exchangeRoundPlayers(unchanged,1,active[0].id,null),false)
})

test('editing the first round rebuilds later rounds without adding repeats to a normal movement', async () => {
  const { exchangeAndRecalculate } = await import('./engine.js')
  const plan = createPlan(20, 4, 'normal')
  const before = structuredClone(plan)
  const a = plan.rotations['Manche 1'][0].joueurs[0].id
  const b = plan.rotations['Manche 1'][1].joueurs[1].id
  const repeats = value => encountersFor(value).flat().reduce((sum,pair)=>sum+pair.times-1,0)/2
  assert.equal(exchangeAndRecalculate(plan,0,a,b),true)
  assert.equal(repeats(plan),repeats(before))
  assert.notDeepEqual(plan.rotations['Manche 2'],before.rotations['Manche 2'])
  const orders = Object.fromEntries(Object.values(plan.rotations).map((tables,index)=>[index,tables.flatMap(table=>table.joueurs.map(player=>player.id))]))
  const restored = structuredClone(before)
  applyRoundOrders(restored,JSON.parse(JSON.stringify(orders)))
  for (let id = 1; id <= plan.count; id++) assert.deepEqual(positionsFor(restored,id),positionsFor(plan,id))
  assert.deepEqual(encountersFor(restored),encountersFor(plan))
})

test('later exchanges preserve earlier rounds and every active player, including mixed and mort tables', async () => {
  const { exchangeAndRecalculate } = await import('./engine.js')
  for (const [count,mode] of [[20,'normal'],[9,'mixed'],[17,'morts'],[17,'excluded']]) {
    const plan = createPlan(count,4,mode,mode==='excluded'?[17]:[])
    const before = structuredClone(plan)
    const active = plan.rotations['Manche 2'].flatMap(table=>table.joueurs).filter(player=>player.id!==null)
    assert.equal(exchangeAndRecalculate(plan,1,active[0].id,active.at(-1).id),true)
    assert.deepEqual(plan.rotations['Manche 1'],before.rotations['Manche 1'])
    for (const tables of Object.values(plan.rotations)) {
      const ids = tables.flatMap(table=>table.joueurs).filter(player=>player.id!==null).map(player=>player.id)
      assert.equal(new Set(ids).size,active.length)
      assert.deepEqual(ids.sort((a,b)=>a-b),active.map(player=>player.id).sort((a,b)=>a-b))
      for(const table of tables) if(table.joueurs.some(player=>player.id===null)) assert.equal(table.joueurs[0].id,null)
    }
  }
})


test('swapping two South seats after a random draw preserves every encounter count', async () => {
  const { exchangeAndRecalculate } = await import('./engine.js')
  for (const seed of [null,1,98765,4294967295]) {
    const plan = createPlan(20,4,'normal',[],true,seed)
    const first = plan.rotations['Manche 1']
    const a = first[0].joueurs[1].id, b = first[1].joueurs[1].id
    const before = encountersFor(plan)
    assert.equal(exchangeAndRecalculate(plan,0,a,b),true)
    const mapped = id => id === a ? b : id === b ? a : id
    const expected = Array.from({length:20},(_,index)=>before[mapped(index+1)-1].map(pair=>({...pair,id:mapped(pair.id)})).sort((a,b)=>a.id-b.id))
    assert.deepEqual(encountersFor(plan),expected)
    assert.equal(encountersFor(plan).flat().reduce((sum,pair)=>sum+pair.times-1,0),0)
  }
})
