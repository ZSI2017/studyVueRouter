上面路由跳转后，执行完queue数组中的钩子函数后,也就是完整的路由解析流程完成后，接着就执行runQueue 函数中传入的匿名函数
``` js
runQueue(queue, iterator, () => {
  const postEnterCbs = []  // 收集 beforeRouteEnter 对应的回调函数
  const isValid = () => this.current === route
  // wait until async components are resolved before
  // extracting in-component enter guards
  const enterGuards = extractEnterGuards(activated, postEnterCbs, isValid)
  const queue = enterGuards.concat(this.router.resolveHooks) // 即将进入的路由的钩子函数，以及完成后的钩子函数
  // 按顺序执行数组中的函数
  runQueue(queue, iterator, () => {
    if (this.pending !== route) {
      return abort()
    }
    this.pending = null
    // 执行完成后的回调函数。
    onComplete(route)
    if (this.router.app) { // 在vue 实例中注册了路由实例的时候，保存了 vue 实例的引用
      this.router.app.$nextTick(() => {
        // 执行在next 方法中传入的回调函数。
        postEnterCbs.forEach(cb => { cb() })
      })
    }
  })
})
```

`extractEnterGuards`解析`beforeRouteEnter`,同样使用`extractGuards`方法，传入的name 对应 `beforeRouteEnter`, 区别在于bind 函数不同，使用了`bindEnterGuard`，
``` js
function bindEnterGuard (
  guard: NavigationGuard,
  match: RouteRecord,
  key: string,
  cbs: Array<Function>,
  isValid: () => boolean
): NavigationGuard {
  return function routeEnterGuard (to, from, next) {
    // 调用组件中存在的守卫。
    return guard(to, from, cb => {
      // 在使用next,传入的参数为函数，则保存在 postEnterCbs 数组中。
      next(cb)
      if (typeof cb === 'function') {
        cbs.push(() => {
          // #750
          // if a router-view is wrapped with an out-in transition,
          // the instance may not have been registered at this time.
          // we will need to poll for registration until current route
          // is no longer valid.
          // 轮询请求是否被注册，直到当前路由被销毁。
          poll(cb, match.instances, key, isValid)
        })
      }
    })
  }
}
```
返回`routeEnterGuard`函数，最后会通过hook 函数执行，从而执行了之前组件中定义的路由`guard()`，但是在进入路由的钩子函数执行的时候可能会拿不动vue实例，所以把cb ，保存在了数组里面，也就是前面定义的postEnterCb数组。然后在回调里面，针对一些特殊情况，不一定拿到组件实例，使用了`poll`轮询方法，设置`setTimeout`，直到拿到组件实例，执行 cb。

执行完beforeRouteEnter钩子函数，下面`const queue = enterGuards.concat(this.router.resolveHooks) `，获取用户定义的全局 `beforeResolve`钩子函数,与前面路由解析流程中，执行`this.router.beforeHooks`类似，在`index.js`中可以找到对应的方法。
``` js
beforeResolve (fn: Function): Function {
  return registerHook(this.resolveHooks, fn)
}

```
