/* @flow */

import type Router from '../index'
import { assert } from './warn'
import { getStateKey, setStateKey } from './push-state'

const positionStore = Object.create(null)

export function setupScroll () {
  // Fix for #1585 for Firefox
  /* replaceState（） 三个参数。
   *   状态对象， 状态对象 state 是一个JavaScript 对象，在 popstate事件被触发时，可以通过 state 拿到
   *   标题：     目前没忽略，document.title = xxx 代替
   *    URL:      定义了新的 url,浏览器并不会检查的url对应的 xxx.html 是否存在，
   **/
  window.history.replaceState({ key: getStateKey() }, '')
  // 监听 popstate 事件变化，
  window.addEventListener('popstate', e => {
    saveScrollPosition()
    if (e.state && e.state.key) {
      // 更新 key 值。
      setStateKey(e.state.key)
    }
  })
}

export function handleScroll (
  router: Router,
  to: Route,
  from: Route,
  isPop: boolean
) {
  if (!router.app) {
    return
  }

  const behavior = router.options.scrollBehavior
  if (!behavior) {
    return
  }

  if (process.env.NODE_ENV !== 'production') {
    assert(typeof behavior === 'function', `scrollBehavior must be a function`)
  }

  // wait until re-render finishes before scrolling
  router.app.$nextTick(() => {
    const position = getScrollPosition()
    const shouldScroll = behavior.call(router, to, from, isPop ? position : null)

    if (!shouldScroll) {
      return
    }

    if (typeof shouldScroll.then === 'function') {
      shouldScroll.then(shouldScroll => {
        scrollToPosition((shouldScroll: any), position)
      }).catch(err => {
        if (process.env.NODE_ENV !== 'production') {
          assert(false, err.toString())
        }
      })
    } else {
      scrollToPosition(shouldScroll, position)
    }
  })
}

// 保存 popstate 事件触发时，
/* 页面位置：
      window.pageXOffset，
      window.pageYOffset
 */
export function saveScrollPosition () {
  const key = getStateKey() // 保存某一时刻的 position 定位。
  if (key) {
    positionStore[key] = {
      x: window.pageXOffset,
      y: window.pageYOffset
    }
  }
}

function getScrollPosition (): ?Object {
  const key = getStateKey()
  if (key) {
    return positionStore[key]
  }
}

function getElementPosition (el: Element, offset: Object): Object {
  const docEl: any = document.documentElement
  const docRect = docEl.getBoundingClientRect()
  const elRect = el.getBoundingClientRect()
  return {
    x: elRect.left - docRect.left - offset.x,
    y: elRect.top - docRect.top - offset.y
  }
}

function isValidPosition (obj: Object): boolean {
  return isNumber(obj.x) || isNumber(obj.y)
}

function normalizePosition (obj: Object): Object {
  return {
    x: isNumber(obj.x) ? obj.x : window.pageXOffset,
    y: isNumber(obj.y) ? obj.y : window.pageYOffset
  }
}

function normalizeOffset (obj: Object): Object {
  return {
    x: isNumber(obj.x) ? obj.x : 0,
    y: isNumber(obj.y) ? obj.y : 0
  }
}

function isNumber (v: any): boolean {
  return typeof v === 'number'
}

function scrollToPosition (shouldScroll, position) {
  const isObject = typeof shouldScroll === 'object'
  if (isObject && typeof shouldScroll.selector === 'string') {
    const el = document.querySelector(shouldScroll.selector)
    if (el) {
      let offset = shouldScroll.offset && typeof shouldScroll.offset === 'object' ? shouldScroll.offset : {}
      offset = normalizeOffset(offset)
      position = getElementPosition(el, offset)
    } else if (isValidPosition(shouldScroll)) {
      position = normalizePosition(shouldScroll)
    }
  } else if (isObject && isValidPosition(shouldScroll)) {
    position = normalizePosition(shouldScroll)
  }

  if (position) {
    window.scrollTo(position.x, position.y)
  }
}
