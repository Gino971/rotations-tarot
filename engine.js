import { calculRotationsRainbow, computeActiveFromBase, getMovementInfo } from './movements.js'

export const seats = ['Nord', 'Sud', 'Est', 'Ouest', 'Exempt 1', 'Exempt 2']

export function optionsFor(count) {
  if (!Number.isInteger(count) || count < 4 || count > 400) return []
  if (count % 4 === 0) return [{ value: 'normal', label: 'Tables de 4', detail: `${count / 4} tables complètes.` }]
  const missing = 4 - count % 4
  const canPlaceMorts = Math.ceil(count / 4) >= missing
  return [
    { value: 'morts', label: `Ajouter ${missing} mort${missing > 1 ? 's' : ''}`, detail: `${Math.ceil(count / 4)} tables de 4, avec ${missing} place${missing > 1 ? 's' : ''} vide${missing > 1 ? 's' : ''} au Nord.`, disabled: !canPlaceMorts },
    { value: 'mixed', label: 'Tables de 5 ou 6 joueurs', detail: count === 6 ? 'Une table de 6, avec deux places exemptes.' : count === 7 ? 'Une table de 3 et une table de 4, comme dans l’application de tournoi.' : count === 11 ? 'Une table de 5 et une table de 6.' : 'Tables de 4 et 5 ; places supplémentaires exemptes.' },
    ...(count % 4 === 1 ? [{ value: 'excluded', label: 'Un joueur exclu par manche', detail: 'Choisissez vous-même l’exclu de chaque manche selon les résultats. Aucune place ne lui est attribuée.' }] : [])
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
  if (mode === 'excluded' || (mode === 'mixed' && count === 6)) return 7
  const base = initialPlayers(count, mode)
  return Object.keys(calculRotationsRainbow(base, 7)).length
}

function describeMoves(text) {
  const names = { N: 'Nord', S: 'Sud', E: 'Est', O: 'Ouest' }
  return text.split(/[,;]\s*/).map(move => {
    const [seat, delta] = move.trim().split(/\s+/)
    const name = names[seat] || seat
    if (delta === 'fixe') return `${name} reste fixe`
    const steps = Math.abs(Number(delta))
    return `${name} ${Number(delta) > 0 ? 'avance' : 'recule'} de ${steps} table${steps > 1 ? 's' : ''}`
  }).join('. ') + '.'
}

export function movementDetails(count, mode) {
  const limit = maxRounds(count, mode)
  // Read the actual first-round table layout, including 3/4 and 5/6
  // exceptions. Manual exclusions have a fixed count of active tables.
  const tables = mode === 'excluded' ? (count - 1) / 4 : createPlan(count, 1, mode).rotations['Manche 1'].length
  const details = { tables, limit, label: '', description: '', exceptions: [], note: '' }
  if (mode === 'excluded') {
    details.label = 'Mouvement spécial · exclu manuel'
    details.description = 'Choisissez l’exclu de chaque manche selon les résultats. Les placements sont recalculés selon ce choix ; l’exclu n’a pas de place.'
    return details
  }
  if (mode === 'mixed' || tables < 3) {
    details.label = 'Mouvement Club'
    details.description = 'À chaque manche, la liste des joueurs est décalée de 5 places en boucle, puis répartie entre les tables. Nord n’est pas fixe.'
  } else if (tables === 3 || tables === 4) {
    details.label = 'Mouvement spécial · Howell'
    details.description = 'Les tables et les positions Nord, Sud, Est et Ouest suivent un plan différent à chaque manche. Nord n’est pas fixe ; consultez le placement indiqué.'
  } else {
    const info = getMovementInfo(tables)
    const [base, exceptions] = info.comment.split(' — Exceptions: ')
    details.label = info.label === 'Mouvement spécial FFT' ? 'Mouvement spécial' : 'Rotations normales'
    details.description = describeMoves(base) + ' Les déplacements suivent les numéros de table, en boucle.'
    if (exceptions) details.exceptions = exceptions.split(/;\s*(?=Manche\s)/).map(exception => {
      const [round, moves] = exception.split(': ')
      return `Vers la ${round.toLowerCase()} : ${describeMoves(moves)}`
    })
  }
  if (mode === 'morts') details.note = 'Les morts restent au Nord ; les places sont ajustées si nécessaire.'
  return details
}

export function createPlan(count, rounds, mode, exclusions = []) {
  const option = optionsFor(count).find(option => option.value === mode && !option.disabled)
  if (!option) throw new Error('Choisissez une répartition disponible pour cet effectif.')
  const limit = maxRounds(count, mode)
  if (!Number.isInteger(rounds) || rounds < 1 || rounds > limit) throw new Error(`Ce mouvement permet de 1 à ${limit} manches.`)
  if (!Array.isArray(exclusions)) throw new Error('Choisissez les exclus manche par manche.')
  let base = initialPlayers(count, mode)
  let rotations
  const excluded = []
  if (mode === 'excluded') {
    rotations = {}
    const reserved = count - 1
    for (let r = 0; r < rounds; r++) {
      const id = exclusions[r] ?? null
      if (id !== null && (!Number.isInteger(id) || id < 1 || id > count)) throw new Error(`Choisissez un joueur de 1 à ${count} pour la manche ${r + 1}.`)
      excluded.push(id)
      if (id === null) {
        rotations[`Manche ${r + 1}`] = []
        continue
      }
      const index = base.findIndex(p => p.id === id)
      ;[base[reserved], base[index]] = [base[index], base[reserved]]
      const active = computeActiveFromBase(base, reserved, `Joueur ${id}`)
      rotations[`Manche ${r + 1}`] = calculRotationsRainbow(active, 1)['Manche 1']
    }
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
