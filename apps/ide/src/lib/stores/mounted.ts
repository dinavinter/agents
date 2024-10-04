import type { Readable } from 'svelte/store'
import { onMount } from 'svelte'
import { noop } from 'svelte/internal'

export const mounted: Readable<boolean> = {
  subscribe(set) {
    set(false)
    onMount(() => {
      set(true)
      return () => set(false)
    })
    return noop
  },
}
