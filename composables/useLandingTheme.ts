export type MoTheme = 'light' | 'dark'

const KEY = 'mondo-theme'

/**
 * Light and dark mode for the landing page. The mode is written to the page as
 * `data-mo-theme`, which the styles and the globe both follow, so the globe and
 * the page background always match. The wallet screens are not affected.
 */
export function useLandingTheme() {
  const theme = useState<MoTheme>('mo-theme', () => 'light')

  function read(): MoTheme {
    try {
      const saved = localStorage.getItem(KEY)
      if (saved === 'light' || saved === 'dark') {
        return saved
      }
    } catch {
      // Storage can be blocked. Fall through to the device setting.
    }
    return typeof matchMedia === 'function' &&
      matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light'
  }

  function apply() {
    document.documentElement.dataset.moTheme = theme.value
  }

  /** Turn the mode on (call when the landing page is showing). */
  function start() {
    theme.value = read()
    apply()
  }

  /** Turn it off again when leaving the landing page. */
  function stop() {
    delete document.documentElement.dataset.moTheme
  }

  function toggle() {
    theme.value = theme.value === 'dark' ? 'light' : 'dark'
    try {
      localStorage.setItem(KEY, theme.value)
    } catch {
      // Not saving is fine. The choice still applies for this visit.
    }
    apply()
  }

  return { theme, start, stop, toggle }
}
