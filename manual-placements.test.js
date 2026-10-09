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
