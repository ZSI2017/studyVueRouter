### 路由导航完成Complete

内部`queue`数组中所有的函数执行完成后，同样执行传入的匿名回调函数。
函数体内`onComplete()`,对应在`transitionTo`内部调用`this.confirmTransition`时，传入的第二个匿名函数，
``` js
() => {
  // 路由改变，触发
  this.updateRoute(route)
  // 跳转的路由守卫 触发完成后
  onComplete && onComplete(route)
  this.ensureURL()

  // fire ready cbs once
  if (!this.ready) { // onReady 在路由完成初始导航时调用。
    this.ready = true
    this.readyCbs.forEach(cb => { cb(route) })
  }
}
```
执行`this.updateRoute`,
``` js
updateRoute (route: Route) {
  const prev = this.current
  this.current = route
  this.cb && this.cb(route)
  this.router.afterHooks.forEach(hook => {
    hook && hook(route, prev)
  })
}
```
更新 this.current ，如果在index.js 中定义了afterHooks全局钩子函数，则在这里执行。
回到匿名函数，接着执行真正的`onComplete`，这个`onComplete`对应`tansitionTo`执行时传入的函数，`index.js`中的`setupHashListener`，在最开始讲入口的时候提到过，在`history/hash.js`
``` js
setupListeners () {
  const router = this.router
  // scrollBehavior 当切换新路由时， 调整页面是否滚动到顶部，或者保持原先的滚动位置，
  // 这个功能只会在支持 history.pushState 的浏览器中使用 supportsPushState;
  const expectScroll = router.options.scrollBehavior
  const supportsScroll = supportsPushState && expectScroll

  if (supportsScroll) {
    // 支持 scroll 滚动行为
    // 利用 pageXOffset ， pageYOffset 记录当前页面的滚动位置。
    setupScroll()
  }

  window.addEventListener(supportsPushState ? 'popstate' : 'hashchange', () => {
    const current = this.current
    if (!ensureSlash()) {
      // 如果不是 #/ 开头的 hash 模式，
      // 则直接返回
      return
    }
    this.transitionTo(getHash(), route => {
      // 路由守卫 触发完成后的回调
      // 同时异步路由组件已经解析完成。
      if (supportsScroll) {
        handleScroll(this.router, route, current, true)
      }
      // 支持 pushState in  window.history;
      // 不支持的情况下，使用 window.location.replace 替换路由中的hash值。
      if (!supportsPushState) {
        replaceHash(route.fullPath)
      }
    })
  })
}
```
如果支持`supportsScroll`记录页面滚动的位置`pageXOffset`和`pageYOffset`,保存在全局的positionStore对象里面,转到`util/scroll.js`，定义了`setupScroll`
``` js
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
```
里面的`savedPosition`保存页面的位置，放在positionStore 对象里面，key值就取`util/push-state.js`中设置key的方法，通`history.replaceState`方法，存放在状态对象state中，然后在监听`popstate`事件被触发后，获取之前在页面中保存的e.state.key，
``` js
// use User Timing api (if present) for more accurate key precision
// https://w3c.github.io/user-timing/
// 利用window.performance 更准确的测量 应用的性能
// 这里利用performance 获取 时间戳，设置key 值。
const Time = inBrowser && window.performance && window.performance.now
  ? window.performance
  : Date
function genKey (): string {
  return Time.now().toFixed(3)
}
```
通过获取当前时间戳，设置对应key值，记录即将离开的页面的滚动位置。接着就是恢复页面的滚动位置。
通过监听`popstate`或者`hashchange`事件回调上，设置页面跳转的监听事件，如果监听到页面跳转，在事件回调里面再次执行`transitionTo`函数，完成路由信息更新以及一系列的钩子函数执行，在匿名回调函数里面可以看到
``` js
handleScroll(this.router, route, current, true);
```
就是恢复页面滚动位置的操作。在`util/scroll.js`文件中。
``` js
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
```
在  `router.app.$nextTick`回调中执行，保证页面dom结构渲染完成，`getScrollPosition`获取到上次离开该页面的滚动位置，`scrollBehavior`是用户定义的滚动位置的函数，区分传入是否为promise函数，
通过`scrollToPosition`，滚动页面到指定位置。
