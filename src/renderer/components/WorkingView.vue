<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { shortcuts } from '../../shared/shortcuts'
import type { CommitTemplate, WorkingArea, WorkingFile } from '../../shared/types'
import { registry } from '../actions/builtin'
import { useAppStore } from '../stores/app'
import { useRepoStore } from '../stores/repo'
import StageDiff from './StageDiff.vue'
import TemplatePicker from './TemplatePicker.vue'

const props = defineProps<{ root: string }>()
const repo = useRepoStore(props.root)
const showStash = ref(false)
const stashMessage = ref('')
const stashUntracked = ref(false)
const commitKeys = registry.keyLabel(shortcuts['working.commit'])
const app = useAppStore()
// Guide dell'oggetto dalle preferenze (di solito 50 e 72 caratteri)
const subjectLength = computed(() => {
  const n = repo.subject.length
  return n > app.preferences.subjectLimit ? 'over' : n > app.preferences.subjectWarn ? 'long' : ''
})

const subjectInput = ref<HTMLInputElement | null>(null)
const picker = ref<InstanceType<typeof TemplatePicker> | null>(null)
// Scrivendo "/" in un oggetto vuoto si apre il selettore; il testo dopo la "/" fa da ricerca
watch(
  () => repo.subject,
  (s, old) => {
    if (repo.templatePicker === null && !old && s.startsWith('/')) repo.templatePicker = 'slash'
    else if (repo.templatePicker === 'slash' && !s.startsWith('/')) repo.templatePicker = null
  },
)

function onSubjectKey(e: KeyboardEvent) {
  if (repo.templatePicker === 'slash') picker.value?.onKey(e)
}

async function chooseTemplate(t: CommitTemplate) {
  const slash = repo.templatePicker === 'slash'
  repo.templatePicker = null
  const typed = repo.body.trim() !== '' || (!slash && repo.subject.trim() !== '')
  if (typed && !window.confirm(`Sostituire il messaggio con il template «${t.name}»?`)) return
  repo.applyTemplate(t)
  await nextTick()
  const el = subjectInput.value
  el?.focus()
  el?.setSelectionRange(el.value.length, el.value.length)
}

const sections = computed(() => {
  const s = repo.status
  if (!s) return []
  const all: { area: WorkingArea; title: string; files: WorkingFile[] }[] = [
    { area: 'conflicted', title: 'In conflitto', files: s.conflicted },
    { area: 'staged', title: 'In stage', files: s.staged },
    { area: 'unstaged', title: 'Modificati', files: s.unstaged },
    { area: 'untracked', title: 'Non tracciati', files: s.untracked },
  ]
  return all.filter((section) => section.files.length)
})

const isSelected = (file: WorkingFile, area: WorkingArea) => repo.working?.area === area && repo.working.file.path === file.path

async function openFile(file: WorkingFile) {
  const r = await window.api.openInEditor(props.root, file.path)
  if (!r.ok) repo.error = r.error.message
}

function discard(file: WorkingFile, area: WorkingArea) {
  const question = area === 'untracked' ? `Eliminare ${file.path}?` : `Scartare le modifiche a ${file.path}?`
  if (window.confirm(`${question} Non si può annullare.`)) void repo.discard([file], area === 'untracked')
}

async function createStash() {
  await repo.stashPush(stashMessage.value, stashUntracked.value)
  stashMessage.value = ''
  stashUntracked.value = false
  showStash.value = false
}
</script>

<template>
  <section class="working">
    <div class="commit">
      <div class="subject">
        <input
          ref="subjectInput"
          v-model="repo.subject"
          data-testid="commit-subject"
          placeholder="Oggetto del commit (/ per i template)"
          @keydown="onSubjectKey"
          @blur="repo.templatePicker === 'slash' && (repo.templatePicker = null)"
        />
        <span class="count" :class="subjectLength">{{ repo.subject.length }}</span>
        <TemplatePicker
          v-if="repo.templatePicker"
          ref="picker"
          :root="root"
          :filter="repo.templatePicker === 'slash' ? repo.subject.slice(1) : undefined"
          @choose="chooseTemplate"
          @close="repo.templatePicker = null"
        />
      </div>
      <textarea
        v-model="repo.body"
        data-testid="commit-body"
        rows="3"
        placeholder="Descrizione (facoltativa)"
        :class="{ guided: app.preferences.bodyGuide > 0 }"
        :style="{ '--guide': `calc(8px + ${app.preferences.bodyGuide}ch)` }"
      />
      <div class="commit-actions">
        <label>
          <input
            type="checkbox"
            data-testid="amend"
            :checked="repo.amend"
            @change="repo.setAmend(($event.target as HTMLInputElement).checked)"
          />
          Amend
        </label>
        <button data-testid="stash-toggle" @click="showStash = !showStash">Stash…</button>
        <!-- mousedown.prevent: il campo di ricerca aperto non perde il fuoco, così il clic chiude invece di riaprire -->
        <button
          data-testid="template-toggle"
          @mousedown.prevent
          @click="repo.templatePicker = repo.templatePicker === 'button' ? null : 'button'"
        >Template</button>
        <span class="spacer" />
        <button class="primary" data-testid="commit-button" :disabled="!repo.canCommit" @click="repo.commitChanges()">
          Commit <kbd>{{ commitKeys }}</kbd>
        </button>
      </div>
      <form v-if="showStash" class="stash" @submit.prevent="createStash">
        <input v-model="stashMessage" data-testid="stash-message" placeholder="Messaggio dello stash (facoltativo)" />
        <label><input v-model="stashUntracked" type="checkbox" data-testid="stash-untracked" /> Includi non tracciati</label>
        <button data-testid="stash-create">Crea stash</button>
      </form>
    </div>

    <div class="files">
      <p v-if="!sections.length" class="muted empty">Nessuna modifica</p>
      <section v-for="section in sections" :key="section.area" :data-testid="`section-${section.area}`">
        <header>
          <strong>{{ section.title }}</strong>
          <span class="muted">({{ section.files.length }})</span>
          <span class="spacer" />
          <button v-if="section.area === 'staged'" data-testid="unstage-all" @click="repo.unstageEverything()">Togli tutto</button>
          <button v-else-if="section.area !== 'conflicted'" data-testid="stage-all" @click="repo.stage(section.files)">Aggiungi tutto</button>
        </header>
        <ul>
          <li
            v-for="f in section.files"
            :key="f.path"
            :class="{ selected: isSelected(f, section.area) }"
            data-testid="working-file"
            @click="repo.selectWorkingFile(f, section.area)"
          >
            <span class="status" :class="f.status">{{ f.status }}</span>
            <span class="path">{{ f.oldPath ? `${f.oldPath} → ${f.path}` : f.path }}</span>
            <span class="actions" @click.stop>
              <button v-if="section.area === 'staged'" data-testid="unstage-file" @click="repo.unstage([f])">Togli</button>
              <template v-else-if="section.area === 'conflicted'">
                <button data-testid="open-file" @click="openFile(f)">Apri</button>
                <button data-testid="stage-file" @click="repo.stage([f])">Segna come risolto</button>
              </template>
              <template v-else>
                <button data-testid="stage-file" @click="repo.stage([f])">Aggiungi</button>
                <button v-if="section.area === 'untracked'" data-testid="ignore-file" @click="repo.ignore(f)">Ignora</button>
                <button data-testid="discard-file" @click="discard(f, section.area)">
                  {{ section.area === 'untracked' ? 'Elimina' : 'Scarta' }}
                </button>
              </template>
            </span>
          </li>
        </ul>
      </section>
    </div>

    <template v-if="repo.working && repo.workingDiff">
      <div class="diff-bar">
        <span class="path muted">{{ repo.working.file.path }}</span>
        <label>
          <input type="checkbox" :checked="repo.diffOptions.ignoreWhitespace" @change="repo.toggleWhitespace()" />
          Ignora spazi
        </label>
      </div>
      <StageDiff :root="root" :diff="repo.workingDiff" />
    </template>
  </section>
</template>

<style scoped>
.working { display: flex; flex-direction: column; min-width: 0; min-height: 0; overflow: hidden; }
.commit { display: flex; flex-direction: column; gap: 6px; padding: 10px 12px; border-bottom: 1px solid var(--border); }
.subject { position: relative; display: flex; align-items: center; gap: 8px; }
.subject input { flex: 1; font-weight: 600; }
.count { width: 24px; font-size: 11px; color: var(--fg-muted); text-align: right; font-variant-numeric: tabular-nums; }
.count.long { color: #bf8700; }
.count.over { color: var(--danger); }
textarea { font: 12px/1.4 ui-monospace, 'SF Mono', Menlo, Consolas, monospace; color: inherit; background: var(--bg); border: 1px solid var(--border); border-radius: 5px; padding: 5px 8px; resize: vertical; }
.commit-actions, .stash { display: flex; align-items: center; gap: 10px; font-size: 12px; }
.stash input:not([type]) { flex: 1; }
kbd { opacity: 0.8; margin-left: 4px; }
.files { max-height: 35%; overflow: auto; border-bottom: 1px solid var(--border); }
.files section header { display: flex; align-items: center; gap: 6px; padding: 4px 12px; background: var(--bg-alt); font-size: 12px; position: sticky; top: 0; }
.files header button, .actions button { padding: 0 8px; font-size: 11px; }
.files ul { margin: 0; padding: 2px 0; list-style: none; }
.files li { display: flex; align-items: center; gap: 8px; padding: 2px 12px; cursor: default; }
.files li:hover { background: var(--bg-hover); }
.files li.selected { background: var(--bg-hover); font-weight: 600; }
.status { width: 14px; font-weight: 700; text-align: center; }
.status.A, .status\? { color: #2da44e; }
.status.D, .status.U { color: var(--danger); }
.status.M { color: #bf8700; }
.status.R { color: #8250df; }
.path { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.actions { display: flex; gap: 4px; }
.empty { padding: 12px; }
.diff-bar { display: flex; align-items: center; gap: 10px; padding: 4px 12px; border-bottom: 1px solid var(--border); font-size: 12px; }
.diff-bar .path { flex: 1; }
/* Guida verticale a N colonne nella descrizione (solo visiva) */
textarea.guided { background-image: linear-gradient(to right, transparent calc(var(--guide) - 1px), var(--border) calc(var(--guide) - 1px), var(--border) var(--guide), transparent var(--guide)); background-repeat: no-repeat; }
</style>
