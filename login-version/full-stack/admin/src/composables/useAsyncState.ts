import { ref } from 'vue';

export function useAsyncState() {
  const loading = ref(false);
  const errorMessage = ref('');

  async function run<T>(task: () => Promise<T>) {
    loading.value = true;
    errorMessage.value = '';

    try {
      return await task();
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : '请求失败';
      throw error;
    } finally {
      loading.value = false;
    }
  }

  function clearError() {
    errorMessage.value = '';
  }

  return {
    loading,
    errorMessage,
    run,
    clearError
  };
}
