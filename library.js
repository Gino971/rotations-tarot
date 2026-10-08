const $ = id => document.getElementById(id)
let target = null, busy = false
function message(text, error = false) { $('library-message').textContent = text; $('library-message').classList.toggle('error', error) }
function setBusy(value) {
  busy = value
  for (const element of document.querySelectorAll('button,input')) element.disabled = value
}
async function requestLibrary(data) {
  const response = await fetch('/api/library', data ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) } : { cache: 'no-store' })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error || 'Impossible de charger la bibliothèque.')
  render(result.documents)
}
function openForm(document = null) {
  if (busy) return
  target = document?.filename || null
  $('library-form').reset()
  $('library-form-title').textContent = target ? 'Remplacer le document' : 'Ajouter un document'
  $('library-title').value = document?.title || ''
  $('library-form').hidden = false
  $('library-title').focus()
}
function render(documents) {
  $('library-list').replaceChildren()
  for (const document of documents) {
    const row = window.document.createElement('div'); row.className = 'library-row'
    const label = window.document.createElement('div'), title = window.document.createElement('strong'), pages = window.document.createElement('small')
    title.textContent = document.title; pages.textContent = `${document.pages} pages`; label.append(title,pages)
    const buttons = window.document.createElement('div'); buttons.className = 'buttons'
    const replace = window.document.createElement('button'); replace.className = 'secondary'; replace.textContent = 'Remplacer'; replace.addEventListener('click', () => openForm(document))
    const remove = window.document.createElement('button'); remove.className = 'secondary'; remove.textContent = 'Retirer'
    remove.addEventListener('click', async () => {
      if (busy || !confirm(`Retirer « ${document.title} » de la bibliothèque ? Une copie sera conservée dans les archives du projet.`)) return
      setBusy(true); message('Retrait du document…')
      try { await requestLibrary({action:'remove',target:document.filename}); $('library-form').hidden = true; message('Document retiré. La bibliothèque est prête à être publiée.') }
      catch (error) { message(error.message,true) } finally { setBusy(false) }
    })
    buttons.append(replace,remove); row.append(label,buttons); $('library-list').append(row)
  }
  if (!documents.length) $('library-list').textContent = 'Aucun document. Ajoutez votre premier fichier.'
}
$('library-add').addEventListener('click', () => openForm())
$('library-cancel').addEventListener('click', () => { $('library-form').hidden = true; target = null })
$('library-file').addEventListener('change', () => { const file = $('library-file').files[0]; if(file && !target && !$('library-title').value) $('library-title').value = file.name.replace(/\.(pdf|txt)$/i,'') })
$('library-form').addEventListener('submit', async event => {
  event.preventDefault()
  if (busy) return
  const file = $('library-file').files[0]
  if (!file) return
  if(file.size>10*1024*1024) {message('Le fichier dépasse 10 Mo.',true);return}
  setBusy(true); message('Lecture du document et mise à jour…')
  try {
    const bytes = new Uint8Array(await file.arrayBuffer()); let binary = ''
    for(let i=0;i<bytes.length;i+=8192) binary+=String.fromCharCode(...bytes.subarray(i,i+8192))
    await requestLibrary({action:'save',target,title:$('library-title').value,filename:file.name,content:btoa(binary)})
    $('library-form').hidden = true; target = null
    message('Document enregistré. Vous pouvez le tester dans l’onglet Arbitrage. Il reste à publier l’app.')
  } catch(error) { message(error.message,true) } finally {setBusy(false)}
})
requestLibrary().catch(error => message(error.message,true))

let publicationTimer = null
function showPublication(state) {
  $('library-publication').textContent = state.message
  $('library-publication').classList.toggle('error',state.status === 'error')
  $('library-published-link').hidden = state.status !== 'success'
  if(state.url) $('library-published-link').href = state.url
  setBusy(state.status === 'running')
  $('library-publish').textContent = state.status === 'running' ? 'Publication en cours…' : 'Publier la bibliothèque'
}
async function checkPublication() {
  try {
    const response = await fetch('/api/library/publication',{cache:'no-store'})
    const state = await response.json()
    if(!response.ok) throw new Error(state.error)
    showPublication(state)
    if(state.status === 'running') publicationTimer = setTimeout(checkPublication,2000)
  } catch(error) {
    $('library-publication').textContent = 'Suivi interrompu. Rechargez cette page pour retrouver l’état de publication.'
    $('library-publication').classList.add('error')
    // Keep the publish button disabled until the running operation can be checked.
  }
}
$('library-publish').addEventListener('click',async () => {
  if(busy) return
  setBusy(true); clearTimeout(publicationTimer)
  try {
    const response = await fetch('/api/library/publication',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'publish'})})
    const state = await response.json()
    if(!response.ok) throw new Error(state.error)
    showPublication(state); publicationTimer = setTimeout(checkPublication,1000)
  } catch(error) { setBusy(false); $('library-publication').textContent=error.message; $('library-publication').classList.add('error') }
})
checkPublication()
