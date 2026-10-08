import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const execute = promisify(execFile)
const cwd = fileURLToPath(new URL('./', import.meta.url))
const site = 'https://gino971.github.io/rotations-tarot/#arbitrage'
const allowed = name => name === 'arbitrage.json' || name.startsWith('documents/arbitrage/')
export const publication = { status: 'idle', message: '', url: null }
export const publicationActive = () => publication.status === 'running'
async function command(program, args) {
  try { const result = await execute(program, args, { cwd, timeout: 180000, maxBuffer: 1024 * 1024 }); return result.stdout.trim() }
  catch (error) {
    if (error.code === 'ENOENT') throw new Error(`L’outil ${program} est nécessaire pour publier depuis cet ordinateur.`)
    throw new Error(`Échec de ${program} : ${(error.stderr || error.message).trim().slice(0,600)}`)
  }
}
export async function publishLibrary(run = command, pause = ms => new Promise(resolve => setTimeout(resolve,ms))) {
  const update = message => { publication.message = message }
  try {
    update('Vérification du projet…')
    if (await run('git',['branch','--show-current']) !== 'main') throw new Error('La publication doit être lancée depuis la branche principale du projet.')
    const publishedApp = await run('git',['show','origin/main:index.html'])
    if (!publishedApp.includes('id="arbitrage-panel"')) throw new Error('La première publication de l’app avec l’onglet Arbitrage doit être effectuée avant de publier uniquement la bibliothèque.')
    const staged = await run('git',['diff','--cached','--name-only'])
    if (staged) throw new Error('Des modifications sont déjà préparées dans le projet. Terminez leur publication avant de publier la bibliothèque.')
    const unpushed = await run('git',['diff','--name-only','origin/main...HEAD'])
    if (unpushed.split('\n').filter(Boolean).some(name => !allowed(name))) throw new Error('Des modifications de l’app attendent une publication. Publiez d’abord l’app, puis utilisez ce bouton pour les documents.')
    await run('gh',['auth','status'])
    update('Vérification de l’application et préparation des documents…')
    await run('npm',['test'])
    await run('npm',['run','build'])
    // Commit only the shared library. Other workspace edits remain untouched.
    await run('git',['add','--','arbitrage.json','documents/arbitrage/'])
    const changed = await run('git',['diff','--cached','--name-only'])
    if (changed.split('\n').filter(Boolean).some(name => !allowed(name))) throw new Error('La publication contient des changements autres que les documents. Vérifiez le projet avant de continuer.')
    if(changed) await run('git',['commit','-m','Mettre à jour la bibliothèque d’arbitrage'])
    const sha = await run('git',['rev-parse','HEAD'])
    update('Envoi de la bibliothèque…')
    await run('git',['push','origin','main'])
    update('Bibliothèque envoyée. Mise en ligne en cours…')
    for(let attempt=0;attempt<40;attempt++) {
      const runs = JSON.parse(await run('gh',['run','list','--workflow','pages.yml','--commit',sha,'--limit','1','--json','status,conclusion']))
      if(runs[0]?.status === 'completed') {
        if(runs[0].conclusion !== 'success') throw new Error('La mise en ligne a échoué. Les documents sont conservés ; vérifiez la publication avant de réessayer.')
        publication.status = 'success'; publication.message = 'Bibliothèque publiée pour tous les utilisateurs.'; publication.url = site
        return
      }
      await pause(15000)
    }
    throw new Error('La bibliothèque a été envoyée, mais la confirmation de mise en ligne tarde. Vérifiez le déploiement GitHub avant de réessayer.')
  } catch(error) { publication.status='error'; publication.message=error.message; publication.url=null }
}
export function startLibraryPublication() {
  if(publicationActive()) throw new Error('Une publication est déjà en cours.')
  publication.status='running'; publication.message='Préparation de la publication…'; publication.url=null
  void publishLibrary()
  return {...publication}
}
