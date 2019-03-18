import hashString from 'string-hash'
import { applyPatch, createPatch, merge3, PatchCompressed } from '../lib/diff3'
import { Stream } from '../util/stream'
import { START, END } from './assistor.types'
import { NoteError } from './editor'

export const verify = (str: string, hash: number): boolean => {
  return str != null && hashString(str) === hash
}

// export function remoteNoteStream(editor: HTMLTextAreaElement): Stream<string> {
//   const remoteNote$ = Stream(editor.value)
//   socket.on(
//     'note_update',
//     ({ h: hash, p: patch }: { h: number; p: PatchCompressed }) => {
//       const newNote = applyPatch(remoteNote$(), patch)
//       if (verify(newNote, hash)) {
//         remoteNote$(newNote)
//       } else {
//         isRemoteNoteStale$(true)
//       }
//     }
//   )
//   // socket.emit('subscribe', { id: id })
//   return remoteNote$
// }
// export function fetchNote(): void {
//   socket.emit('get', { id: id }, ({ note }: { note?: string } = {}) => {
//     if (note != null && isRemoteNoteStale$()) {
//       remoteNote$(note)
//       if (editor.disabled) {
//         editor.disabled = false
//       }
//     }
//   })
// }
export function mergeToEditor(
  editor: HTMLTextAreaElement,
  newRemoteNote: string
): void {
  if (newRemoteNote === editor.value) {
    commonParent$(newRemoteNote)
  } else if (commonParent$() === editor.value) {
    loadToEditor(newRemoteNote)
    commonParent$(newRemoteNote)
  } else {
    const merged = merge3(newRemoteNote, commonParent$(), editor.value)
    if (merged == null) {
      console.warn(
        'failed to merge with remote version, discarding local version :('
      )
      loadToEditor(newRemoteNote)
      commonParent$(newRemoteNote)
    } else {
      console.info('merged with remote version :)')
      loadToEditor(merged)
      commonParent$(newRemoteNote)
      shouldSave$(null)
    }
  }
}
function loadToEditor(note: string) {
  if (note !== editor.value) {
    const nextWithSelectionMark = getNextWithSelectionMark(editor.value, note)
    const [before, _start, between, _end, after] = nextWithSelectionMark.split(
      new RegExp(`(${START}|${END})`, 'mg')
    )
    editor.value = [before, between, after].join('')
    editor.setSelectionRange(before.length, before.length + between.length)
  }
  function getNextWithSelectionMark(prev: string, next: string): string {
    const selectionStart = editor.selectionStart
    const selectionEnd = editor.selectionEnd
    const prevWithSelectionMark =
      prev.substring(0, selectionStart) +
      START +
      prev.substring(selectionStart, selectionEnd) +
      END +
      prev.substring(selectionEnd)
    const nextWithSelectionMark = merge3(next, prev, prevWithSelectionMark)
    if (nextWithSelectionMark == null) {
      return next + START + END
    } else {
      return nextWithSelectionMark
    }
  }
}
export function saveToRemote(note: string) {
  const remoteNote = remoteNote$()
  if (!isSaving$() && note !== remoteNote) {
    isSaving$(true)
    const msg = {
      id: id,
      p: createPatch(remoteNote, note),
      h: hashString(note),
    }
    socket.emit('save', msg, ({ error }: { error?: NoteError } = {}) => {
      isSaving$(false)
      if (!error) {
        commonParent$(note)
        remoteNote$(note)
      } else {
        if (error.errcode === 'HASH_MISMATCH') {
          isRemoteNoteStale$(true)
        } else if (error.errcode === 'EXCEEDED_MAX_SIZE') {
          window.alert(
            'Note exceeded max size (100,000 characters), please do not abuse this free service.'
          )
        }
      }
    })
  }
}
