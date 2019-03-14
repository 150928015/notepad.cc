import m from 'mithril'
import SocketClient from 'socket.io-client'
import { Editor } from './component/editor'
import './style/main.css'
const socket = SocketClient()

const getId = (): string => {
  return decodeURIComponent(location.pathname.slice(1))
}

const App: m.FactoryComponent = () => {
  let id = ''
  let networkStatus = ''
  let saveStatusClass = ''
  let saveStatusTimer = undefined as number | undefined

  const startMonitorNetwork = () => {
    type NetworkEvent =
      | 'connect'
      | 'reconnect'
      | 'reconnect_attempt'
      | 'connect_error'
      | 'connect_timeout'
      | 'reconnect_error'
      | 'reconnect_failed'
    const events: { [key in NetworkEvent]: string } = {
      connect: '',
      reconnect: '',
      reconnect_attempt: 'connection lost',
      connect_error: 'connection lost',
      connect_timeout: 'connection lost',
      reconnect_error: 'connection lost',
      reconnect_failed: 'connection lost',
    }
    Object.keys(events).forEach(evt =>
      socket.on(evt, () => {
        networkStatus = events[evt as NetworkEvent] as string
        m.redraw()
      })
    )
  }

  const onSaveStatusChange = (isSaving: boolean): void => {
    clearTimeout(saveStatusTimer)
    if (isSaving) {
      saveStatusClass = 'show'
      m.redraw()
    } else {
      saveStatusTimer = window.setTimeout(() => {
        saveStatusClass = ''
        m.redraw()
      }, 300)
    }
  }

  return {
    oninit(): void {
      id = getId()
      document.title = `${id} · notepad`
      startMonitorNetwork()
    },

    view() {
      const href = location.origin + '/' + id
      return m(
        'main',
        m('header', [
          m('small#save-status', { class: saveStatusClass }, 'saving'),
          m('small#network-status', networkStatus),
        ]),
        m('section', [
          m('.layer', [
            m('.layer', [
              m('.layer', [
                m(Editor, {
                  socket: socket,
                  id: id,
                  onStatusChange: onSaveStatusChange,
                }),
              ]),
            ]),
          ]),
        ]),
        m(
          'footer',
          m('small', m('a.this-page', { href }, decodeURIComponent(href)))
        )
      )
    },
  }
}

m.mount(document.body, App)
