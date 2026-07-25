/**
 * Mutation hook for updating vitals via the current DataProvider.
 * Invalidates the vitals cache on success.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useDataAccess } from "@/providers/DataAccessProvider"
import { DataProviderError } from "../../types/data"
import type { UpdateVitalsInput } from "../../types/vitals"
import { providerVitalsKeys } from "./useProviderVitals"
import { usePermissionGuard } from "./usePermissionGuard"

export function useUpdateVitals() {
  const { provider } = useDataAccess()
  const queryClient = useQueryClient()
  const { checkOperation } = usePermissionGuard()

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateVitalsInput }) => {
      const allowed = checkOperation("vitals:edit")
      if (!allowed.ok) throw new DataProviderError(allowed.error)

      const result = await provider.vitals.update(id, data)
      if (!result.ok) throw new DataProviderError(result.error)
      return result.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: providerVitalsKeys.all })
    },
  })
}
