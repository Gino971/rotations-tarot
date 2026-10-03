import { optionsFor, normalizeExclusions, maxRounds, movementDetails, createPlan, encountersFor, tableVisitsFor, drawSlotsFor, drawGroupSizesFor, positionsFor, seats } from './engine.js?v=50'

const $ = id => document.getElementById(id)
const storageKey = 'rotations-tarot-v1'
let plan = null
let mode = 'normal'
let view = 'player'
let round = 0
let selectedPlayer = 0
let manualExclusions = []
let drawSeed = null
let manualDrawOrder = null
let chipDrag = null
let selectedChip = null
let drawing = false
let drawAudio = null
let drawSound = true
let showDrawResult = false
const chipSuits = new Map()

for (let count = 4; count <= 400; count++) $('count').add(new Option(`${count} joueurs`, count))
$('count').value = '16'

function updateOptions() {
  const count = Number($('count').value)
  const options = optionsFor(count)
  if (!options.some(option => option.value === mode && !option.disabled)) mode = options.find(option => !option.disabled)?.value || ''
  $('modes').replaceChildren()
  for (const option of options) {
    const label = document.createElement('label')
    label.className = 'mode-option'
    const input = document.createElement('input')
    input.type = 'radio'; input.name = 'mode'; input.value = option.value
    input.checked = mode === option.value; input.disabled = !!option.disabled
    const text = document.createElement('span')
    const title = document.createElement('strong'); title.textContent = option.label
    text.append(title); label.append(input, text); $('modes').append(label)
    input.addEventListener('change', () => { mode = input.value; updateOptions(); recalculate() })
  }
  $('mode-field').hidden = options.length === 1
  $('excluded-field').hidden = mode !== 'excluded'
  const old = Number($('rounds').value) || 4
  const limit = options.length ? maxRounds(count, mode) : 7
  $('rounds').replaceChildren()
  for (let i = 1; i <= limit; i++) $('rounds').add(new Option(`${i} manche${i > 1 ? 's' : ''}`, i))
  $('rounds').value = String(Math.min(old, limit))
  renderMovementDetails(count)
  renderExclusionSelectors()
}

function renderMovementDetails(count) {
  const info = movementDetails(count, mode)
  const container = $('movement-info')
  container.replaceChildren()
  const summary = document.createElement('p')
  summary.className = 'movement-summary'
  summary.textContent = `${info.tables} table${info.tables > 1 ? 's' : ''} · ${info.limit} rotations maximum${info.limit === 7 ? ' dans l’app' : ''}`
  const title = document.createElement('strong')
  title.textContent = info.label
  const description = document.createElement('p')
  description.textContent = info.description
  container.append(summary, title, description)
  if (info.exceptions.length) {
    const list = document.createElement('ul')
    for (const exception of info.exceptions) {
      const item = document.createElement('li')
      item.textContent = exception; list.append(item)
    }
    container.append(list)
  }
  if (info.note) {
    const note = document.createElement('p')
    note.textContent = info.note; container.append(note)
  }
}

function renderExclusionSelectors() {
  $('exclusion-selectors').replaceChildren()
  if (mode !== 'excluded') return
  const count = Number($('count').value)
  const rounds = Number($('rounds').value)
  manualExclusions = normalizeExclusions(count, manualExclusions, rounds)
  const used = new Set()
  for (let index = 0; index < rounds; index++) {
    if (manualExclusions[index] > count) manualExclusions[index] = null
    const label = document.createElement('label')
    label.textContent = `Manche ${index + 1}`
    const select = document.createElement('select')
    select.setAttribute('aria-label', `Exclu de la manche ${index + 1}`)
    select.add(new Option('—', ''))
    for (let id = 1; id <= count; id++) if (!used.has(id)) select.add(new Option(`J${id}`, id))
    select.value = manualExclusions[index] ? String(manualExclusions[index]) : ''
    if (manualExclusions[index]) used.add(manualExclusions[index])
    select.addEventListener('change', () => { manualExclusions[index] = select.value ? Number(select.value) : null; round = index; recalculate() })
    label.append(select); $('exclusion-selectors').append(label)
  }
}

function persist() {
  try {
    localStorage.setItem(storageKey, JSON.stringify({ count: plan.count, rounds: plan.rounds, mode: plan.mode, exclusions: manualExclusions, drawSeed, manualDrawOrder, drawSound: drawSound, view, round, selectedPlayer }))
  } catch { /* Device storage may be unavailable. */ }
}

const pages = { reglages: 'Réglages', placements: 'Placements', rencontres: 'Rencontres' }

function showPage(focus = false) {
  const requested = location.hash.slice(1)
  const page = Object.hasOwn(pages, requested) ? requested : 'reglages'
  if (page !== 'reglages' && !plan) { location.hash = 'reglages'; return }
  $('setup').hidden = page !== 'reglages'
  $('results').hidden = page !== 'placements'
  $('encounters').hidden = page !== 'rencontres'
  $('page-title').textContent = pages[page]
  document.title = `${pages[page]} · Rotations tarot`
  for (const link of document.querySelectorAll('[data-page]')) {
    if (link.dataset.page === page) link.setAttribute('aria-current', 'page')
    else link.removeAttribute('aria-current')
  }
  if (focus) { $('page-title').focus(); window.scrollTo(0, 0) }
}

function showPlan() {
  $('draw-status').textContent = manualDrawOrder !== null ? 'Placement manuel enregistré.' : drawSeed === null ? 'Première manche : ordre des numéros.' : 'Tirage enregistré pour ce tournoi.'
  renderDrawOrder()
  $('tournament-summary').textContent = `${plan.count} joueurs · ${plan.rounds} manches · ${optionsFor(plan.count).find(option => option.value === plan.mode).label}`
  renderPlayers(); renderRound(); renderEncounters(); selectView(view); persist(); showPage()
}

function renderEncounters() {
  const rows = encountersFor(plan), visits = tableVisitsFor(plan)
  const pending = plan.excluded.some(id => id === null)
  $('encounters-note').textContent = `J7 (3) = trois manches à la même table que le joueur 7. Exempts compris, morts exclus.${pending ? ' Les manches sans exclu choisi ne sont pas comptées.' : ''}`
  const summary = $('encounters-summary')
  summary.replaceChildren()
  const repeats = rows.reduce((sum, row) => sum + row.reduce((s, player) => s + player.times - 1, 0), 0) / 2
  const parts = [`${repeats} rencontre${repeats > 1 ? 's' : ''} répétée${repeats > 1 ? 's' : ''} au total`]
  for (const [key, label] of [['mort', 'Tables avec mort'], ['five', 'Tables de cinq']]) {
    const values = visits.map(v => v[key])
    if (Math.max(...values)) parts.push(`${label} : ${Math.min(...values)} à ${Math.max(...values)} passages par joueur`)
  }
  for (const part of parts) { const p = document.createElement('p'); p.textContent = part; summary.append(p) }
  const container = $('encounter-cards')
  container.replaceChildren()
  for (const [index, row] of rows.entries()) {
    const card = document.createElement('article'); card.className = 'encounter-card'
    const title = document.createElement('h3'); title.textContent = `Joueur ${index + 1}`
    const list = document.createElement('p'); list.className = 'encounter-list'
    list.textContent = row.length ? row.map(({ id, times }) => `J${id} (${times})`).join(', ') : 'Aucune rencontre'
    const total = document.createElement('p'); total.className = 'encounter-meta'
    const repeated = row.reduce((sum, encounter) => sum + encounter.times - 1, 0)
    total.textContent = `${row.length} joueurs rencontrés · ${repeated} rencontre${repeated > 1 ? 's' : ''} répétée${repeated > 1 ? 's' : ''}`
    card.append(title, list, total)
    if (plan.mode === 'morts' || plan.mode === 'mixed') {
      const passage = document.createElement('p'); passage.className = 'encounter-meta'
      passage.textContent = plan.mode === 'morts' ? `Tables avec mort : ${visits[index].mort} passages` : `Tables de cinq : ${visits[index].five} passages`
      card.append(passage)
    }
    container.append(card)
  }
}

function renderNavigation() {
  const playerView = view === 'player'
  const select = $('current-placement')
  select.replaceChildren()
  select.setAttribute('aria-label', playerView ? 'Joueur' : 'Manche')
  if (playerView) select.add(new Option('Tous', 0))
  const total = playerView ? plan.count : plan.rounds
  for (let i = 1; i <= total; i++) {
    const option = new Option(String(i), i)
    option.setAttribute('aria-label', `${playerView ? 'Joueur' : 'Manche'} ${i}`)
    select.add(option)
  }
  select.value = String(playerView ? selectedPlayer : round + 1)
  $('previous').setAttribute('aria-label', playerView ? 'Joueur précédent' : 'Manche précédente')
  $('next').setAttribute('aria-label', playerView ? 'Joueur suivant' : 'Manche suivante')
  updateNavigationButtons()
}

function updateNavigationButtons() {
  const current = view === 'player' ? selectedPlayer : round
  const last = view === 'player' ? plan.count : plan.rounds - 1
  $('previous').disabled = current === 0
  $('next').disabled = current === last
}

function changePlacement(value) {
  if (view === 'player') { selectedPlayer = value; renderPlayers() }
  else { round = value - 1; renderRound() }
  $('current-placement').value = String(value)
  updateNavigationButtons(); persist()
}

function renderPlayers() {
  $('player-cards').replaceChildren()
  for (let id = 1; id <= plan.count; id++) {
    if (selectedPlayer && selectedPlayer !== id) continue
    const card = document.createElement('article'); card.className = 'player-card'
    card.innerHTML = `<h3 class="player-card-header">Joueur ${id}</h3><div class="itinerary">${positionsFor(plan, id).map((position, index) => `<div class="position-row"><span>Manche ${index + 1}</span>${position.pending ? '<span>À définir</span>' : position.excluded ? '<span class="excluded-label">Exclu</span>' : `<span class="destination">Table ${position.table}<span class="seat-badge">${position.seat}</span></span>`}</div>`).join('')}</div>`
    $('player-cards').append(card)
  }
  if (!$('player-cards').children.length) {
    const message = document.createElement('p'); message.textContent = 'Joueur introuvable'; $('player-cards').append(message)
  }
}

function renderRound() {
  for (const [index, label] of [...$('exclusion-selectors').children].entries()) label.classList.toggle('current-round', index === round)
  const tables = Object.values(plan.rotations)[round]
  buildDrawTables(tables, $('table-cards'))
}

function selectView(nextView) {
  view = nextView
  $('player-view').hidden = view !== 'player'; $('round-view').hidden = view !== 'round'
  for (const name of ['player', 'round']) {
    $(`by-${name}`).classList.toggle('active', name === view)
    $(`by-${name}`).setAttribute('aria-selected', String(name === view))
    $(`by-${name}`).tabIndex = name === view ? 0 : -1
  }
  if (plan) { renderNavigation(); persist() }
}

function recalculate() {
  try {
    renderExclusionSelectors()
    plan = createPlan(Number($('count').value), Number($('rounds').value), mode, manualExclusions, true, drawSeed, manualDrawOrder)
    round = Math.min(round, plan.rounds - 1)
    if (selectedPlayer > plan.count) selectedPlayer = 0
    $('error').textContent = ''; showPlan()
  } catch (error) { $('error').textContent = error.message; plan = null; $('tournament-summary').textContent = ''; location.hash = 'reglages'; showPage() }
}

$('count').addEventListener('change', () => { manualExclusions = []; drawSeed = null; manualDrawOrder = null; showDrawResult = false; chipSuits.clear(); updateOptions(); recalculate() })
$('rounds').addEventListener('change', () => { manualExclusions = manualExclusions.slice(0, Number($('rounds').value)); renderExclusionSelectors(); recalculate() })
function buildDrawChips(order, container) {
  selectedChip = null
  container.replaceChildren()
  let group, groupIndex = -1, groupStart = 0, groupEnd = 0
  const sizes = drawGroupSizesFor(Number($('count').value), mode, manualExclusions)
  for (const [index, id] of order.entries()) {
    if (index === groupEnd) {
      groupIndex++; groupStart = index; groupEnd = index + sizes[groupIndex]
      group = document.createElement('div'); group.className = 'chip-group'
      group.setAttribute('role', 'group')
      group.dataset.size = sizes[groupIndex]
      group.style.gridTemplateColumns = `repeat(${sizes[groupIndex] === 6 ? 3 : sizes[groupIndex]}, minmax(0, 1fr))`
      group.setAttribute('aria-label', mode === 'excluded' && groupIndex === sizes.length - 1 ? 'Joueur exclu' : `Table ${groupIndex + 1}`)
      container.append(group)
    }
    const excluded = mode === 'excluded' && id === manualExclusions[0]
    const slot = document.createElement('div'); slot.className = 'chip-slot'
    if (id !== null && !excluded) slot.dataset.slot = index
    else slot.classList.add('fixed-chip-slot')
    const chip = document.createElement('span'); chip.className = 'draw-player draw-chip'; chip.dataset.player = id === null ? 'mort' : id
    if (id !== null && !excluded) { chip.tabIndex = 0; chip.setAttribute('role', 'button'); chip.setAttribute('aria-pressed', 'false'); chip.title = 'Toucher deux jetons ou les faire glisser pour échanger les places' }
    chip.setAttribute('aria-label', id === null ? 'Mort au Nord' : excluded ? `Joueur ${id} exclu` : `Joueur ${id}`)
    if (!chipSuits.has(id)) {
      const random = new Uint32Array(1); crypto.getRandomValues(random)
      chipSuits.set(id, ['♠', '♥', '♦', '♣'][random[0] % 4])
    }
    const suit = chipSuits.get(id)
    const diamond = document.createElement('span'); diamond.className = `chip-suit ${suit === '♥' || suit === '♦' ? 'red' : 'black'}`; diamond.textContent = suit; diamond.setAttribute('aria-hidden', 'true')
    const number = document.createElement('span'); number.className = 'chip-number'; number.textContent = id
    if (id === null) {
      chip.classList.add('mort-chip')
      chip.innerHTML = '<svg viewBox="0 0 32 32" class="special-chip-icon" aria-hidden="true"><path d="M7 18C1 6 9 2 16 2s15 4 9 16l-3 3v7H10v-7Z" fill="currentColor"/><circle cx="11" cy="13" r="3" fill="#fff8e9"/><circle cx="21" cy="13" r="3" fill="#fff8e9"/><path d="m16 17-2 4h4Z" fill="#fff8e9"/><path d="M13 25v4m6-4v4" stroke="#fff8e9" stroke-width="2"/></svg>'
    } else if (excluded) {
      chip.classList.add('excluded-chip')
      chip.innerHTML = '<svg viewBox="0 0 32 32" class="special-chip-icon" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><circle cx="16" cy="9" r="4"/><path d="M7 25c0-10 18-10 18 0M4 4l24 24"/></svg>'
      number.className = 'excluded-chip-number'; chip.append(number)
    } else chip.append(number, diamond)
    const position = document.createElement('span'); position.className = 'chip-position'; position.textContent = excluded ? 'Exclu' : ['N', 'S', 'E', 'O', 'X1', 'X2'][index - groupStart]
    position.setAttribute('aria-label', excluded ? 'Exclu' : seats[index - groupStart])
    slot.append(chip, position); group.append(slot)
  }
}

function renderDrawOrder() {
  if (drawing) return
  $('draw-result').hidden = false
  buildDrawChips(drawSlotsFor(plan.count, mode, manualExclusions, showDrawResult ? drawSeed : null, showDrawResult ? manualDrawOrder : null), $('draw-order'))
}

function exchangeChips(firstId, secondId) {
  if (drawing || firstId === secondId) return
  const chips = [...$('draw-order').querySelectorAll('[data-player]')]
  const order = chips.map(chip => chip.dataset.player === 'mort' ? null : Number(chip.dataset.player))
  const a = order.indexOf(firstId), b = order.indexOf(secondId)
  if (a < 0 || b < 0 || !chips[a].parentElement.hasAttribute('data-slot') || !chips[b].parentElement.hasAttribute('data-slot')) return
  ;[order[a], order[b]] = [order[b], order[a]]
  const canonical = drawSlotsFor(plan.count, mode, manualExclusions)
  const mapped = Array.from({ length: plan.count }, (_, index) => index + 1)
  canonical.forEach((id, index) => { if (id !== null) mapped[id - 1] = order[index] })
  manualDrawOrder = mapped
  showDrawResult = true
  recalculate()
}

function startChipDrag(event) {
  const chip = event.target.closest('.draw-player')
  if (drawing || chipDrag || !chip || !chip.parentElement.hasAttribute('data-slot') || event.button !== 0) return
  event.preventDefault()
  chipDrag = { container: event.currentTarget, chip, id: Number(chip.dataset.player), pointer: event.pointerId, x: event.clientX, y: event.clientY, ghost: null, target: null }
  chip.setPointerCapture(event.pointerId)
}
$('draw-order').addEventListener('pointerdown', startChipDrag)
$('table-cards').addEventListener('pointerdown', startChipDrag)
document.addEventListener('pointermove', event => {
  if (!chipDrag || event.pointerId !== chipDrag.pointer) return
  if (!chipDrag.ghost && Math.hypot(event.clientX - chipDrag.x, event.clientY - chipDrag.y) < 6) return
  if (!chipDrag.ghost) {
    chipDrag.ghost = chipDrag.chip.cloneNode(true)
    chipDrag.ghost.classList.add('chip-drag-ghost'); chipDrag.ghost.removeAttribute('tabindex'); chipDrag.ghost.setAttribute('aria-hidden', 'true')
    document.body.append(chipDrag.ghost); chipDrag.chip.classList.add('chip-drag-source')
  }
  chipDrag.ghost.style.left = `${event.clientX}px`; chipDrag.ghost.style.top = `${event.clientY}px`
  chipDrag.target?.classList.remove('chip-drop-target')
  chipDrag.target = chipDropTarget(event.clientX, event.clientY, chipDrag.chip)
  chipDrag.target?.classList.add('chip-drop-target')
})
function chipDropTarget(x, y, source) {
  // Accept the entire destination slot, including its symbol, number and label.
  // Hit-testing geometry also avoids pointer-capture and floating-clone issues.
  for (const slot of chipDrag.container.querySelectorAll('[data-slot]')) {
    const bounds = slot.getBoundingClientRect()
    const token = slot.querySelector('.draw-player')
    if (token !== source && x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom) return token
  }
  return null
}
function endChipDrag(event) {
  if (!chipDrag || event.pointerId !== chipDrag.pointer) return
  const drag = chipDrag
  if (event.type === 'pointerup') drag.target = chipDropTarget(event.clientX, event.clientY, drag.chip)
  chipDrag = null
  drag.ghost?.remove(); drag.chip.classList.remove('chip-drag-source'); drag.target?.classList.remove('chip-drop-target')
  if (drag.chip.hasPointerCapture(event.pointerId)) drag.chip.releasePointerCapture(event.pointerId)
  if (event.type === 'pointerup') {
    if (drag.ghost && drag.target) exchangeChips(drag.id, Number(drag.target.dataset.player))
    else if (!drag.ghost) selectChipForExchange(drag.chip)
  }
}
document.addEventListener('pointerup', endChipDrag)
document.addEventListener('pointercancel', endChipDrag)
function clearChipSelection() {
  selectedChip = null
  for (const chip of document.querySelectorAll('#draw-order .chip-selected, #table-cards .chip-selected')) {
    chip.classList.remove('chip-selected')
    chip.setAttribute('aria-pressed', 'false')
  }
}
function selectChipForExchange(chip) {
  if (drawing || !chip.parentElement.hasAttribute('data-slot')) return
  const id = Number(chip.dataset.player)
  if (selectedChip === id) { clearChipSelection(); return }
  if (selectedChip !== null) {
    const first = selectedChip
    clearChipSelection()
    exchangeChips(first, id)
  } else {
    selectedChip = id
    chip.classList.add('chip-selected')
    chip.setAttribute('aria-pressed', 'true')
  }
}
function handleChipKey(event) {
  const chip = event.target.closest('.draw-player')
  if (event.key === 'Escape') { clearChipSelection(); return }
  if (drawing || !chip || !chip.parentElement.hasAttribute('data-slot') || !['Enter', ' '].includes(event.key)) return
  event.preventDefault()
  const id = Number(chip.dataset.player)
  selectChipForExchange(chip)
  event.currentTarget.querySelector(`[data-player="${id}"]`)?.focus()
}
$('draw-order').addEventListener('keydown', handleChipKey)
$('table-cards').addEventListener('keydown', handleChipKey)

function buildDrawTables(tables, container) {
  clearChipSelection()
  container.replaceChildren()
  for (const table of tables) {
    const card = document.createElement('article'); card.className = 'table-card'
    card.setAttribute('aria-label', `Table ${table.table}`)
    const layout = document.createElement('div'); layout.className = 'table-layout'
    const extras = document.createElement('div'); extras.className = 'extra-seats'
    for (const [index, player] of table.joueurs.entries()) {
      const seat = document.createElement('div'); seat.className = `seat ${['north', 'south', 'east', 'west'][index] || ''}`
      const label = document.createElement('small'); label.textContent = seats[index]
      const token = document.createElement('strong'); token.className = 'draw-player'
      token.textContent = player.id === null ? 'Mort' : `J${player.id}`
      if (player.id !== null && round === 0) {
        seat.dataset.slot = `${table.table}:${index}`; token.dataset.player = player.id
        token.tabIndex = 0; token.setAttribute('role', 'button'); token.setAttribute('aria-label', `Joueur ${player.id}`)
        token.setAttribute('aria-pressed', 'false'); token.title = 'Toucher deux joueurs ou les faire glisser pour échanger les places'
      }
      seat.append(label, token); (index < 4 ? layout : extras).append(seat)
    }
    const center = document.createElement('span'); center.className = 'table-center'; center.setAttribute('aria-hidden', 'true')
    const spade = document.createElement('span'); spade.className = 'table-spade'; spade.textContent = '♠'
    const number = document.createElement('span'); number.className = 'table-number'; number.textContent = table.table
    center.append(spade, number); layout.append(center)
    card.append(layout)
    if (extras.children.length) card.append(extras)
    container.append(card)
  }
}

async function moveDrawPlayers(moves, reduced, duration) {
  const rectangles = moves.map(([token, destination]) => {
    const from = token.getBoundingClientRect(), to = destination.querySelector('.draw-player').getBoundingClientRect()
    return { token, destination, dx: to.x - from.x, dy: to.y - from.y }
  })
  if (!reduced) await Promise.all(rectangles.map(({ token, dx, dy }) => {
    token.classList.add('moving')
    return token.animate([{ transform: 'translate(0, 0)' }, { transform: `translate(${dx}px, ${dy}px)` }], { duration, easing: 'ease-in-out' }).finished.catch(() => {})
  }))
  else await new Promise(resolve => setTimeout(resolve, duration))
  rectangles.forEach(({ token, destination }) => { token.classList.remove('moving'); destination.append(token) })
}

function drawTone(frequency, duration = 0.05, delay = 0) {
  if (!drawAudio || drawAudio.state !== 'running' || !drawSound) return
  const oscillator = drawAudio.createOscillator(), volume = drawAudio.createGain()
  const start = drawAudio.currentTime + delay
  oscillator.type = 'sine'; oscillator.frequency.value = frequency
  volume.gain.setValueAtTime(0, start)
  volume.gain.linearRampToValueAtTime(0.045, start + 0.01)
  volume.gain.exponentialRampToValueAtTime(0.001, start + duration)
  oscillator.connect(volume); volume.connect(drawAudio.destination)
  oscillator.start(start); oscillator.stop(start + duration + 0.02)
  oscillator.onended = () => { oscillator.disconnect(); volume.disconnect() }
}

function renderSoundToggle() {
  const button = $('draw-sound')
  button.setAttribute('aria-pressed', String(drawSound))
  button.setAttribute('aria-label', drawSound ? 'Couper le son du tirage' : 'Activer le son du tirage')
  button.title = drawSound ? 'Couper le son' : 'Activer le son'
}
$('draw-sound').addEventListener('click', () => { drawSound = !drawSound; renderSoundToggle(); if (plan) persist() })
function confirmRedraw() {
  const dialog = $('redraw-dialog')
  return new Promise(resolve => {
    dialog.returnValue = 'cancel'
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once: true })
    dialog.showModal()
  })
}
$('draw').addEventListener('click', async () => {
  if (drawing) return
  drawing = true
  if ((drawSeed !== null || manualDrawOrder !== null) && !(await confirmRedraw())) { drawing = false; return }
  const controls = [...$('setup-form').querySelectorAll('button, select, input')].filter(control => control.id !== 'draw-sound')
  const previous = controls.map(control => control.disabled)
  controls.forEach(control => { control.disabled = true })
  $('draw-result').hidden = false
  $('draw-status').textContent = 'Tirage en cours…'
  $('draw').textContent = 'Tirage en cours…'
  try {
    if (drawSound) {
      try {
        const Audio = window.AudioContext || window.webkitAudioContext
        if (Audio) { drawAudio ||= new Audio(); await drawAudio.resume() }
      } catch { /* The visual draw remains available if audio is blocked. */ }
    }
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const count = Number($('count').value)
    const seed = new Uint32Array(1); crypto.getRandomValues(seed)
    const finalOrder = drawSlotsFor(count, mode, manualExclusions, seed[0])
    const startingOrder = drawSlotsFor(count, mode, manualExclusions, drawSeed, manualDrawOrder)
    const visibleOrder = [...$('draw-order').querySelectorAll('[data-player]')].map(token => token.dataset.player === 'mort' ? null : Number(token.dataset.player))
    if (visibleOrder.length !== startingOrder.length || visibleOrder.some((id, index) => id !== startingOrder[index])) buildDrawChips(startingOrder, $('draw-order'))
    await new Promise(resolve => setTimeout(resolve, 600))
    $('draw-status').textContent = 'Mélange des jetons…'
    const slots = [...$('draw-order').querySelectorAll('[data-slot]')]
    const started = performance.now()
    while (performance.now() - started < 4500) {
      const shuffled = [...slots]
      const choices = new Uint32Array(count); crypto.getRandomValues(choices)
      for (let i = slots.length - 1; i > 0; i--) {
        const j = choices[i] % (i + 1)
        ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
      }
      const moves = slots.map((slot, index) => [slot.querySelector('.draw-player'), shuffled[index]])
      await moveDrawPlayers(moves, reduced, 220)
      drawTone(400 + choices[0] % 300)
      await new Promise(resolve => setTimeout(resolve, 70))
    }
    const tokens = new Map([...$('draw-order').querySelectorAll('[data-player]')].map(token => [Number(token.dataset.player), token]))
    const destinations = new Map(slots.map(slot => [Number(slot.dataset.slot), slot]))
    const moves = finalOrder.flatMap((id, index) => destinations.has(index) ? [[tokens.get(id), destinations.get(index)]] : [])
    await moveDrawPlayers(moves, reduced, Math.max(100, 5000 - (performance.now() - started)))
    drawSeed = seed[0]
    manualDrawOrder = null
    showDrawResult = true
    recalculate()
    drawTone(523, 0.15); drawTone(659, 0.15, 0.12); drawTone(784, 0.24, 0.24)
    $('draw-status').textContent = 'Tirage terminé et enregistré.'
  } finally {
    drawing = false
    controls.forEach((control, index) => { control.disabled = previous[index] })
    $('draw-result').hidden = false
    $('draw').textContent = 'Tirer au sort'
  }
})
$('reset-draw').addEventListener('click', () => { drawSeed = null; manualDrawOrder = null; showDrawResult = false; recalculate() })
$('setup-form').addEventListener('submit', event => { event.preventDefault(); recalculate(); if (plan) location.hash = 'placements' })
window.addEventListener('hashchange', () => showPage(true))
$('by-player').addEventListener('click', () => selectView('player'))
$('by-round').addEventListener('click', () => selectView('round'))
for (const id of ['by-player', 'by-round']) $(id).addEventListener('keydown', event => {
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); selectView(view === 'player' ? 'round' : 'player'); $(`by-${view}`).focus() }
})
$('current-placement').addEventListener('change', () => changePlacement(Number($('current-placement').value)))
for (const [id, step] of [['previous', -1], ['next', 1]]) $(id).addEventListener('click', () => {
  const value = Number($('current-placement').value) + step
  const min = view === 'player' ? 0 : 1
  const max = view === 'player' ? plan.count : plan.rounds
  if (value >= min && value <= max) changePlacement(value)
})
updateOptions()
try {
  const saved = JSON.parse(localStorage.getItem(storageKey))
  if (saved) {
    const savedMode = ['morts2', 'morts3'].includes(saved.mode) ? 'morts' : saved.mode
    manualExclusions = normalizeExclusions(saved.count, Array.isArray(saved.exclusions) ? saved.exclusions : [], saved.rounds)
    drawSound = saved.drawSound !== false
    renderSoundToggle()
    drawSeed = Number.isInteger(saved.drawSeed) && saved.drawSeed >= 0 && saved.drawSeed <= 0xffffffff ? saved.drawSeed : null
    manualDrawOrder = Array.isArray(saved.manualDrawOrder) && saved.manualDrawOrder.length === saved.count && new Set(saved.manualDrawOrder).size === saved.count && saved.manualDrawOrder.every(id => Number.isInteger(id) && id >= 1 && id <= saved.count) ? saved.manualDrawOrder : null
    showDrawResult = drawSeed !== null || manualDrawOrder !== null
    plan = createPlan(saved.count, saved.rounds, savedMode, manualExclusions, true, drawSeed, manualDrawOrder)
    mode = savedMode; $('count').value = saved.count; updateOptions(); $('rounds').value = saved.rounds; renderExclusionSelectors()
    view = saved.view === 'round' ? 'round' : 'player'; round = Math.max(0, Math.min(plan.rounds - 1, Number(saved.round) || 0))
    selectedPlayer = Number.isInteger(saved.selectedPlayer) && saved.selectedPlayer >= 0 && saved.selectedPlayer <= plan.count ? saved.selectedPlayer : 0
  }
} catch { /* Invalid or unavailable device storage: start a new setup. */ }
recalculate()
if ('serviceWorker' in navigator) {
  const previouslyControlled = !!navigator.serviceWorker.controller
  let refreshing = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (previouslyControlled && !refreshing) { refreshing = true; location.reload() }
  })
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
    .then(registration => registration.update())
    .then(() => navigator.serviceWorker.ready)
    .then(() => console.info('Mode hors ligne prêt'))
    .catch(() => {})
}
