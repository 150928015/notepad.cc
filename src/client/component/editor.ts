import createSocketClient from 'socket.io-client'
import m, { Component, FactoryComponent } from 'mithril'
import { PatchCompressed, applyPatch } from '../lib/diff3'
import { Stream } from '../util/stream'
import { assist } from './assist'
import { NetworkEvent, networkEventMap } from '../lib/network'
import {
  mergeToEditor,
  saveToRemote,
  setBeforeUnloadPrompt,
  verify,
} from './editor.service'

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

const flip = (val: boolean) => !val

const compositingStream = (
  elem: HTMLElement,
  addToUnsubscribers: (unsub: Unsubscriber) => void
): Stream<boolean> => {
  const compositionStart$ = Stream.fromEvent(
    elem,
    'compositionstart',
    addToUnsubscribers
  )
  const compositionEnd$ = Stream.fromEvent(
    elem,
    'compositionend',
    addToUnsubscribers
  )
  const compositing$ = Stream.merge([
    compositionStart$.map(() => true),
    compositionEnd$.map(() => false),
  ])
    .startsWith(false)
    .unique()
  return compositing$
}

const createEditorService = ({
  editor,
  $triggerInputed,
  addToUnsubscribers,
}: {
  editor: HTMLTextAreaElement
  $triggerInputed: Stream<null>
  addToUnsubscribers: (unsub: Unsubscriber) => void
}) => {
  const $compositing = compositingStream(editor, addToUnsubscribers).log(
    'compositing'
  )

  const $notCompositing = $compositing.map(flip).log('notCompositing')

  const $input = Stream.merge([
    $triggerInputed,
    Stream.fromEvent(editor, 'input', addToUnsubscribers),
  ])
    .map(() => null)
    .log('input')

  const $keydown = Stream.fromEvent<KeyboardEvent>(
    editor,
    'keydown',
    addToUnsubscribers
  ).log('keydown')

  const $value = Stream(editor.value)

  return {
    $compositing,
    $notCompositing,
    $input,
    $keydown,
    $value,
  }
}

const createRemoteService = ({
  socket,
  id,
  $triggerFetch,
  addToUnsubscribers,
}: {
  socket: SocketIOClient.Socket
  id: string
  $triggerFetch: Stream<null>
  addToUnsubscribers: (unsub: Unsubscriber) => void
}) => {
  const fromSocketEvent = <T extends keyof SocketEvent>(
    event: T
  ): Stream<SocketEvent[T]> => {
    return Stream.fromEvent(socket, event, addToUnsubscribers)
  }

  const callSocket = <T extends keyof SocketRemoteMethods>(
    event: T,
    params: SocketRemoteMethods[T]['params']
  ): Promise<SocketRemoteMethods[T]['result']> =>
    new Promise((resolve, reject) => {
      socket.emit(event, params, resolve)
    })

  const fetchNote = () => callSocket('get', { id })

  const $receivedNoteUpdate = fromSocketEvent('note_update')
  const $receivedPatch = $receivedNoteUpdate.map(({ h: hash, p: patch }) => {
    const note = applyPatch($remoteNote(), patch)
    const valid = verify(note, hash)
    return { hash, patch, note, valid }
  })
  const $noteFetched = $triggerFetch
    .map(() => Stream.fromPromise(fetchNote()))
    .flatten()
    .filter(({ note }) => {
      return note != null
    })
    .map(val => val.note!)

  const $remoteNoteStale = Stream.merge([
    Stream<boolean>(true), // start
    $receivedPatch.filter(patch => !patch.valid).map(() => true),
    $noteFetched.map(() => false),
  ]).unique()

  const $remoteNote = Stream.merge([
    $receivedPatch.filter(patch => patch.valid).map(val => val.note),
    $noteFetched,
  ])

  return {
    $receivedNoteUpdate,
    $noteFetched,
    $remoteNoteStale,
    $remoteNote,
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

  const unsubscribers: Unsubscriber[] = []
  const addToUnsubscribers = (unsubscriber: Unsubscriber) => {
    unsubscribers.push(unsubscriber)
  }

  // monitor network
  Object.keys(networkEventMap).forEach(event => {
    const listener = () => props.attrs.onNetworkChange(event as NetworkEvent)
    socket.on(event, listener)
    addToUnsubscribers(() => socket.off(event, listener))
  })

  return {
    oncreate({
      dom,
      attrs: { id, onSaveStatusChange, onNetworkChange },
    }): void {
      const editor = dom as HTMLTextAreaElement

      const $triggerFetch = Stream<null>()
      const $triggerInputed = Stream<null>()

      const { $input, $notCompositing, $keydown } = createEditorService({
        editor,
        $triggerInputed,
        addToUnsubscribers,
      })

      const { $remoteNote, $remoteNoteStale } = createRemoteService({
        socket,
        id,
        $triggerFetch,
        addToUnsubscribers,
      })

      const $triggerSave = $input
        .debounce(500)
        .map(() => null)
        .until($notCompositing)
        .log('triggerSave')

      const $isSaving = Stream<boolean>(false).log('isSaving')
      const $justSaved = $isSaving.unique().filter(isSaving => !isSaving)

      const isEditorDirty$ = Stream.merge([
        $input.map(() => true),
        $justSaved.map(() => false),
      ])
        .startsWith(false)
        .unique()
        .log('isEditorDirty')

      //-------------- stream:remote --------------

      const $commonParent = Stream(editor.value).log('commonParent') // the 'o' in threeWayMerge(a,o,b)

      //-------------- effects --------------
      // $triggerFetch()

      $keydown
        .filter(() => $notCompositing())
        .subscribe(event => assist(editor, event, () => $triggerInputed(null)))

      $remoteNote
        .until($notCompositing)
        .subscribe(remoteNote => mergeToEditor(editor, remoteNote))

      $remoteNoteStale.filter(Boolean).subscribe(() => $triggerFetch())

      $triggerSave.subscribe(() => saveToRemote(editor.value), false)

      $isSaving.unique().subscribe(onSaveStatusChange)

      const promptUnsaved = (e: BeforeUnloadEvent) => {
        if (isEditorDirty$()) {
          const message = 'Your change has not been saved, quit?'
          e.returnValue = message // Gecko, Trident, Chrome 34+
          return message // Gecko, WebKit, Chrome <34
        }
      }
      window.addEventListener('beforeunload', promptUnsaved) // TODO
    },
    onbeforeupdate() {
      // update textarea manually
      return false
    },
    onremove() {
      socket.close()
      socket.removeAllListeners()
    },
    view() {
      return m(
        'textarea#editor',
        { disabled: true, spellcheck: 'false' },
        '(Loading...)'
      )
    },
  }
}
