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

// 支持滚动行为
export function handleScroll (
  router: Router,
  to: Route,
  from: Route,
  isPop: boolean
) {
  // 当前 vue 根实例。
  if (!router.app) {
    return
  }

  // 对于滚动行为的 页面定位参数。
  const behavior = router.options.scrollBehavior
  if (!behavior) {
    return
  }

  if (process.env.NODE_ENV !== 'production') {
    // 传入参数 校验
    assert(typeof behavior === 'function', `scrollBehavior must be a function`)
  }

  // wait until re-render finishes before scrolling
  // 待页面渲染完成后 实现滚动。
  router.app.$nextTick(() => {
    const position = getScrollPosition()
    /*
     * scrollBehavior (to, from, savedPosition) {
     *    // return 期望滚动到哪个的位置
     * }
     */
    const shouldScroll = behavior.call(router, to, from, isPop ? position : null)

    if (!shouldScroll) {
      return
    }

    if (typeof shouldScroll.then === 'function') {
      // 返回promise的异步滚动。
      shouldScroll.then(shouldScroll => {
        // 在promise 的then方法中执行页面滚动行为
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
    // 返回 上一时刻的 position 定位
    return positionStore[key]
  }
}

function getElementPosition (el: Element, offset: Object): Object {
  const docEl: any = document.documentElement
  // https://developer.mozilla.org/zh-CN/docs/Web/API/Element/getBoundingClientRect
  // 返回元素相对于视口的位置，通常 相对于视口的左上角位置而言。
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
      offset = normalizeOffset(offset)            // 判断 传入参数的 正确性
      position = getElementPosition(el, offset)   // 经过 offset 计算后， 新的 position 位置。
    } else if (isValidPosition(shouldScroll)) {   // x 和 y 坐标，存在任何一个，则可以认为 一个合法的 position.
      position = normalizePosition(shouldScroll)  // 没有传入 x 或 y, 则使用 window.pageYOffset window.pageXOffset 代替。
    }
  } else if (isObject && isValidPosition(shouldScroll)) {
    position = normalizePosition(shouldScroll)  // 如果是简单的返回了 {x:0,y:0} 组成的对象。
  }

  if (position) { // window.scrollTo() 实现滚动。
    window.scrollTo(position.x, position.y)
  }
}
