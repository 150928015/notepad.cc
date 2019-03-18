import m from 'mithril'
import { Editor } from './component/editor'
import { NetworkEvent, networkEventMap } from './lib/network'
import { Stream } from './util/stream'

const getId = (): string => {
  return decodeURIComponent(location.pathname.slice(1))
}

const App: m.FactoryComponent = () => {
  let id = ''
  let networkStatus = ''
  let saveStatusClass = ''

  const isSaving$ = Stream<boolean>(false)
    .unique()
    .log('isSaving')

  isSaving$.filter(Boolean).subscribe(() => {
    saveStatusClass = 'is-active'
    m.redraw()
  })
  isSaving$
    .filter(isSaving => !isSaving)
    .debounce(300)
    .subscribe(() => {
      saveStatusClass = ''
      m.redraw()
    })

  const $network = Stream<NetworkEvent>().log('network')
  $network.subscribe(status => {
    networkStatus = networkEventMap[status]
    m.redraw()
  })

  return {
    oninit(): void {
      id = getId()
      document.title = `${id} · notepad`
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
                  id: id,
                  onSaveStatusChange: isSaving$,
                  onNetworkChange: $network,
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
