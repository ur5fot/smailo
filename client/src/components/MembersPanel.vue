<template>
  <div class="members-panel__overlay" @click.self="$emit('close')">
    <div class="members-panel">
      <header class="members-panel__header">
        <h2 class="members-panel__title">Участники</h2>
        <button class="members-panel__close" @click="$emit('close')">
          <i class="pi pi-times" />
        </button>
      </header>

      <!-- Invite section -->
      <div class="members-panel__invite">
        <div class="members-panel__invite-row">
          <select v-model="inviteRole" class="members-panel__select">
            <option value="editor">Editor</option>
            <option value="viewer">Viewer</option>
          </select>
          <Button
            label="Пригласить"
            icon="pi pi-link"
            size="small"
            :loading="inviteLoading"
            @click="handleCreateInvite"
          />
        </div>
        <div v-if="inviteUrl" class="members-panel__invite-link">
          <input
            ref="inviteLinkInput"
            :value="inviteUrl"
            readonly
            class="members-panel__invite-input"
            @focus="($event.target as HTMLInputElement).select()"
          />
          <Button
            :icon="copied ? 'pi pi-check' : 'pi pi-copy'"
            size="small"
            text
            :title="copied ? 'Скопировано' : 'Копировать'"
            @click="handleCopy"
          />
        </div>
      </div>

      <!-- Members list -->
      <div class="members-panel__list">
        <div v-if="loadingMembers" class="members-panel__loading">
          Загрузка...
        </div>
        <div v-else-if="membersList.length === 0" class="members-panel__empty">
          Нет участников
        </div>
        <div
          v-for="member in membersList"
          :key="member.userId"
          class="members-panel__member"
        >
          <div class="members-panel__member-info">
            <span class="members-panel__member-id">{{ member.userId }}</span>
            <span
              v-if="member.role === 'owner'"
              class="members-panel__role-badge members-panel__role-badge--owner"
            >owner</span>
          </div>
          <div v-if="member.role !== 'owner'" class="members-panel__member-actions">
            <select
              :value="member.role"
              class="members-panel__select members-panel__select--small"
              @change="handleRoleChange(member.userId, ($event.target as HTMLSelectElement).value as 'editor' | 'viewer')"
            >
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
            </select>
            <Button
              icon="pi pi-trash"
              size="small"
              text
              severity="danger"
              title="Удалить"
              @click="handleRemove(member.userId)"
            />
          </div>
        </div>
      </div>

      <div v-if="error" class="members-panel__error">{{ error }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import Button from 'primevue/button'
import { useAppStore, type MemberInfo } from '../stores/app'

const props = defineProps<{
  hash: string
}>()

defineEmits<{
  close: []
}>()

const appStore = useAppStore()

const membersList = ref<MemberInfo[]>([])
const loadingMembers = ref(false)
const error = ref('')
const inviteRole = ref<'editor' | 'viewer'>('editor')
const inviteLoading = ref(false)
const inviteUrl = ref('')
const copied = ref(false)
const confirmingRemove = ref<string | null>(null)

async function loadMembers() {
  loadingMembers.value = true
  error.value = ''
  try {
    membersList.value = await appStore.fetchMembers(props.hash)
  } catch {
    error.value = 'Не удалось загрузить список участников'
  } finally {
    loadingMembers.value = false
  }
}

async function handleCreateInvite() {
  inviteLoading.value = true
  error.value = ''
  inviteUrl.value = ''
  copied.value = false
  try {
    const result = await appStore.createInvite(props.hash, inviteRole.value)
    inviteUrl.value = `${window.location.origin}${result.inviteUrl}`
  } catch {
    error.value = 'Не удалось создать приглашение'
  } finally {
    inviteLoading.value = false
  }
}

async function handleCopy() {
  try {
    await navigator.clipboard.writeText(inviteUrl.value)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch {
    // Fallback: select the input text
    const input = document.querySelector('.members-panel__invite-input') as HTMLInputElement
    if (input) {
      input.select()
      document.execCommand('copy')
    }
  }
}

async function handleRoleChange(userId: string, newRole: 'editor' | 'viewer') {
  error.value = ''
  try {
    await appStore.changeMemberRole(props.hash, userId, newRole)
    const member = membersList.value.find(m => m.userId === userId)
    if (member) member.role = newRole
  } catch {
    error.value = 'Не удалось изменить роль'
    await loadMembers()
  }
}

async function handleRemove(userId: string) {
  if (confirmingRemove.value !== userId) {
    confirmingRemove.value = userId
    setTimeout(() => { confirmingRemove.value = null }, 3000)
    return
  }
  confirmingRemove.value = null
  error.value = ''
  try {
    await appStore.removeMember(props.hash, userId)
    membersList.value = membersList.value.filter(m => m.userId !== userId)
  } catch {
    error.value = 'Не удалось удалить участника'
  }
}

onMounted(() => {
  loadMembers()
})
</script>

<style scoped>
.members-panel__overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.members-panel {
  background: #fff;
  border-radius: 0.75rem;
  padding: 1.25rem;
  max-width: 480px;
  width: 90%;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
}

.members-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
}

.members-panel__title {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
  color: #111827;
}

.members-panel__close {
  background: none;
  border: none;
  cursor: pointer;
  padding: 0.25rem;
  color: #6b7280;
  font-size: 1rem;
}

.members-panel__close:hover {
  color: #111827;
}

.members-panel__invite {
  margin-bottom: 1rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid #f3f4f6;
}

.members-panel__invite-row {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.members-panel__select {
  padding: 0.4rem 0.6rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  font-size: 0.85rem;
  color: #111827;
  background: #fff;
}

.members-panel__select--small {
  padding: 0.25rem 0.4rem;
  font-size: 0.8rem;
}

.members-panel__invite-link {
  display: flex;
  gap: 0.25rem;
  align-items: center;
  margin-top: 0.5rem;
}

.members-panel__invite-input {
  flex: 1;
  padding: 0.35rem 0.5rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  font-size: 0.8rem;
  color: #374151;
  background: #f9fafb;
}

.members-panel__list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.members-panel__loading,
.members-panel__empty {
  color: #9ca3af;
  font-size: 0.85rem;
  text-align: center;
  padding: 1rem;
}

.members-panel__member {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.25rem;
  border-bottom: 1px solid #f9fafb;
}

.members-panel__member-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.members-panel__member-id {
  font-size: 0.85rem;
  color: #374151;
  font-family: monospace;
}

.members-panel__role-badge {
  font-size: 0.65rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 0.1rem 0.4rem;
  border-radius: 1rem;
}

.members-panel__role-badge--owner {
  background: #fef3c7;
  color: #92400e;
}

.members-panel__member-actions {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.members-panel__error {
  margin-top: 0.75rem;
  font-size: 0.8rem;
  color: #ef4444;
  text-align: center;
}
</style>
