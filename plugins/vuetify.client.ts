import { createVuetify } from 'vuetify'
// Only the Vuetify pieces Mondo really uses are loaded. Importing all of them
// added a lot of unused code to every first page load.
import {
  VAlert,
  VApp,
  VBtn,
  VCard,
  VDialog,
  VForm,
  VIcon,
  VMain,
  VRadio,
  VRadioGroup,
  VTextField,
} from 'vuetify/components'

export default defineNuxtPlugin((nuxtApp) => {
  const vuetify = createVuetify({
    components: {
      VAlert,
      VApp,
      VBtn,
      VCard,
      VDialog,
      VForm,
      VIcon,
      VMain,
      VRadio,
      VRadioGroup,
      VTextField,
    },
    icons: {
      defaultSet: 'mdi',
    },
    defaults: {
      global: {
        ripple: false,
      },
      VSheet: {
        elevation: 0,
      },
      VCard: {
        flat: false,
        elevation: 1,
      },
      VBtn: {
        color: 'primary',
        style: 'text-transform: none; font-family: inherit;',
      },
      VTextField: {
        variant: 'outlined',
      },
      VSelect: {
        variant: 'outlined',
      },
    },
    theme: {
      defaultTheme: 'wallet',
      themes: {
        wallet: {
          dark: false,
          colors: {
            primary: '#2554e8',
            // Mondo orange. Used for the name, the Sent colour and highlights.
            // On white it is 3.3:1, so keep small text dark and use it for
            // large text, borders, icons and fills.
            secondary: '#FF4B33',
            accent: '#FF4B33',
            error: '#b3261e',
            success: '#0a7a4f',
            warning: '#f5a04a',
            info: '#2554e8',
          },
        },
      },
    },
  })

  nuxtApp.vueApp.use(vuetify)
})
