import { describe, expect, it } from 'vitest'
import { progress } from '@/app/list/progress'

const details = { name: 'GrokBot', tagline: 'An agent', category: 'agents', owner_email: 'me@example.com' }

describe('list form stepper', () => {
  it('starts on the link until it is a full https link', () => {
    expect(progress({})).toBe(1)
    expect(progress({ website: 'http://example.com', ...details })).toBe(1)
    expect(progress({ website: 'https://nope' })).toBe(1)
  })

  it('moves to the details once the link is valid', () => {
    expect(progress({ website: 'https://example.com' })).toBe(2)
    expect(progress({ website: 'https://example.com', ...details, owner_email: '  ' })).toBe(2)
  })

  it('is ready to publish when every required field is filled', () => {
    expect(progress({ website: ' https://example.com ', ...details })).toBe(3)
  })
})
