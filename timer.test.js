import test from 'node:test'
import assert from 'node:assert/strict'
import { timerRemaining, timerText, adjustTimer } from './timer.js'

test('deadline keeps elapsed time accurate after delayed callbacks', () => {
  const timer = { duration: 3000000, remaining: 3000000, deadline: 3001000 }
  assert.equal(timerRemaining(timer, 1000), 3000000)
  assert.equal(timerRemaining(timer, 121000), 2880000)
  assert.equal(timerRemaining(timer, 4000000), 0)
  timer.remaining = timerRemaining(timer, 121000); timer.deadline = null
  assert.equal(timerRemaining(timer, 9000000), 2880000)
})
test('minute adjustments preserve elapsed time and enforce duration bounds', () => {
  const timer = { duration: 3000000, remaining: 3000000, deadline: 3001000 }
  adjustTimer(timer, 1, 61000)
  assert.equal(timer.duration, 3060000)
  assert.equal(timer.deadline, 3061000)
  adjustTimer(timer, -1, 61000)
  assert.equal(timer.deadline, 3001000)
  const paused = { duration: 60000, remaining: 60000, deadline: null }
  adjustTimer(paused, -1)
  assert.equal(paused.duration, 60000)
  assert.equal(paused.remaining, 60000)
  paused.duration = 180 * 60000; paused.remaining = paused.duration
  adjustTimer(paused, 1)
  assert.equal(paused.duration, 180 * 60000)
  assert.equal(paused.remaining, 180 * 60000)
})
test('display rounds up partial seconds and handles five-second test', () => {
  assert.equal(timerText(3000000), '50:00')
  assert.equal(timerText(5000), '00:05')
  assert.equal(timerText(4999), '00:05')
  assert.equal(timerText(1), '00:01')
  assert.equal(timerText(0), '00:00')
  assert.equal(timerText(-50), '00:00')
})
