// https://nuxt.com/docs/api/configuration/nuxt-config

export default defineNuxtConfig({
  compatibilityDate: '2025-08-27',
  devtools: { enabled: true },
  ssr: false,

  devServer: {
    host: '0.0.0.0',
    port: 3011,
  },

  app: {
    head: {
      titleTemplate: '%s - Mondo',
      title: 'Mondo',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        {
          name: 'description',
          content: 'Mondo: US, euro and pound bank details and a USDC wallet in one app.',
        },
      ],
      script: [
        {
          // Sets the landing page's light or dark mode before the first paint.
          innerHTML:
            "try{if(location.pathname==='/'){var t=localStorage.getItem('mondo-theme');if(t!=='light'&&t!=='dark'){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.dataset.moTheme=t}}catch(e){}",
        },
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32.png' },
        { rel: 'icon', href: '/favicon.ico', sizes: 'any' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
        // Open the connections to the icon and font hosts early.
        { rel: 'preconnect', href: 'https://cdn.jsdelivr.net', crossorigin: '' },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          // Pinned to one version so browsers can cache it for good.
          rel: 'stylesheet',
          href: 'https://cdn.jsdelivr.net/npm/@mdi/font@7.4.47/css/materialdesignicons.min.css',
        },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Outfit:wght@600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap',
        },
      ],
    },
  },

  css: ['vuetify/styles', '~/assets/css/main.css', '~/assets/css/app.css'],

  plugins: ['~/plugins/vuetify.client.ts'],

  // Old pieces of the original Circle sample app. Mondo does not use them, so
  // they are kept out of the build even if their files are still in the repo.
  ignore: [
    'pages/debug/**',
    'stores/**',
    'lib/**',
    'helpers/**',
    'devtools/**',
    'server-middleware/**',
    'layouts/default.vue',
    // Left over from an earlier globe attempt. Safe to delete from the repo.
    'utils/globe.ts',
    'plugins/*',
    '!plugins/vuetify.client.ts',
  ],

  // Server routes that talk to Circle can wait a little longer than the
  // 10 second default.
  nitro: {
    vercel: { functions: { maxDuration: 30 } },
  },

  runtimeConfig: {
    // The private keys which are only available within server-side
    // Keys within public, will be also exposed to the client-side

    // Circle Developer-Controlled Wallets (server only, never sent to browsers)
    circleApiKey: process.env.CIRCLE_API_KEY || '',
    circleEntitySecret: process.env.CIRCLE_ENTITY_SECRET || '',
    circleWalletSetId: process.env.CIRCLE_WALLET_SET_ID || '',
    circleBaseUrl: process.env.CIRCLE_W3S_BASE_URL || 'https://api.circle.com',
    circleBlockchain: process.env.CIRCLE_BLOCKCHAIN || 'MATIC-AMOY',
    circleAccountType: process.env.CIRCLE_ACCOUNT_TYPE || 'SCA',
    maxSendUsdc: process.env.MAX_SEND_USDC || '',
    allowLiveFunds: process.env.ALLOW_LIVE_FUNDS || '',

    // Bridge (virtual bank accounts). Server only.
    bridgeApiKey: process.env.BRIDGE_API_KEY || '',
    bridgeBaseUrl: process.env.BRIDGE_BASE_URL || '',
    allowLiveBanking: process.env.ALLOW_LIVE_BANKING || '',
    bridgeEndorsements: process.env.BRIDGE_ENDORSEMENTS || '',

    // Gemini (the in-app assistant). Server only.
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    geminiModel: process.env.GEMINI_MODEL || '',

    // Whether the bridging packages are installed (set at build time).

    // Supabase service role key (server only)
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',

    public: {
      baseUrl: process.env.BASE_URL || 'https://api-sandbox.circle.com',
      // The Supabase URL and anon key are designed to be public
      supabaseUrl: process.env.SUPABASE_URL || '',
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
    },
  },

  routeRules: {
    '/**': { headers: { 'cache-control': 'no-cache' } },
    '/_nuxt/**': {
      headers: { 'cache-control': 'public, max-age=31536000, immutable' },
    },
  },

  vite: {
    define: {
      global: 'globalThis',
    },
    optimizeDeps: {
      include: [],
    },
    build: {
      rollupOptions: {
        external: [],
      },
    },
  },

  typescript: {
    typeCheck: false,
  },
})
