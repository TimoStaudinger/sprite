declare global {
  interface Window {
    dtrum?: {
      enterAction: (name: string) => number
      leaveAction: (actionId: number) => void
      addActionProperties: (
        actionId: number,
        javaLong?: null,
        javaDate?: null,
        shortString?: Record<string, string> | null,
        javaDouble?: Record<string, number> | null,
      ) => void
    }
  }
}

let currentActionId: number | null = null
let inputTimestamp: number | null = null
let debounceTimestamp: number | null = null

export const onEditorInput = () => {
  if (currentActionId != null && window.dtrum) {
    window.dtrum.leaveAction(currentActionId)
  }

  inputTimestamp = performance.now()
  debounceTimestamp = null

  if (window.dtrum) {
    currentActionId = window.dtrum.enterAction('Chart Update')
  }
}

export const onDebounceComplete = () => {
  debounceTimestamp = performance.now()
}

export const onChartRendered = () => {
  if (currentActionId == null || inputTimestamp == null) return

  const now = performance.now()
  const debounceDuration = debounceTimestamp != null ? debounceTimestamp - inputTimestamp : null
  const renderDuration = debounceTimestamp != null ? now - debounceTimestamp : null
  const totalDuration = now - inputTimestamp

  if (window.dtrum) {
    window.dtrum.addActionProperties(
      currentActionId,
      null,
      null,
      null,
      {
        ...(debounceDuration != null ? {debounceDuration} : {}),
        ...(renderDuration != null ? {renderDuration} : {}),
        totalDuration,
      },
    )
    window.dtrum.leaveAction(currentActionId)
  }

  currentActionId = null
  inputTimestamp = null
  debounceTimestamp = null
}
