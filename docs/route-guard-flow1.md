### 路由导航钩子解析

回到history/base.js，执行完`match`后，调用 `confirmTransition()`，再看看下面该函数的定义，传入了`route`对象，跳转过程中，对应的钩子函数都是按顺序执行的，所以在存在`onComplete`路由跳转完成后的回调，以及 `onAbort`路由跳转中断的错误函数。
在`confirmTransition`函数中。
开始会获得`this.current`中保存的当前匹配到的路由信息， `constructor`构造函数中，初始化了`this.current = START`，转到`util/route.js`中
``` js
// the starting route that represents the initial state
export const START = createRoute(null, {
path: '/'
})  
```
同样使用`match`方法中用到的`createRoute`方法，创建一个初始化的Route对象,后面在执行`onComplete`回调的时候，也会更新`this.current`指向的Route 对象，具体可以在`history/base.js`文件`updateRoute`函数中可以找到。
回到`confirmTransition`函数中. 通过isSAameRoute 和 route对象中保存的扁平数组matched的长度,判断如果路径没变执行`abort()`中断跳转。
``` js
if (
isSameRoute(route, current) &&
// in the case the route map has been dynamically appended to
// 每个 matched 数组，对应的 record 对象。
route.matched.length === current.matched.length
) {
// 确保 刷新了url后，执行中断函数
this.ensureURL()
return abort()
}
```
继续往下看，利用`resolveQueue`处理三种不同的队列
``` js
function resolveQueue (
current: Array<RouteRecord>,
next: Array<RouteRecord>
): {
updated: Array<RouteRecord>,
activated: Array<RouteRecord>,
deactivated: Array<RouteRecord>
} {
let i
const max = Math.max(current.length, next.length)
// 数组头部 为父节点， 尾部 为子节点
for (i = 0; i < max; i++) {
if (current[i] !== next[i]) {
  break
}
}
return {
updated: next.slice(0, i),    // 保存复用的组件
activated: next.slice(i),     // 即将进入的路由部分不同部分
deactivated: current.slice(i) // 即将离开的路由部分相同部分
}
}
```
`resolve`方法遍历current 和next中的 RouteRecord最长的数组，直接比较对象，利用slice 切割出上面注释描述的三种情况。下面看到最关键的导航钩子函数，
``` js
// 全部都放在数组中，保证执行的先后顺序
const queue: Array<?NavigationGuard> = [].concat(
// in-component leave guards
extractLeaveGuards(deactivated),   //在失活的组件中，调用组件内部的  beforeRouteLeave 守卫
// global before hooks
this.router.beforeHooks,          // 调用绑定在router 上的 beforeHooks 全局的回调函数。
// in-component update hooks
extractUpdateHooks(updated),      // 在重用的组件里调用 beforeRouteUpdate 路由守卫
// in-config enter guards
activated.map(m => m.beforeEnter),  // 路由配置中 调用 beforeEnter 钩子函数
// async components
resolveAsyncComponents(activated)   // 解析异步的路由组件
)
```
放在数组里面，保证执行的先后顺序，根据官方给出的完整的导航钩子解析流程
完整的导航解析流程
1.导航被触发。
2.在失活的组件里调用离开守卫。
3.调用全局的 beforeEach 守卫。
4.在重用的组件里调用 beforeRouteUpdate 守卫 (2.2+)。
5.在路由配置里调用 beforeEnter。
6.解析异步路由组件。

然后，具体分析下每一步是如何执行的，
- `extractLeaveGuards`在失活的组件中调用。
函数内部调用了`extractGuards`,后面的钩子函数也复用了这个方法。
``` js
// 触发 路由中离开的 路由守护/ 路由钩子函数
function extractLeaveGuards (deactivated: Array<RouteRecord>): Array<?Function> {
 return extractGuards(deactivated, 'beforeRouteLeave', bindGuard, true)
}
```
里面的参数`bindGuard`，在下面可以找到
``` js
function bindGuard (guard: NavigationGuard, instance: ?_Vue): ?NavigationGuard {
 if (instance) {
   // 通过返回一个命名函数， apply 模拟 bind 方法。
   return function boundRouteGuard () {
     return guard.apply(instance, arguments)
   }
 }
}
```
改变组件中guard钩子函数的执行上下文，方便在函数内部拿到vue对象,同时返回一个命名函数，主要为了在前面的hook函数触发时才进行调用。

再看下`extractGuards`
``` js
function extractGuards (
records: Array<RouteRecord>,
name: string,
bind: Function,
reverse?: boolean
): Array<?Function> {
const guards = flatMapComponents(records, (def, instance, match, key) => {
  const guard = extractGuard(def, name) // 组件中存在对应的 守卫，
  if (guard) {
    return Array.isArray(guard)  // boundRouteGuard， 改变了guard 守卫函数的执行上下文
      ? guard.map(guard => bind(guard, instance, match, key))
      : bind(guard, instance, match, key)
  }
})
return flatten(reverse ? guards.reverse() : guards)
}
```
主要使用了`flatMapComponents()`获取所有records中每一项对应组件中的所有导航守卫，得到的结果是一维数组。
转到`util/resolve-components.js`文件。
``` js
export function flatMapComponents (
matched: Array<RouteRecord>,
fn: Function
): Array<?Function> {
return flatten(matched.map(m => {
  return Object.keys(m.components).map(key => fn(
    m.components[key],
    m.instances[key],
    m, key
  ))
}))
}

// 使其扁平化,二维数组，转化为一维数组。
export function flatten (arr: Array<any>): Array<any> {
return Array.prototype.concat.apply([], arr)
}
```
遍历传入的RouteRecord 数组，获取每一个record对应的components中的key,默认key为'default',执行`fn`,`fn`对应`extractGuards`函数中的传入`flatMapComponents()`的匿名函数，函数内部，通过`extractGuard`,提取每个组件中name 对应的钩子函数，比如前面name就是‘beforeRouteLeave’，到这里，就获取到了所有的即将离开的钩子函数。

- 调用全局的 beforeEach 守卫
`this.router.beforeHooks`，回到`index.js`
``` js
beforeEach (fn: Function): Function {
return registerHook(this.beforeHooks, fn)
}
```
利用暴露出的beforeEach，就可以往beforeHooks中注册全局守卫

- beforeRouteUpdate
``` js
function extractUpdateHooks (updated: Array<RouteRecord>): Array<?Function> {
  return extractGuards(updated, 'beforeRouteUpdate', bindGuard)
}
```
与 离开的路由钩子类似，只是传入的name改为`beforeRouteUpdate`;
- 路由配置中的beforeEnter 钩子。
每个即将进入的组件内部，用户自定义的路由钩子。

- 解析异步的路由组件
转到 `util/resolve-components.js`文件，`resolveAsyncComponents`函数返回一个匿名函数，传入参数也是`to`，`from`，`next`，也使用了`flatMapComponents`，遍历matched 数组中每个Route对象上的组件中的key值，在匿名函数内部，flatMapComponents函数中，遍历matched，对数组中每个RouteRecord，遍历里面的components数组，对每个组件执行匿名函数，解析异步组件，定义了`resolve`和`reject`成功或失败的回调，被包裹在`once`中，`once`函数返回一个闭包，保证函数只能被执行一次。解析异步组件，在`resolve`里面，通过`match.components[key] = resolvedDef`,拿到导出的异步组件，
``` js
export function resolveAsyncComponents (matched: Array<RouteRecord>): Function {
return (to, from, next) => {
  let hasAsync = false
  let pending = 0
  let error = null
                            //component， instance, match, key ()
  flatMapComponents(matched, (def, _, match, key) => {
    // if it's a function and doesn't have cid attached,
    // assume it's an async component resolve function.
    // we are not using Vue's default async resolving mechanism because
    // we want to halt the navigation until the incoming component has been
    // resolved.
    if (typeof def === 'function' && def.cid === undefined) {
      hasAsync = true
      pending++

      const resolve = once(resolvedDef => {
        if (isESModule(resolvedDef)) {
          // 如果是es6的module模块，则可以获取到模块中导出的default值
          resolvedDef = resolvedDef.default
        }
        // save resolved on async factory in case it's used elsewhere
        def.resolved = typeof resolvedDef === 'function'
          ? resolvedDef    //
          : _Vue.extend(resolvedDef)
        match.components[key] = resolvedDef  // 拿取到引入的组件模块，保存到components 属性中，默认是 default ，
        pending--
        if (pending <= 0) {
          next()
        }
      })

      const reject = once(reason => {
        const msg = `Failed to resolve async component ${key}: ${reason}`
        process.env.NODE_ENV !== 'production' && warn(false, msg)
        if (!error) {
          error = isError(reason)
            ? reason
            : new Error(msg)
          next(error)
        }
      })

      let res
      try {
        res = def(resolve, reject)
      } catch (e) {
        reject(e)
      }
      if (res) {
        // 与vue组件调用的返回值耦合。如果返回值同样是 promise， 则继续执行。
        if (typeof res.then === 'function') {
          res.then(resolve, reject)
        } else {
          // new syntax in Vue 2.3
          const comp = res.component
          if (comp && typeof comp.then === 'function') {
            comp.then(resolve, reject)
          }
        }
      }
    }
  })

  if (!hasAsync) next()
}
}
```
得到上面queue 数组中按顺序存放的钩子函数后，下面就通过`runQueue`执行所有的函数，跟上面queue队列中的存放顺序刚好一致，如何保证执行的先后顺序，就可以看`runQueue` 函数,后面执行的时候也会将queue队列传递出去了，

``` js
export function runQueue (queue: Array<?NavigationGuard>, fn: Function, cb: Function) {
const step = index => {
if (index >= queue.length) {
  cb()
} else {
  if (queue[index]) {
    // 执行完当前钩子后，执行数组中的下一个
    fn(queue[index], () => {
      step(index + 1)
    })
  } else {
    step(index + 1)
  }
}
}
step(0)
}
```
`runQueue`实现了类似迭代器的功能，index 控制遍历queue数组的下标，每次执行完`fn`后，就`+1`,递归`step`执行，最后遍历完数组，执行`cb`回调函数。
`fn`函数就是传入的 `iterator`函数，回到函数里面。
``` js
const iterator = (hook: NavigationGuard, next) => {
if (this.pending !== route) {
return abort()
}
try {
hook(route, current, (to: any) => {
  if (to === false || isError(to)) {
    // next(false) -> abort navigation, ensure current URL
    // 改变url,不刷新页面。
    this.ensureURL(true)
    // 触发所有的错误回调函数。
    abort(to)
  } else if (
    typeof to === 'string' ||
    (typeof to === 'object' && (
      typeof to.path === 'string' ||
      typeof to.name === 'string'
    ))
  ) {
    // next('/') or next({ path: '/' }) -> redirect
    abort() // 中断当前跳转
    // 页面重定向到 next 参数中对应的path;
    if (typeof to === 'object' && to.replace) {
      this.replace(to)
    } else {
      this.push(to)
    }
  } else {
    // confirm transition and pass on the value
    // 执行队列中，下一个路由守护。
    next(to)
  }
})
} catch (e) {
abort(e)  // 触发所有的错误回调函数。
}
}
```
里面的hook,对应queue数组中不同的钩子函数，next指向数组中的下一项，首先对比一下官网对于路由守卫的用法
``` js
你可以使用 router.beforeEach 注册一个全局前置守卫：

const router = new VueRouter({ ... })

router.beforeEach((to, from, next) => {
// ...
})
```
里面的`to`,`from`,`next`对应hook里面的`route`，`current`,`(to) => {}`，其中`route`和`current`是路由对象，最后的匿名函数，判断`to`参数：
- `false`中断当前导航，
- string or object 导航到新的路由
- 空，执行数组中的下一个钩子
