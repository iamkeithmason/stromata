/**
 *   npx tsx --test lib/email/signup.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { signupAction } from './signup'

test('renders nothing until the form is configured', () => {
  assert.equal(signupAction(null), null)
  assert.equal(signupAction(''), null)
})

test('accepts a Kit form action', () => {
  assert.equal(
    signupAction('https://app.kit.com/forms/1234567/subscriptions'),
    'https://app.kit.com/forms/1234567/subscriptions',
  )
  assert.notEqual(signupAction('https://app.convertkit.com/forms/1234567/subscriptions'), null)
})

test('refuses anything that is not https on a Kit host', () => {
  assert.equal(signupAction('http://app.kit.com/forms/1/subscriptions'), null)
  assert.equal(signupAction('https://evil.example/forms/1'), null)
  assert.equal(signupAction('https://kit.com.evil.example/forms/1'), null)
  assert.equal(signupAction('not a url'), null)
})
