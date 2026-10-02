// Build each round independently of the requested total, preserving its prefix.
// Special tables are filled by the players with the fewest previous visits.
// Several deterministic starts and local swaps then reduce repeated encounters.
export function optimizeRotations(rotations, count) {
  const source = Object.values(rotations).map(tables => tables.map(table => ({ ...table, joueurs: table.joueurs.map(({ nom, numero, id }) => ({ nom, numero, id })) })))
  const types = source[0].map(t => t.joueurs.some(p => p.id === null) ? 3 : t.joueurs.length)
  if (source[0].length < 2) return rotations
  const categories = [...new Set(types.filter(t => t !== 4))].sort((a, b) => a - b)
  const visits = Object.fromEntries(categories.map(type => [type, new Uint8Array(count + 1)]))
  const meetings = new Uint8Array((count + 1) ** 2)
  const players = source[0].flatMap(t => t.joueurs).filter(p => p.id !== null).sort((a, b) => a.id - b.id)
  const result = {}
  // Match the displayed metric: each encounter after the first is a repeat.
  // Meeting frequency is only a tie-breaker, not the primary objective.
  const weight = (a, b) => {
    const previous = meetings[a.id * (count + 1) + b.id]
    return previous ? 1000000 + previous : 0
  }
  const balanced = groups => categories.every(type => {
    const next = Array.from(visits[type].slice(1))
    groups.forEach((group, table) => { if (types[table] === type) for (const p of group) next[p.id - 1]++ })
    return Math.max(...next) - Math.min(...next) <= 1
  })
  const score = groups => groups.reduce((sum, group) => sum + group.reduce((s, a, i) => s + group.slice(i + 1).reduce((v, b) => v + weight(a, b), 0), 0), 0)
  for (let round = 0; round < source.length; round++) {
    let best, bestScore = Infinity
    if (round === 0) best = source[0].map(t => t.joueurs.filter(p => p.id !== null))
    else {
      // Howell can move a mort to a different numbered table. Match table
      // categories before comparing or reusing its player groups.
      const byType = new Map()
      for (const table of source[round]) {
        const type = table.joueurs.some(p => p.id === null) ? 3 : table.joueurs.length
        if (!byType.has(type)) byType.set(type, [])
        byType.get(type).push(table.joueurs.filter(p => p.id !== null))
      }
      const original = types.map(type => byType.get(type).shift())
      if (balanced(original)) { best = original; bestScore = score(original) }
      for (let attempt = 0; attempt < 16 && bestScore > 0; attempt++) {
      let seed = (count * 65537 + round * 997 + attempt * 7919) >>> 0
      const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
      let pool = players.map(player => ({ player, tie: random() }))
      const groups = types.map(() => [])
      // There is only one special category alongside tables of four, except
      // at eleven players where the five/six categories are complements.
      for (const type of [...categories, 4]) {
        if (type !== 4) pool.sort((a, b) => visits[type][a.player.id] - visits[type][b.player.id] || a.tie - b.tie)
        else pool.sort((a, b) => a.tie - b.tie)
        for (let table = 0; table < types.length; table++) if (types[table] === type) {
          const size = source[0][table].joueurs.filter(p => p.id !== null).length
          groups[table] = pool.splice(0, size).map(entry => entry.player)
        }
      }
      // Exchanges between different categories are allowed only at equal
      // prior visit counts, so no swap can undo the balanced allocation.
      for (let step = 0; step < Math.min(6000, count * 60); step++) {
        const ta = Math.floor(random() * groups.length), tb = Math.floor(random() * groups.length)
        if (ta === tb) continue
        const ia = Math.floor(random() * groups[ta].length), ib = Math.floor(random() * groups[tb].length)
        const a = groups[ta][ia], b = groups[tb][ib]
        if (types[ta] !== types[tb] && [types[ta], types[tb]].some(type => type !== 4 && visits[type][a.id] !== visits[type][b.id])) continue
        let delta = 0
        for (const p of groups[ta]) if (p !== a) delta += weight(b, p) - weight(a, p)
        for (const p of groups[tb]) if (p !== b) delta += weight(a, p) - weight(b, p)
        if (delta < 0) { groups[ta][ia] = b; groups[tb][ib] = a }
      }
      const value = score(groups)
      if (value < bestScore) { best = groups; bestScore = value }
      if (value === 0) break
      }
    }
    result[`Manche ${round + 1}`] = best.map((group, table) => {
      for (const a of group) {
        if (types[table] !== 4) visits[types[table]][a.id]++
        for (const b of group) if (a !== b) meetings[a.id * (count + 1) + b.id]++
      }
      const mort = source[0][table].joueurs.find(p => p.id === null)
      return { table: table + 1, joueurs: mort ? [mort, ...group] : group }
    })
  }
  return result
}
