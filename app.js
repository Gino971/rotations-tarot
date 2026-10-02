import { optionsFor, maxRounds, movementDetails, createPlan, encountersFor, tableVisitsFor, positionsFor, seats } from './engine.js'

const $ = id => document.getElementById(id)
const storageKey = 'rotations-tarot-v1'
let plan = null
let mode = 'normal'
let view = 'player'
let round = 0
let selectedPlayer = 0
let manualExclusions = []
let drawSeed = null

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
  for (let index = 0; index < rounds; index++) {
    if (manualExclusions[index] > count) manualExclusions[index] = null
    const label = document.createElement('label')
    label.textContent = `Exclu · manche ${index + 1}`
    const select = document.createElement('select')
    select.add(new Option('À choisir', ''))
    for (let id = 1; id <= count; id++) select.add(new Option(`Joueur ${id}`, id))
    select.value = manualExclusions[index] ? String(manualExclusions[index]) : ''
    select.addEventListener('change', () => { manualExclusions[index] = select.value ? Number(select.value) : null; recalculate() })
    label.append(select); $('exclusion-selectors').append(label)
  }
}

function persist() {
  try {
    localStorage.setItem(storageKey, JSON.stringify({ count: plan.count, rounds: plan.rounds, mode: plan.mode, exclusions: manualExclusions, drawSeed, view, round, selectedPlayer }))
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
  $('draw-status').textContent = drawSeed === null ? 'Première manche : ordre des numéros.' : 'Tirage enregistré pour ce tournoi.'
  $('reset-draw').hidden = drawSeed === null
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
  const excluded = plan.excluded[round]
  const pending = plan.mode === 'excluded' && excluded === null
  $('excluded-notice').hidden = !excluded && !pending
  $('excluded-notice').textContent = pending ? 'Exclu à choisir' : excluded ? `Exclu : joueur ${excluded}` : ''
  const tables = Object.values(plan.rotations)[round]
  $('table-cards').innerHTML = tables.map(table => {
    const seatHtml = (player, index) => `<div class="seat ${['north', 'south', 'east', 'west'][index] || ''} ${player?.id ? '' : 'empty'}"><small>${seats[index]}</small><strong>${player ? player.id || 'Mort' : '—'}</strong></div>`
    return `<article class="table-card"><h3>Table ${table.table}</h3><div class="table-layout">${[0, 1, 2, 3].map(index => seatHtml(table.joueurs[index], index)).join('')}<span class="table-center" aria-hidden="true">♠</span></div>${table.joueurs.length > 4 ? `<div class="extra-seats">${table.joueurs.slice(4).map((player, index) => seatHtml(player, index + 4)).join('')}</div>` : ''}</article>`
  }).join('')
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
    plan = createPlan(Number($('count').value), Number($('rounds').value), mode, manualExclusions, true, drawSeed)
    round = Math.min(round, plan.rounds - 1)
    if (selectedPlayer > plan.count) selectedPlayer = 0
    $('error').textContent = ''; showPlan()
  } catch (error) { $('error').textContent = error.message; plan = null; $('tournament-summary').textContent = ''; location.hash = 'reglages'; showPage() }
}

$('count').addEventListener('change', () => { manualExclusions = []; drawSeed = null; updateOptions(); recalculate() })
$('rounds').addEventListener('change', () => { manualExclusions = manualExclusions.slice(0, Number($('rounds').value)); renderExclusionSelectors(); recalculate() })
$('draw').addEventListener('click', () => {
  const seed = new Uint32Array(1)
  crypto.getRandomValues(seed)
  drawSeed = seed[0]
  recalculate()
})
$('reset-draw').addEventListener('click', () => { drawSeed = null; recalculate() })
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
    manualExclusions = Array.isArray(saved.exclusions) ? saved.exclusions : []
    drawSeed = Number.isInteger(saved.drawSeed) && saved.drawSeed >= 0 && saved.drawSeed <= 0xffffffff ? saved.drawSeed : null
    plan = createPlan(saved.count, saved.rounds, savedMode, manualExclusions, true, drawSeed)
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
