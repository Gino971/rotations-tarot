// Build each round independently of the requested total, preserving its prefix.
// Tables of five prioritize repeats; tables with morts prioritize balanced visits.
// Several deterministic starts and local swaps then reduce repeated encounters.
export function optimizeRotations(rotations, count) {
  const source = Object.values(rotations).map(tables => tables.map(table => ({ ...table, joueurs: table.joueurs.map(({ nom, numero, id }) => ({ nom, numero, id })) })))
  const types = source[0].map(t => t.joueurs.some(p => p.id === null) ? 3 : t.joueurs.length)
  if (source[0].length < 2) return rotations
  if (count === 9 && types.length === 2 && types.includes(4) && types.includes(5)) return optimizeNinePlayers(source, playersForNine(source))
  const meetingsFirst = types.includes(5) && !source[0].some(table => table.joueurs.some(player => player.id === null))
  const categories = [...new Set(types.filter(t => t !== 4))].sort((a, b) => a - b)
  const visits = Object.fromEntries(categories.map(type => [type, new Uint8Array(count + 1)]))
  const meetings = new Uint8Array((count + 1) ** 2)
  const players = source[0].flatMap(t => t.joueurs).filter(p => p.id !== null).sort((a, b) => a.id - b.id)
  const result = {}
  // Match the displayed metric: each encounter after the first is a repeat.
  // Meeting frequency is only a tie-breaker, not the primary objective.
  const weight = (a, b) => {
    const previous = meetings[a.id * (count + 1) + b.id]
    return previous ? (meetingsFirst ? 1000000000 : 1000000) + previous : 0
  }
  const balanced = groups => categories.every(type => {
    const next = Array.from(visits[type].slice(1))
    groups.forEach((group, table) => { if (types[table] === type) for (const p of group) next[p.id - 1]++ })
    return Math.max(...next) - Math.min(...next) <= 1
  })
  const fairness = groups => categories.reduce((sum,type) => {
    const next = Array.from(visits[type])
    groups.forEach((group,table) => { if(types[table] === type) for(const player of group) next[player.id]++ })
    return sum + next.reduce((total,value)=>total+value*value,0)
  },0)
  const score = groups => groups.reduce((sum, group) => sum + group.reduce((s, a, i) => s + group.slice(i + 1).reduce((v, b) => v + weight(a, b), 0), 0), 0) + (meetingsFirst ? fairness(groups)*10000 : 0)
  for (let round = 0; round < source.length; round++) {
    let best, bestScore = Infinity
    const minimumFairness = categories.reduce((sum,type) => {
      const total = visits[type].reduce((value,n)=>value+n,0) + source[0].filter((_,index)=>types[index] === type).reduce((value,table)=>value+table.joueurs.filter(player=>player.id!==null).length,0)
      const base = Math.floor(total/count), extra = total%count
      return sum + (count-extra)*base*base + extra*(base+1)**2
    },0)
    const minimumScore = meetingsFirst ? minimumFairness*10000 : 0
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
      if (meetingsFirst || balanced(original)) { best = original; bestScore = score(original) }
      for (let attempt = 0; attempt < 16 && bestScore > minimumScore; attempt++) {
      let seed = (count * 65537 + round * 997 + attempt * 7919) >>> 0
      const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
      let pool = players.map(player => ({ player, tie: random() }))
      const groups = types.map(() => [])
      // There is only one special category alongside tables of four, except
      // at eleven players where the five/six categories are complements.
      for (const type of [...categories, 4]) {
        if (type !== 4 && (!meetingsFirst || attempt % 2 === 0)) pool.sort((a, b) => visits[type][a.player.id] - visits[type][b.player.id] || a.tie - b.tie)
        else pool.sort((a, b) => a.tie - b.tie)
        for (let table = 0; table < types.length; table++) if (types[table] === type) {
          const size = source[0][table].joueurs.filter(p => p.id !== null).length
          groups[table] = pool.splice(0, size).map(entry => entry.player)
        }
      }
      // For morts, preserve visit balance. For tables of five, let repeat
      // reduction override visit balance, which is a secondary score.
      for (let step = 0; step < Math.min(6000, count * 60); step++) {
        const ta = Math.floor(random() * groups.length), tb = Math.floor(random() * groups.length)
        if (ta === tb) continue
        const ia = Math.floor(random() * groups[ta].length), ib = Math.floor(random() * groups[tb].length)
        const a = groups[ta][ia], b = groups[tb][ib]
        if (!meetingsFirst && types[ta] !== types[tb] && [types[ta], types[tb]].some(type => type !== 4 && visits[type][a.id] !== visits[type][b.id])) continue
        let delta = 0
        for (const p of groups[ta]) if (p !== a) delta += weight(b, p) - weight(a, p)
        for (const p of groups[tb]) if (p !== b) delta += weight(a, p) - weight(b, p)
        if (meetingsFirst && types[ta] !== types[tb]) for(const type of categories) {
          const va = visits[type][a.id], vb = visits[type][b.id]
          const atA = Number(types[ta] === type), atB = Number(types[tb] === type)
          delta += ((va+atB)**2 + (vb+atA)**2 - (va+atA)**2 - (vb+atB)**2)*10000
        }
        if (delta < 0) { groups[ta][ia] = b; groups[tb][ib] = a }
      }
      const value = score(groups)
      if (value < bestScore) { best = groups; bestScore = value }
      if (value === minimumScore) break
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

function playersForNine(source) {
  return source[0].flatMap(table => table.joueurs).sort((a,b) => a.id-b.id)
}
// For two tables at nine players, examine every possible five-player group.
// Repeats take priority, then visits to the table of five, then meeting frequency.
function optimizeNinePlayers(source, players) {
  const partitions = []
  for (let mask=0; mask<512; mask++) {
    const five = players.filter((_,index) => mask & (1<<index))
    if (five.length === 5) partitions.push([players.filter((_,index) => !(mask & (1<<index))),five])
  }
  const meetings = new Uint8Array(100), visits = new Uint8Array(10), result = {}
  const fourIndex = source[0].findIndex(table => table.joueurs.length === 4)
  for (let round=0; round<source.length; round++) {
    let chosen, best = Infinity
    if(round===0) chosen = [source[0][fourIndex].joueurs,source[0][1-fourIndex].joueurs]
    else for(const groups of partitions) {
      let repeats=0, frequency=0
      for(const group of groups) for(let i=0;i<group.length;i++) for(let j=i+1;j<group.length;j++) {
        const previous = meetings[group[i].id*10+group[j].id]
        if(previous) repeats++
        frequency += previous
      }
      const next = players.map(player=>visits[player.id]+Number(groups[1].some(p=>p.id===player.id)))
      const fairness = next.reduce((sum,value)=>sum+value*value,0)
      const score = repeats*1000000+fairness*1000+frequency
      if(score<best) {best=score;chosen=groups}
    }
    for(const player of chosen[1]) visits[player.id]++
    for(const group of chosen) for(const a of group) for(const b of group) if(a!==b) meetings[a.id*10+b.id]++
    result[`Manche ${round+1}`] = source[0].map((table,index)=>({...table,joueurs:chosen[index===fourIndex?0:1]}))
  }
  return result
}
