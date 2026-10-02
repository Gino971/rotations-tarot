import test from 'node:test'
import assert from 'node:assert/strict'
import { createPlan, maxRounds, optionsFor, createOriginalPlan, encountersFor, tableVisitsFor, drawSlotsFor, drawGroupSizesFor } from './engine.js'
import { calculRotationsRainbow } from './movements.js'

function quality(rotations, count, mode) {
  const visits = new Array(count).fill(0)
  const pairs = new Map()
  let repeats = 0
  for (const tables of Object.values(rotations)) {
    for (const table of tables) {
      const ids = table.joueurs.filter(p => p.id !== null).map(p => p.id)
      const special = mode === 'morts' ? table.joueurs.some(p => p.id === null) : table.joueurs.length === 5
      if (special) for (const id of ids) visits[id - 1]++
      for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
        const key = [ids[i], ids[j]].sort((a, b) => a - b).join(':')
        if (pairs.has(key)) repeats++
        pairs.set(key, true)
      }
    }
  }
  return { spread: Math.max(...visits) - Math.min(...visits), repeats }
}

test('special-table visits differ by at most one after every round', () => {
  for (let count = 4; count <= 100; count++) for (const mode of ['morts', 'mixed']) {
    if (!optionsFor(count).some(o => o.value === mode && !o.disabled)) continue
    const plan = createPlan(count, maxRounds(count, mode), mode)
    const prefix = {}
    for (const [name, tables] of Object.entries(plan.rotations)) {
      prefix[name] = tables
      assert.ok(quality(prefix, count, mode).spread <= 1, `${count}, ${mode}, ${name}`)
    }
  }
})

test('new mixed plans substantially reduce the old cyclic repeated encounters', () => {
  for (const count of [9, 13, 17, 21, 29, 41]) {
    const rounds = maxRounds(count, 'mixed')
    const base = Array.from({ length: count }, (_, i) => ({ nom: `Joueur ${i + 1}`, numero: i + 1, id: i + 1 }))
    const old = quality(calculRotationsRainbow(base, rounds), count, 'mixed')
    const improved = quality(createPlan(count, rounds, 'mixed').rotations, count, 'mixed')
    assert.ok(improved.repeats < old.repeats, `${count}: ${improved.repeats} vs ${old.repeats}`)
  }
})

test('adding a round preserves existing placements and recalculation is deterministic', () => {
  for (const [count, mode] of [[9, 'morts'], [21, 'morts'], [11, 'mixed'], [29, 'mixed']]) {
    const shorter = createPlan(count, 3, mode)
    const longer = createPlan(count, 4, mode)
    for (const name of Object.keys(shorter.rotations)) assert.deepEqual(shorter.rotations[name], longer.rotations[name])
    assert.deepEqual(longer, createPlan(count, 4, mode))
  }
})

test('encounter lists count all shared tables, omit morts and preserve symmetry', () => {
  const single = encountersFor(createPlan(6, 4, 'mixed'))
  assert.deepEqual(single[0], [2, 3, 4, 5, 6].map(id => ({ id, times: 4 })))
  for (const mode of ['mixed', 'morts']) {
    const plan = createPlan(9, 4, mode)
    const rows = encountersFor(plan)
    for (const [i, row] of rows.entries()) for (const { id, times } of row) {
      assert.notEqual(id, i + 1)
      assert.equal(rows[id - 1].find(p => p.id === i + 1).times, times)
      assert.equal(times, Object.values(plan.rotations).filter(tables => tables.some(t => t.joueurs.some(p => p.id === id) && t.joueurs.some(p => p.id === i + 1))).length)
    }
  }
  assert.deepEqual(encountersFor(createPlan(9, 2, 'excluded')), Array.from({ length: 9 }, () => []))
})

test('original plans retain the pre-optimization movement for comparison', () => {
  for (const count of [9, 13, 21]) {
    const base = Array.from({ length: count }, (_, i) => ({ nom: `Joueur ${i + 1}`, numero: i + 1, id: i + 1 }))
    assert.deepEqual(createOriginalPlan(count, 4, 'mixed').rotations, calculRotationsRainbow(base, 4))
  }
  const original = createOriginalPlan(9, 4, 'morts')
  for (const tables of Object.values(original.rotations)) for (const table of tables) assert.ok(table.joueurs.slice(1).every(p => p.id !== null))
  assert.deepEqual(createOriginalPlan(16, 4, 'normal'), createPlan(16, 4, 'normal'))
})

test('retain a balanced original when it already avoids every repeat', () => {
  const original = createOriginalPlan(15, 5, 'morts')
  const improved = createPlan(15, 5, 'morts')
  const visits = tableVisitsFor(original).map(v => v.mort)
  assert.ok(Math.max(...visits) - Math.min(...visits) <= 1)
  const repeats = p => encountersFor(p).reduce((sum, row) => sum + row.reduce((s, x) => s + x.times - 1, 0), 0)
  assert.equal(repeats(original), 0)
  assert.equal(repeats(improved), 0)
  assert.ok(encountersFor(improved).every(row => row.length === 14 && row.every(p => p.times === 1)))
  assert.ok(tableVisitsFor(improved).every(v => v.mort === 1))
  for (const tables of Object.values(improved.rotations)) assert.ok(tables.every(t => t.joueurs.length === 4))
})

test('comparison reports actual special table exposure for every player', () => {
  for (const mode of ['mixed', 'morts']) {
    const plan = createPlan(21, 5, mode)
    const visits = tableVisitsFor(plan)
    for (let id = 1; id <= plan.count; id++) {
      const tables = Object.values(plan.rotations).flat().filter(t => t.joueurs.some(p => p.id === id))
      assert.deepEqual(visits[id - 1], { mort: tables.filter(t => t.joueurs.some(p => p.id === null)).length, five: tables.filter(t => t.joueurs.length === 5).length })
    }
  }
})

test('draw keeps the same balanced schedule with randomly reassigned player numbers', () => {
  const drawn = createPlan(15, 5, 'morts', [], true, 12345)
  assert.notDeepEqual(drawn.rotations['Manche 1'], createPlan(15, 5, 'morts').rotations['Manche 1'])
  assert.deepEqual(drawn, createPlan(15, 5, 'morts', [], true, 12345))
  assert.ok(encountersFor(drawn).every(row => row.length === 14 && row.every(p => p.times === 1)))
  assert.ok(tableVisitsFor(drawn).every(v => v.mort === 1))
  const short = createPlan(15, 3, 'morts', [], true, 12345)
  for (const name of Object.keys(short.rotations)) assert.deepEqual(short.rotations[name], drawn.rotations[name])
  for (const tables of Object.values(drawn.rotations)) {
    assert.deepEqual(tables.flatMap(t => t.joueurs.filter(p => p.id !== null).map(p => p.id)).sort((a,b) => a-b), Array.from({length:15},(_,i)=>i+1))
    assert.ok(tables.every(t => t.joueurs.slice(1).every(p => p.id !== null)))
  }
})

test('draw respects manual exclusions using actual player numbers', () => {
  const plan = createPlan(13, 3, 'excluded', [2, null, 7], true, 999)
  assert.deepEqual(plan.excluded, [2, null, 7])
  assert.deepEqual(plan.rotations['Manche 2'], [])
  for (const [name, excluded] of [['Manche 1', 2], ['Manche 3', 7]]) {
    const ids = plan.rotations[name].flatMap(t => t.joueurs.map(p => p.id))
    assert.equal(ids.length, 12); assert.equal(new Set(ids).size, 12); assert.ok(!ids.includes(excluded))
  }
})

test('draw display preserves fixed morts at North and the excluded player', () => {
  for (const count of [6, 9, 10, 11, 15, 21]) for (const seed of [null, 99, 12345]) {
    const slots = drawSlotsFor(count, 'morts', [], seed)
    const actual = createPlan(count, 1, 'morts', [], true, seed).rotations['Manche 1'].flatMap(t => t.joueurs.map(p => p.id))
    assert.deepEqual(slots, actual)
    assert.equal(slots.filter(id => id === null).length, 4 - count % 4)
    slots.forEach((id, index) => { if (id === null) assert.equal(index % 4, 0) })
  }
  const excluded = drawSlotsFor(13, 'excluded', [7], 99)
  assert.equal(excluded.at(-1), 7)
  assert.equal(new Set(excluded).size, 13)
})

test('draw groups match actual table sizes, including five and six players', () => {
  for (const count of [5, 6, 7, 9, 11, 13, 15, 21]) {
    const sizes = drawGroupSizesFor(count, 'mixed')
    assert.deepEqual(sizes, createPlan(count, 1, 'mixed').rotations['Manche 1'].map(t => t.joueurs.length))
    assert.equal(sizes.reduce((sum, size) => sum + size, 0), count)
  }
  assert.deepEqual(drawGroupSizesFor(9, 'mixed'), [4, 5])
  assert.deepEqual(drawGroupSizesFor(11, 'mixed'), [5, 6])
  assert.deepEqual(drawGroupSizesFor(13, 'excluded', [7]), [4, 4, 4, 1])
})
