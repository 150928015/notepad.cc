import createSocketClient from 'socket.io-client'
import m, { Component, FactoryComponent } from 'mithril'
import { PatchCompressed, applyPatch } from '../lib/diff3'
import { Stream } from '../util/stream'
import { assist } from './assist'
import { NetworkEvent, networkEventMap } from '../lib/network'
import { verify } from './editor.service'

export interface NoteError {
  errcode: string
}

type SocketEvent = {
  note_update: { h: number; p: PatchCompressed }
}
type SocketRemoteMethods = {
  subscribe: { params: { id: string }; result: undefined }
  get: {
    params: { id: string }
    result: { note?: string }
  }
}

type Unsubscriber = () => void

export interface EditorProps {
  id: string
  onSaveStatusChange: (isSaving: boolean) => void
  onNetworkChange: (status: NetworkEvent) => void
}

export const Editor: FactoryComponent<EditorProps> = props => {
  const socket = createSocketClient()

  let editor: HTMLTextAreaElement

  //-------------- state --------------
  let status: 'idle' | 'localChanged' | 'remoteChanged' | 'bothChanged'
  let remoteNote: string
  let localNote: string
  let commonNote: string

  let isCompositing = false

  //-------------- effects --------------

  //-------------- handlers --------------
  const onInput = () => {}

  const onKeyDown = (e: KeyboardEvent) => {
    console.log(e)
  }
  const onCompositionStart = () => {
    isCompositing = true
  }
  const onCompositionEnd = () => {
    isCompositing = false
  }

  const onBeforeUnload = (e: BeforeUnloadEvent) => {}

  const onReceivedUpdate = ({
    h: hash,
    p: patch,
  }: {
    h: number
    p: PatchCompressed
  }) => {
    const newNote = applyPatch(remoteNote, patch)
    if (verify(newNote, hash)) {
      remoteNote = newNote
    } else {
      isRemoteNoteStale$(true)
    }
  }

  const onRemoteNoteStale = () => {}

  return {
    oncreate({
      dom,
      attrs: { id, onSaveStatusChange, onNetworkChange },
    }): void {
      editor = dom as HTMLTextAreaElement
      remoteNote = editor.value
      localNote = editor.value
      commonNote = editor.value
      status = 'idle'
      socket.on('note_update', onReceivedUpdate)
      socket.emit('subscribe', { id: id })

      // monitor network
      const networkEvents = Object.keys(networkEventMap)
      networkEvents.forEach(event => {
        const listener = () =>
          props.attrs.onNetworkChange(event as NetworkEvent)
        socket.on(event, listener)
      })

      // before unload
      window.addEventListener('beforeunload', onBeforeUnload)
    },
    onbeforeupdate() {
      // update textarea manually
      return false
    },
    onremove() {
      socket.close()
      socket.removeAllListeners()
      window.removeEventListener('beforeunload', onBeforeUnload)
    },
    view() {
      return m(
        'textarea#editor',
        {
          spellcheck: 'false',
          oninput: onInput,
          onkeydown: onKeyDown,
          oncompositionstart: onCompositionStart,
          oncompositionend: onCompositionEnd,
        },
        '(Loading...)'
      )
    },
  }
}
