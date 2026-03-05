<template>
  <div class="app-editor">
    <div class="app-editor__placeholder">
      <i class="pi pi-pencil" style="font-size: 2rem; color: #9ca3af" />
      <p>Визуальный редактор</p>
      <p class="app-editor__subtitle">Drag-and-drop компоненты появятся здесь</p>
    </div>
  </div>
</template>

<script setup lang="ts">
</script>

<style scoped>
.app-editor {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 200px;
}

.app-editor__placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  color: #6b7280;
  text-align: center;
}

.app-editor__placeholder p {
  margin: 0;
}

.app-editor__subtitle {
  font-size: 0.85rem;
  color: #9ca3af;
}
</style>
