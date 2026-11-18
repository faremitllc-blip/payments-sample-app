// Registers the service worker that makes Mondo installable, and keeps the browser's
// "install" prompt so the Install page can offer it.
export default defineNuxtPlugin(() => {
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault()
    ;(window as any).__moInstall = e
    window.dispatchEvent(new Event('mo-install-ready'))
  })
  window.addEventListener('appinstalled', () => {
    ;(window as any).__moInstall = null
    window.dispatchEvent(new Event('mo-installed'))
  })
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Not fatal: the site works without it.
      })
    })
  }
})
