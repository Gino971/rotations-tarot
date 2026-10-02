import test from 'node:test'
import assert from 'node:assert/strict'
import { optionsFor, createPlan, positionsFor, maxRounds, movementDetails } from './engine.js'
import { calculRotationsRainbow } from './movements.js'

test('every player has exactly one position per round across all supported counts and modes', () => {
  for (let count = 4; count <= 400; count++) {
    for (const option of optionsFor(count).filter(option => !option.disabled)) {
      const rounds = maxRounds(count, option.value)
      const exclusions = Array.from({ length: rounds }, (_, index) => index % count + 1)
      const plan = createPlan(count, rounds, option.value, exclusions)
      const details = movementDetails(count, option.value)
      assert.equal(details.tables, plan.rotations['Manche 1'].length, `table count: ${count}, ${option.value}`)
      assert.equal(details.limit, rounds)
      assert.equal(Object.keys(plan.rotations).length, rounds)
      for (const [index, tables] of Object.values(plan.rotations).entries()) {
        const ids = tables.flatMap(table => table.joueurs.map(player => player.id)).filter(id => id !== null)
        if (plan.excluded[index]) ids.push(plan.excluded[index])
        assert.deepEqual(ids.sort((a, b) => a - b), Array.from({ length: count }, (_, i) => i + 1), `count=${count}, mode=${option.value}, round=${index}`)
        if (option.value.startsWith('morts')) for (const table of tables) assert.ok(table.joueurs.slice(1).every(player => player.id !== null))
      }
      for (let id = 1; id <= count; id++) assert.equal(positionsFor(plan, id).length, rounds)
    }
  }
})

test('standard rotations preserve the original movement engine', () => {
  for (const count of [4, 8, 12, 16, 20, 24, 32, 36, 40, 48, 56, 60, 64, 72, 80]) {
    const rounds = maxRounds(count, 'normal')
    const base = Array.from({ length: count }, (_, i) => ({ nom: `Joueur ${i + 1}`, numero: i + 1, id: i + 1 }))
    assert.deepEqual(createPlan(count, rounds, 'normal').rotations, calculRotationsRainbow(base, rounds))
  }
})

test('mixed table exceptions and source movement limits', () => {
  assert.deepEqual(createPlan(6, 4, 'mixed').rotations['Manche 1'].map(table => table.joueurs.length), [6])
  assert.deepEqual(createPlan(7, 4, 'mixed').rotations['Manche 1'].map(table => table.joueurs.length), [3, 4])
  assert.deepEqual(createPlan(11, 4, 'mixed').rotations['Manche 1'].map(table => table.joueurs.length), [5, 6])
  assert.equal(maxRounds(24, 'normal'), 5)
  assert.equal(maxRounds(32, 'normal'), 6)
  assert.throws(() => createPlan(24, 6, 'normal'))
  assert.deepEqual(createPlan(9, 4, 'excluded', [8, 8, 1, 2]).excluded, [8, 8, 1, 2])
})

test('invalid configurations are rejected', () => {
  for (const count of [0, 3, 401, 5.5, NaN]) assert.equal(optionsFor(count).length, 0)
  assert.throws(() => createPlan(6, 4, 'excluded'))
  assert.throws(() => createPlan(5, 4, 'morts'))
  assert.throws(() => createPlan(9, 4, 'excluded', [10]))
  assert.throws(() => createPlan(16, 0, 'normal'))
})

test('movement explanations describe source rules, exceptions and real limits', () => {
  const normal = movementDetails(20, 'normal')
  assert.equal(normal.label, 'Rotations normales')
  assert.match(normal.description, /Nord reste fixe\. Sud avance de 1 table\. Est avance de 2 tables\. Ouest recule de 2 tables\./)
  assert.deepEqual(normal.exceptions, [])
  const special = movementDetails(24, 'normal')
  assert.equal(special.limit, 5)
  assert.match(special.description, /Ouest recule de 1 table/)
  assert.deepEqual(special.exceptions, ['Vers la manche 3 : Est avance de 3 tables.', 'Vers la manche 4 : Ouest recule de 2 tables.'])
  assert.deepEqual(movementDetails(32, 'normal').exceptions, ['Vers la manche 5 : Sud avance de 2 tables. Est avance de 3 tables.', 'Vers la manche 6 : Est avance de 4 tables.'])
  assert.equal(movementDetails(32, 'normal').limit, 6)
  for (const [count, limit] of [[12, 6], [16, 5]]) {
    const howell = movementDetails(count, 'normal')
    assert.match(howell.label, /Howell/)
    assert.match(howell.description, /Nord n’est pas fixe/)
    assert.equal(howell.limit, limit)
  }
  for (const count of [4, 8]) assert.equal(movementDetails(count, 'normal').label, 'Mouvement Club')
  for (const count of [6, 7, 11, 21, 29]) {
    const club = movementDetails(count, 'mixed')
    assert.equal(club.label, 'Mouvement Club')
    assert.match(club.description, /5 places en boucle/)
    assert.deepEqual(club.exceptions, [])
  }
  const morts = movementDetails(21, 'morts')
  assert.equal(morts.tables, 6)
  assert.equal(morts.limit, 5)
  assert.deepEqual(morts.exceptions, special.exceptions)
  assert.match(morts.note, /morts restent au Nord/)
  for (const count of [13, 17, 25, 33]) {
    const manual = movementDetails(count, 'excluded')
    assert.equal(manual.tables, (count - 1) / 4)
    assert.equal(manual.limit, 7)
    assert.match(manual.description, /l’exclu n’a pas de place/)
    assert.deepEqual(manual.exceptions, [])
  }
})

test('manual exclusions leave unchosen rounds pending and never seat an excluded player', () => {
  const blank = createPlan(9, 4, 'excluded')
  assert.deepEqual(blank.excluded, [null, null, null, null])
  assert.ok(Object.values(blank.rotations).every(tables => tables.length === 0))
  assert.ok(positionsFor(blank, 1).every(position => position.pending))
  const manual = createPlan(9, 4, 'excluded', [8, null, 8])
  assert.deepEqual(manual.excluded, [8, null, 8, null])
  assert.deepEqual(positionsFor(manual, 8), [{ excluded: true }, { pending: true }, { excluded: true }, { pending: true }])
  for (const name of ['Manche 1', 'Manche 3']) assert.ok(manual.rotations[name].every(table => table.joueurs.every(player => player.id !== 8)))
})
