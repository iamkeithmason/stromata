'use client'

import { useEffect, useState } from 'react'
import {
  disableAnalyticsOnThisDevice,
  enableAnalyticsOnThisDevice,
  isAnalyticsDisabledOnThisDevice,
} from '@/lib/analytics/device-opt-out'

/**
 * A one-line admin-header note saying whether this device reports to Umami,
 * with a way to flip it. The flag itself is set at login (see the login page);
 * this component only reports and toggles, so "Re-enable" actually sticks.
 */
export default function AnalyticsDeviceNote() {
  // null until the effect has read localStorage — the server has no idea what
  // this device's flag is, so render nothing rather than guess and flicker.
  const [disabled, setDisabled] = useState<boolean | null>(null)

  useEffect(() => {
    setDisabled(isAnalyticsDisabledOnThisDevice())
  }, [])

  if (disabled === null) return null

  const toggle = () => {
    if (disabled) enableAnalyticsOnThisDevice()
    else disableAnalyticsOnThisDevice()
    setDisabled(!disabled)
  }

  return (
    <span className="text-xs text-stone-400">
      {disabled ? 'Analytics disabled on this device' : 'Analytics active on this device'}
      {' · '}
      <button
        type="button"
        onClick={toggle}
        className="underline underline-offset-2 hover:text-white transition-colors"
      >
        {disabled ? 'Re-enable' : 'Disable'}
      </button>
    </span>
  )
}
