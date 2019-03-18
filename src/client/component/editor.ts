import createSocketClient from 'socket.io-client'
import m, { Component, FactoryComponent } from 'mithril'
import { PatchCompressed, applyPatch } from '../lib/diff3'
import { Stream } from '../util/stream'
import { assist } from './assist'
import { NetworkEvent, networkEventMap } from '../lib/network'
import {
  remoteNoteStream,
  compositingStream,
  mergeToEditor,
  fetchNote,
  saveToRemote,
  setBeforeUnloadPrompt,
  verify,
} from './editor.service'

export interface NoteError {
  errcode: string
}

type SocketEvent = {
  note_update: { h: number; p: PatchCompressed }
  subscribe: { id: string }
}

export interface EditorProps {
  id: string
  onSaveStatusChange: (isSaving: boolean) => void
  onNetworkChange: (status: NetworkEvent) => void
}

export const Editor: FactoryComponent<EditorProps> = props => {
  const socket = createSocketClient()

  const unsubscribers: (() => void)[] = []
  const addToUnsubscribers = (unsub: () => void) => {
    unsubscribers.push(unsub)
  }

  const createSocketStream = <T extends keyof SocketEvent>(
    event: T
  ): Stream<SocketEvent[T]> => {
    return Stream.fromEvent(socket, event, addToUnsubscribers)
  }
  const callSocket = <T>(event: string, payload: any) =>
    new Promise<T>((resolve, reject) => {
      socket.emit(event, payload, result => {
        resolve(result)
      })
    })
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

      const fetchNote = () => callSocket<{ note?: string }>('get', { id })

      //-------------- sources --------------
      const $receivedNoteUpdate = createSocketStream('note_update')
      const $triggerFetch = Stream<null>()
      const $compositing = compositingStream(editor, addToUnsubscribers)
      const $notCompositing = $compositing.map(c => !c)

      //-------------- transformers  --------------

      const $input = Stream.fromEvent(editor, 'input', addToUnsubscribers)
        .map(() => null)
        .log('input')

      const $keydown = Stream.fromEvent<KeyboardEvent>(
        editor,
        'keydown',
        addToUnsubscribers
      ).log('keydown')

      const $triggerSave = $input
        .debounce(500)
        .map(() => null)
        .log('shouldSave')

      //-------------- sinks  --------------
      const $emitSubscribe = createSocketStream('subscribe')
      const $receivedNewNote = $receivedNoteUpdate.map(
        ({ h: hash, p: patch }) => {
          const note = applyPatch($remoteNote(), patch)
          return { hash, patch, note }
        }
      )
      const $receivedNewNoteVerified = $receivedNewNote.filter(r =>
        verify(r.note, r.hash)
      )

      const $receivedNewNoteInvalid = $receivedNewNote.filter(
        r => !verify(r.note, r.hash)
      )

      const $noteFetched = $triggerFetch
        .map(() => Stream.fromPromise(fetchNote()))
        .flatten()
        .filter(({ note }) => {
          return note != null
        })
        .map(val => val.note!)

      const $remoteNoteStale = Stream.merge([
        // Stream<boolean>(false),
        $receivedNewNoteInvalid.map(() => true),
        $noteFetched.map(() => false),
      ])

      const $remoteNote = Stream.merge([
        Stream(editor.value),
        $receivedNewNoteVerified.map(val => val.note),
        $noteFetched,
      ])

      const $commonParent = Stream(editor.value).log('commonParent') // the 'o' in threeWayMerge(a,o,b)

      //-------------- effects --------------
      $emitSubscribe({ id })
      $triggerFetch()

      // const remoteNote$ = remoteNoteStream().log('removeNote')

      // const isRemoteNoteStale$ = remoteNote$
      //   .map(() => false as boolean)
      //   .log('isRemoteNoteStale')

      // const isNotCompositing$ = compositingStream(editor)
      //   .unique()
      //   .map(comp => !comp)
      //   .log('isNotCompositing')

      const shouldSave$ = input$
        .debounce(500)
        .map(() => null)
        .log('shouldSave')

      const isSaving$ = Stream<boolean>(false).log('isSaving')

      const isEditorDirty$ = Stream.merge([
        input$.map(() => true),
        isSaving$.filter(s => !s).map(() => false),
      ])
        .startsWith(false)
        .log('isEditorDirty')

      //------ listeners --------
      keydown$
        .filter(() => isNotCompositing$())
        .subscribe(key => assist(editor, key, () => input$(null)))

      remoteNote$.until(isNotCompositing$).subscribe(mergeToEditor, false)

      isRemoteNoteStale$
        .unique()
        .filter(Boolean)
        .subscribe(fetchNote)

      $triggerSave
        .until(isNotCompositing$)
        .subscribe(() => saveToRemote(editor.value), false)

      isSaving$.unique().subscribe(onSaveStatusChange)

      isEditorDirty$.subscribe(setBeforeUnloadPrompt)

      //------- trigger fist fetch ---------
      isRemoteNoteStale$(true)
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
