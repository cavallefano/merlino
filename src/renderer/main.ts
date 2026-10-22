import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import { useAppStore } from './stores/app'
import './styles.css'

const app = createApp(App).use(createPinia())
const store = useAppStore()
app.config.errorHandler = (err) => store.pushUiError(err)
window.addEventListener('error', (e) => store.pushUiError(e.error ?? e.message))
window.addEventListener('unhandledrejection', (e) => store.pushUiError(e.reason))
app.mount('#app')
void store.init()
