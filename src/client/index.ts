import m from 'mithril'
import { Editor } from './component/editor'
import { NetworkEvent, networkEventMap } from './lib/network'
import { Stream } from './util/stream'

const App: m.FactoryComponent = () => {
  const id = decodeURIComponent(location.pathname.slice(1))

  const $setIsSaving = Stream<boolean>(false)
    .unique()
    .log('isSaving')

  const $setNetwork = Stream<NetworkEvent>().log('network')

  const $saveStatusClass = Stream.merge([
    $setIsSaving.filter(Boolean).map(() => 'is-active'),
    $setIsSaving
      .filter(isSaving => !isSaving)
      .debounce(300)
      .map(() => ''),
  ]).log('status')

  const $networkStatus = $setNetwork.map(status => {
    return networkEventMap[status]
  })

  const $uiStates = Stream.merge([$saveStatusClass, $networkStatus]).log('ui')

  $uiStates.subscribe(() => m.redraw())

  return {
    oninit(): void {
      document.title = `${id} · notepad`
    },

    view() {
      const href = location.origin + '/' + id
      return m(
        'main',
        m('header', [
          m('small#save-status', { class: $saveStatusClass() }, 'saving'),
          m('small#network-status', $networkStatus()),
        ]),
        m('section', [
          m('.layer', [
            m('.layer', [
              m('.layer', [
                m(Editor, {
                  id: id,
                  onSaveStatusChange: $setIsSaving,
                  onNetworkChange: $setNetwork,
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
