import { RefObject } from 'react'
import { ReactEditor } from '../../plugin/react-editor'
import { isDOMElement } from '../../utils/dom'

export type RestoreDOMManager = {
  registerMutations: (mutations: MutationRecord[]) => void
  restoreDOM: () => void
  clear: () => void
}

export const createRestoreDomManager = (
  editor: ReactEditor,
  receivedUserInput: RefObject<boolean>
): RestoreDOMManager => {
  let bufferedMutations: MutationRecord[] = []

  const clear = () => {
    bufferedMutations = []
  }

  const registerMutations = (mutations: MutationRecord[]) => {
    if (!receivedUserInput.current) {
      return
    }

    const trackedMutations = mutations.filter(mutation => {
      if (isTracked(mutation, mutations)) {
        return true
      }

      console.log('ignoring mutation', mutation)

      return false
    })

    bufferedMutations.push(...trackedMutations)
  }

  const isTracked = (
    mutation: MutationRecord,
    batch: MutationRecord[]
  ): boolean => {
    const { target } = mutation
    const parentMutation = batch.find(
      ({ addedNodes, removedNodes }) =>
        Array.from(addedNodes).includes(target) ||
        Array.from(removedNodes).includes(target)
    )

    // Target add/remove is tracked. Track the mutation if we track the parent mutation.
    if (parentMutation) {
      return isTracked(parentMutation, batch)
    }

    const targetElement = (isDOMElement(target)
      ? target
      : target.parentElement) as HTMLElement | null

    if (!targetElement) {
      return false
    }

    if (targetElement === ReactEditor.toDOMNode(editor, editor)) {
      return true
    }

    if (
      !ReactEditor.hasDOMNode(editor, targetElement, { editable: true }) &&
      !targetElement.hasAttribute('data-slate-zero-width') &&
      !targetElement.hasAttribute('data-slate-string')
    ) {
      return false
    }

    const voidParent = targetElement.closest('data-slate-void')

    // Mutation isn't inside a void element
    if (!voidParent) {
      return true
    }

    const block = targetElement.closest('[data-slate-node="element"]')

    // If mutation is inside a block inside a void element, track it.
    return !!block && voidParent.contains(block)
  }

  function restoreDOM() {
    bufferedMutations.reverse().forEach(mutation => {
      if (mutation.type === 'characterData') {
        mutation.target.textContent = mutation.oldValue
        return
      }

      Array.from(mutation.removedNodes).forEach(node => {
        mutation.target.insertBefore(node, mutation.nextSibling)
      })

      Array.from(mutation.addedNodes).forEach(node => {
        mutation.target.removeChild(node)
      })
    })

    // Clear buffered mutations to ensure we don't undo them twice
    clear()
  }

  return {
    registerMutations,
    restoreDOM,
    clear,
  }
}