import { createRouter as createTanstackRouter } from '@tanstack/react-router'
import { routerWithQueryClient } from '@tanstack/react-router-with-query'
import * as TanstackQuery from './integrations/tanstack-query/root-provider'
import { LanguageProvider } from './lib/i18n/context'

// Import the generated route tree
import { routeTree } from './routeTree.gen'

import './styles.css'

// Create a new router instance
export const createRouter = () => {
  const router = routerWithQueryClient(
    createTanstackRouter({
      routeTree,
      context: {
        ...TanstackQuery.getContext(),
      },
      scrollRestoration: true,
      defaultPreloadStaleTime: 0,

      Wrap: (props: { children: React.ReactNode }) => {
        return (
          <LanguageProvider>
            <TanstackQuery.Provider>{props.children}</TanstackQuery.Provider>
          </LanguageProvider>
        )
      },
    }),
    TanstackQuery.getContext().queryClient,
  )

  return router
}

// Register the router instance for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createRouter>
  }
}
