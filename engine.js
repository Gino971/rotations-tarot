import { calculRotationsRainbow, getMovementInfo } from './movements.js'
import { optimizeRotations } from './optimizer.js'

export const seats = ['Nord', 'Sud', 'Est', 'Ouest', 'Exempt 1', 'Exempt 2']

export function optionsFor(count) {
  if (!Number.isInteger(count) || count < 4 || count > 400) return []
  if (count % 4 === 0) return [{ value: 'normal', label: 'Tables de 4', detail: `${count / 4} tables complètes.` }]
  const missing = 4 - count % 4
  const canPlaceMorts = Math.ceil(count / 4) >= missing
  const fiveTables = count % 4
  const fourTables = (count - fiveTables * 5) / 4
  return [
    { value: 'morts', label: `Ajouter ${missing} mort${missing > 1 ? 's' : ''}`, detail: `${Math.ceil(count / 4)} tables de 4, avec ${missing} place${missing > 1 ? 's' : ''} vide${missing > 1 ? 's' : ''} au Nord.`, disabled: !canPlaceMorts },
    ...([6, 11].includes(count) ? [] : [{ value: 'mixed', label: count === 7 ? '1 table de 3 et 1 table de 4' : `${fiveTables} table${fiveTables > 1 ? 's' : ''} de 5${fourTables > 0 ? ` et ${fourTables} table${fourTables > 1 ? 's' : ''} de 4` : ''}`, detail: 'Répartition sans table de 6.' }]),
    ...(count % 4 === 1 ? [{ value: 'excluded', label: 'Exclus 1ere manche', detail: 'Choisissez l’exclu de la première manche. Toutes les rotations sont préparées avec les autres joueurs.' }] : [])
  ]
}

function initialPlayers(count, mode) {
  const players = Array.from({ length: count }, (_, i) => ({ nom: `Joueur ${i + 1}`, numero: i + 1, id: i + 1 }))
  if (!mode.startsWith('morts')) return players
  const missing = 4 - count % 4
  const total = count + missing
  const base = new Array(total)
  for (let i = 0; i < missing; i++) {
    base[(total / 4 - missing + i) * 4] = { nom: `Mort ${i + 1}`, numero: count + i + 1, id: null }
  }
  let index = 0
  for (let i = 0; i < total; i++) if (!base[i]) base[i] = players[index++]
  return base.map((player, index) => ({ ...player, numero: index + 1 }))
}

export function maxRounds(count, mode) {
  if (mode === 'excluded') {
    const active = initialPlayers(count, mode).slice(0, -1)
    return Object.keys(calculRotationsRainbow(active, 7)).length
  }
  if (mode === 'mixed' && count === 6) return 7
  const base = initialPlayers(count, mode)
  return Object.keys(calculRotationsRainbow(base, 7)).length
}

function describeMoves(text) {
  const seats = { Nord: 'N', Sud: 'S', Est: 'E', Ouest: 'O' }
  return text.split(/[,;]\s*/).map(move => {
    const [seat, delta] = move.trim().split(/\s+/)
    const short = seats[seat] || seat
    return delta === 'fixe' ? `${short} fixe` : `${short}${Number(delta) > 0 ? '+' : ''}${Number(delta)}`
  }).join(', ')
}

export function movementDetails(count, mode) {
  if (mode === 'excluded') return movementDetails(count - 1, 'normal')
  const limit = maxRounds(count, mode)
  // Read the actual first-round table layout, including 3/4 and 5/6
  // exceptions. Manual exclusions have a fixed count of active tables.
  const tables = mode === 'excluded' ? (count - 1) / 4 : createPlan(count, 1, mode).rotations['Manche 1'].length
  const details = { tables, limit, label: '', description: '', exceptions: [], note: '' }
  if (mode === 'mixed' || mode === 'morts') {
    details.label = 'Rotations équilibrées'
    details.description = 'Passages équilibrés, rencontres répétées limitées. Voir les placements.'
    if (mode === 'morts') details.note = 'Morts : N fixe, un par table.'
    return details
  }
  if (tables < 3) {
    details.label = 'Mouvement Club'
    details.description = 'Liste décalée de 5 places ; N mobile.'
  } else if (tables === 3 || tables === 4) {
    details.label = 'Mouvement spécial · Howell'
    details.description = 'Les joueurs changent de table et de place selon le plan de chaque manche.'
  } else {
    const info = getMovementInfo(tables)
    const [base, exceptions] = info.comment.split(' — Exceptions: ')
    details.label = info.label === 'Mouvement spécial FFT' ? 'Mouvement spécial' : 'Rotations normales'
    details.description = describeMoves(base)
    if (exceptions) details.exceptions = exceptions.split(/;\s*(?=Manche\s)/).map(exception => {
      const [round, moves] = exception.split(': ')
      return `Vers M${round.split(" ")[1]} : ${describeMoves(moves)}`
    })
  }
  if (mode === 'morts') details.note = 'Les morts restent au Nord ; les places sont ajustées si nécessaire.'
  return details
}

export function drawOrder(count, seed) {
  const order = Array.from({ length: count }, (_, i) => i + 1)
  if (seed === null) return order
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('Tirage invalide.')
  let state = seed >>> 0
  for (let i = count - 1; i > 0; i--) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    const j = Math.floor(state / 4294967296 * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  return order
}

export function createPlan(count, rounds, mode, exclusions = [], optimized = true, drawSeed = null, manualOrder = null) {
  const option = optionsFor(count).find(option => option.value === mode && !option.disabled)
  if (!option) throw new Error('Choisissez une répartition disponible pour cet effectif.')
  const limit = maxRounds(count, mode)
  if (!Number.isInteger(rounds) || rounds < 1 || rounds > limit) throw new Error(`Ce mouvement permet de 1 à ${limit} manches.`)
  if (!Array.isArray(exclusions)) throw new Error('Choisissez les exclus manche par manche.')
  if (manualOrder !== null && (!Array.isArray(manualOrder) || manualOrder.length !== count || new Set(manualOrder).size !== count || manualOrder.some(id => !Number.isInteger(id) || id < 1 || id > count))) throw new Error('Placement manuel invalide.')
  const order = manualOrder === null ? drawOrder(count, drawSeed) : manualOrder
  const relabel = player => player.id === null ? player : { ...player, id: order[player.id - 1], nom: `Joueur ${order[player.id - 1]}` }
  let base = initialPlayers(count, mode)
  if (mode === 'excluded' && (drawSeed !== null || manualOrder !== null)) base = base.map(relabel)
  let rotations
  const excluded = []
  if (mode === 'excluded') {
    const id = exclusions[0] ?? null
    if (id !== null && (!Number.isInteger(id) || id < 1 || id > count)) throw new Error(`Choisissez un joueur de 1 à ${count} pour la première manche.`)
    excluded.push(...Array(rounds).fill(id))
    const active = base.filter(player => player.id !== id)
    rotations = id === null ? Object.fromEntries(Array.from({ length: rounds }, (_, r) => [`Manche ${r + 1}`, []])) : calculRotationsRainbow(active, rounds)
  } else if (mode === 'mixed' && count === 6) {
    // The original small-count fallback made a table of 2. Keep all six
    // at one table using its Club shift, with the two extra seats exempt.
    rotations = {}
    for (let r = 0; r < rounds; r++) {
      const shift = (r * 5) % count
      rotations[`Manche ${r + 1}`] = [{ table: 1, joueurs: [...base.slice(shift), ...base.slice(0, shift)] }]
    }
  } else rotations = calculRotationsRainbow(base, rounds)
  // Also keep morts at North for the small-table Club fallback.
  if (mode.startsWith('morts')) {
    for (const tables of Object.values(rotations)) {
      // A Howell round can bring several morts to the same table.
      // Move each surplus mort to an empty North, preserving every player.
      for (const table of tables) {
        const mortIndexes = table.joueurs.flatMap((player, index) => player.id === null ? [index] : [])
        for (const index of mortIndexes.slice(1)) {
          const destination = tables.find(candidate => candidate.joueurs.every(player => player.id !== null))
          ;[table.joueurs[index], destination.joueurs[0]] = [destination.joueurs[0], table.joueurs[index]]
        }
      }
      for (const table of tables) {
        const index = table.joueurs.findIndex(player => player.id === null)
        if (index > 0) [table.joueurs[0], table.joueurs[index]] = [table.joueurs[index], table.joueurs[0]]
      }
    }
  }
  if (optimized && (mode === 'morts' || mode === 'mixed')) rotations = optimizeRotations(rotations, count)
  if (mode !== 'excluded' && (drawSeed !== null || manualOrder !== null)) {
    for (const tables of Object.values(rotations)) for (const table of tables) table.joueurs = table.joueurs.map(relabel)
  }
  return { count, rounds, mode, excluded, rotations }
}

export function positionsFor(plan, id) {
  return Object.values(plan.rotations).map((tables, index) => {
    if (plan.mode === 'excluded' && plan.excluded[index] === null) return { pending: true }
    if (plan.excluded[index] === id) return { excluded: true }
    for (const table of tables) {
      const seat = table.joueurs.findIndex(player => player.id === id)
      if (seat >= 0) return { table: table.table, seat: seats[seat], short: ['N', 'S', 'E', 'O', 'X1', 'X2'][seat] }
    }
    throw new Error(`Placement manquant pour le joueur ${id}.`)
  })
}

// Reuse precisely the same preparation and mort corrections for a fair baseline.
export function createOriginalPlan(count, rounds, mode, exclusions = []) {
  return createPlan(count, rounds, mode, exclusions, false)
}

export function encountersFor(plan) {
  const encounters = Array.from({ length: plan.count }, () => new Map())
  for (const tables of Object.values(plan.rotations)) for (const table of tables) {
    const players = table.joueurs.filter(player => player.id !== null)
    for (const player of players) for (const other of players) if (player.id !== other.id) {
      const row = encounters[player.id - 1]
      row.set(other.id, (row.get(other.id) || 0) + 1)
    }
  }
  return encounters.map(row => [...row].sort(([a], [b]) => a - b).map(([id, times]) => ({ id, times })))
}

export function tableVisitsFor(plan) {
  const visits = Array.from({ length: plan.count }, () => ({ mort: 0, five: 0 }))
  for (const tables of Object.values(plan.rotations)) for (const table of tables) {
    const mort = table.joueurs.some(player => player.id === null)
    for (const player of table.joueurs) if (player.id !== null) {
      if (mort) visits[player.id - 1].mort++
      if (table.joueurs.length === 5) visits[player.id - 1].five++
    }
  }
  return visits
}

export function drawSlotsFor(count, mode, exclusions = [], seed = null, manualOrder = null) {
  const first = createPlan(count, 1, mode, exclusions, true, seed, manualOrder)
  if (mode === 'excluded' && first.excluded[0] === null) return manualOrder === null ? drawOrder(count, seed) : [...manualOrder]
  const order = first.rotations['Manche 1'].flatMap(table => table.joueurs.map(player => player.id))
  if (first.excluded[0]) order.push(first.excluded[0])
  return order
}

export function drawGroupSizesFor(count, mode, exclusions = []) {
  const first = createPlan(count, 1, mode, exclusions)
  if (mode === 'excluded') return [...Array((count - 1) / 4).fill(4), 1]
  return first.rotations['Manche 1'].map(table => table.joueurs.length)
}

export function normalizeExclusions(count, exclusions, rounds) {
  const used = new Set()
  return Array.from({ length: rounds }, (_, index) => {
    const id = exclusions[index]
    if (!Number.isInteger(id) || id < 1 || id > count || used.has(id)) return null
    used.add(id)
    return id
  })
}
