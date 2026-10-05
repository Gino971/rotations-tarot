export function timerRemaining(timer, now = Date.now()) {
  return timer.deadline === null ? timer.remaining : Math.max(0, timer.deadline - now)
}
export function timerText(milliseconds) {
  const seconds = Math.ceil(Math.max(0, milliseconds) / 1000)
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}
export function adjustTimer(timer, minutes, now = Date.now()) {
  const duration = Math.max(60000, Math.min(180 * 60000, timer.duration + minutes * 60000))
  const adjustment = duration - timer.duration
  timer.duration = duration
  timer.remaining = Math.max(0, Math.min(180 * 60000, timerRemaining(timer, now) + adjustment))
  if (timer.deadline !== null) timer.deadline = now + timer.remaining
}
