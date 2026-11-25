/**
 * Tests for resumePoint, which decides whether a Reading history card offers
 * "Resume" and where the reader lands. A wrong answer either drops a reader
 * at the top of a text they were halfway through, or offers to resume a text
 * they never started or already finished.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resumePoint, PROGRESS_NOT_STARTED, PROGRESS_FINISHED } from './reading-history'

test('no entry, nothing to resume', () => {
  assert.equal(resumePoint(undefined), null)
})

test('opened but not started is not a resume', () => {
  assert.equal(resumePoint({ progress: PROGRESS_NOT_STARTED / 2, position: 0.01 }), null)
  assert.equal(resumePoint({}), null)
})

test('finished is not a resume', () => {
  assert.equal(resumePoint({ progress: PROGRESS_FINISHED, position: 0.4 }), null)
  assert.equal(resumePoint({ progress: 1 }), null)
})

test('resumes at the last position, not the furthest point', () => {
  assert.equal(resumePoint({ progress: 0.6, position: 0.4 }), 0.4)
})

test('entries saved before position existed fall back to the furthest point', () => {
  assert.equal(resumePoint({ progress: 0.3 }), 0.3)
})

test('a position back at the top is not a resume', () => {
  assert.equal(resumePoint({ progress: 0.5, position: 0 }), null)
})

test('never lands past the furthest point', () => {
  assert.equal(resumePoint({ progress: 0.5, position: 0.7 }), 0.5)
})
