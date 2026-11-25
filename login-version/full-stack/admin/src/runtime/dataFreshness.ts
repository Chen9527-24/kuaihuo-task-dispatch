import { readonly, ref } from 'vue';

/**
 * Successful write requests advance this revision. Keep-alive routes snapshot
 * the latest revision only when they are activated, so the currently edited
 * page is not remounted in the middle of a save while previously cached pages
 * are recreated with fresh server data on the next navigation.
 */
const cachedViewMutationRevision = ref(0);

export const cachedViewDataRevision = readonly(cachedViewMutationRevision);

export function markCachedViewDataMutation() {
  cachedViewMutationRevision.value += 1;
}
