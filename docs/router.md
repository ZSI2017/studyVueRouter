## router

## 主要技术点
- [flow 进行代码静态检查](https://flow.org/)
- vuepress 生成通用文档，类似gitbook
- webpack, webpack-dev-middleward 开发环境
- rollup 生产环境，不同版本打包

## 具体代码

### 入口

`index.js`文件中定义了`VueRouter`类,在对应的构造函数中定义了`this.app`和`this.apps`分别存放根vue实例 和 所有子组件的vue实例。`this.options`就是传入的配置；`this.fallback`表示在不支持history模式的情况下，是否回退到hash模式；`mode`表示路由创建的模式，缺省是'hash'模式；后面会根据不同的传入参数`mode`，new 不同的对象，分别有`HTMLHistory`、`HashHistory`、`Abstract`三种模式

``` js
switch (mode) {
  case 'history':
    this.history = new HTML5History(this, options.base)
    break
  case 'hash':
    this.history = new HashHistory(this, options.base, this.fallback)
    break
  case 'abstract':
    this.history = new AbstractHistory(this, options.base)
    break
  default:
    if (process.env.NODE_ENV !== 'production') {
      assert(false, `invalid mode: ${mode}`)
    }
}
}
```
常用`hash`模式，所以我们主要顺着HashHistory这条线往下看。

``` js
init (app: any /* Vue component instance */) {
  process.env.NODE_ENV !== 'production' && assert(
    install.installed,
    `not installed. Make sure to call \`Vue.use(VueRouter)\` ` +
    `before creating root instance.`
  )

  this.apps.push(app)

  // main app already initialized.
  if (this.app) {
    return
  }

  this.app = app

  const history = this.history

  if (history instanceof HTML5History) {
    history.transitionTo(history.getCurrentLocation())
  } else if (history instanceof HashHistory) {
    const setupHashListener = () => {
      history.setupListeners()
    }
    // 每次页面跳转成功 或者 失败，都会在跳转之后的页面中
    // 通过window.addEventListener(popstate or hashChange) 监听页面变化。
    //  在 history/base.js　文件中的 transitionTo ——》 confirmTransition 页面跳转，以及路由守卫，异步组件加载，全局错误钩子回调 ，
    history.transitionTo(
      history.getCurrentLocation(),
      setupHashListener,
      setupHashListener
    )
  }

  history.listen(route => {
    this.apps.forEach((app) => {
      // 页面跳转后，不论成功或者失败。
      // 改变 apps 里面，每个Vue 实例的中的_route 属性。
      app._route = route
    })
  })
}
```

接着比较重要的函数就是`init()`。该函数会在执行`vue.install`的时候，抛出到Vue实例内部执行。执行时机，在install.js中， Vue.mixin的 beforeCreate 钩子函数触发时执行，传入根组件实例。然后，到了`history.transitionTo()`，它的定义在history/base.js 的基础类中。这里主动触发了，后面在监听到页面路由发生变化时，都会触发，也就是通过`history.setupListeners`函数 在每次路由跳转后，都绑定 `popstate`/`hashchange`事件。所以可以从 `transitionTo`函数作为入口，串联起整个路由变化。 最后的 `history.listen`方法，也会在transitionTo事件触发后，对应的 `updateRoute`方法中使用到。

继续在`index.js`文件中，下面定义了一些全局的导航守卫
``` js
// 增加了全局的导航守卫。
beforeEach (fn: Function): Function {
  return registerHook(this.beforeHooks, fn)
}

beforeResolve (fn: Function): Function {
  return registerHook(this.resolveHooks, fn)
}

afterEach (fn: Function): Function {
  return registerHook(this.afterHooks, fn)
}

// 在路由完成初始化导航时，调用 维护的一套回调队列
onReady (cb: Function, errorCb?: Function) {
  this.history.onReady(cb, errorCb)
}

```

通过 `registerHook`注册到对应的数组中，
``` js
function registerHook (list: Array<any>, fn: Function): Function {
  list.push(fn)

  return () => {
    const i = list.indexOf(fn)
    if (i > -1) list.splice(i, 1)
  }
}
```
最后`return` 一个匿名函数，用来删除对应的钩子函数。

> 所以在index.js 入口文件中，主要实例化了路由模式对应的类，定义了一些属性变量，同时抛出了全局的钩子函。主要定义了init初始化函数，获取到vue根实例，同时在定义了路由跳转后执行的tranitionTo函数，并且在每次跳转后，都绑定事件监听页面变化。

后面，我们看的重点，就在 transitionTo 函数如何根据url变化，执行钩子函数，刷新页面，渲染不同url对应的组件。


### 路由跳转

在 history/base.js 文件中，定义了history 基类，在构造函数里面就定义了`  transitionTo (location: RawLocation, onComplete?: Function, onAbort?: Function) `

在函数里面，主要执行了两个函数`this.router.match` 和 `this.confirmTransition`,可以简单理解为前一个函数获取信息，把传入的`routes`数组，进行各种修改，最后放在 `Object.freeze`里面，返回一个不可修改的数组，`confirmTransition`则负责按顺序执行所有的功能。

#### match 路由匹配
   `match` 函数定义，又回到 `index.js`， 在VueRoute对象的构造函数中，定义了match自有属性，

``` js
match (
  raw: RawLocation,
  current?: Route,
  redirectedFrom?: Location
): Route {
  return this.matcher.match(raw, current, redirectedFrom)
}
```

里面返回了this.matcher.match()函数执行后的结果。 最上面

``` js
  // routes 数组，里面保存着 所有 router 中的配置 ，包括 path, name， component；
  this.matcher = createMatcher(options.routes || [], this) `
```
函数入参，就是`options.routes`，用户传入的路由配置数组，这里可以看出，传入routes 数组，里面应该是在routes的基础上修改，记录所有的路由栈。
转到 `create-matcher.js`文件，
`createMatcher`构造函数里面，进去就通过`createRouteMap`转换了routes 数组，返回 `pathList`,`pathMap`,`nameMap`三个变量，
具体定义可以转到`create-route-map.js`文件
``` js
routes: Array<RouteConfig>,  // routes 数组中，保存着path ,component,name;
oldPathList?: Array<string>,
oldPathMap?: Dictionary<RouteRecord>,
oldNameMap?: Dictionary<RouteRecord>
```
这是入参，里面只有routes 用户定义的数组是必需的，

``` js
export function createRouteMap (
  routes: Array<RouteConfig>,  // routes 数组中，保存着path ,component,name;
  oldPathList?: Array<string>,
  oldPathMap?: Dictionary<RouteRecord>,
  oldNameMap?: Dictionary<RouteRecord>
): {
  pathList: Array<string>;
  pathMap: Dictionary<RouteRecord>;
  nameMap: Dictionary<RouteRecord>;
} {
  // the path list is used to control path matching priority
  const pathList: Array<string> = oldPathList || []
  // $flow-disable-line
  const pathMap: Dictionary<RouteRecord> = oldPathMap || Object.create(null)
  // $flow-disable-line
  const nameMap: Dictionary<RouteRecord> = oldNameMap || Object.create(null)

  routes.forEach(route => {
    addRouteRecord(pathList, pathMap, nameMap, route)
  })

  // ensure wildcard routes are always at the end
  // 保证 通配符 '*' path 总是出现在 pathList 最末尾。
  for (let i = 0, l = pathList.length; i < l; i++) {
    if (pathList[i] === '*') {
      pathList.push(pathList.splice(i, 1)[0])
      l--
      i--
    }
  }

  return {
    pathList,
    pathMap,
    nameMap
  }
}
```

`PathList`数组类型，保存着所有的Path, `pathMap`对象，保存 path指向record对象的键值对，而record 对象，在addRouteRecord 方法中定义了，
``` js
const record: RouteRecord = {
  path: normalizedPath,
  regex: compileRouteRegex(normalizedPath, pathToRegexpOptions),
  components: route.components || { default: route.component }, // 命名视图路由组件，多个视图的多个组件。
  instances: {},
  name,
  parent,
  matchAs,
  redirect: route.redirect,    //  路由重定向。
  beforeEnter: route.beforeEnter,  // 路由守护
  meta: route.meta || {},          // 路由元信息。
  props: route.props == null       //
    ? {}
    : route.components
      ? route.props
      : { default: route.props }
}
```


定义了match 方法。

``` js
function match (
  raw: RawLocation,
  currentRoute?: Route,
  redirectedFrom?: Location
): Route {
  // raw => getHash() 获取到location.href 中的 # 后面的值。
  // currentRoute: Route; 对应当前 Route 实例。
  // false。
  // router vueRouter 实例
  const location = normalizeLocation(raw, currentRoute, false, router)
  /*
   *通过 normalizeLocation
   * {
       _normalized: true,
       path,
       query,
       hash
      }
      返回处理过的 path, query，hash .
   */
  const { name } = location

  if (name) {
    const record = nameMap[name]
    if (process.env.NODE_ENV !== 'production') {
      warn(record, `Route with name '${name}' does not exist`)
    }
    if (!record) return _createRoute(null, location)
    const paramNames = record.regex.keys
      .filter(key => !key.optional)
      .map(key => key.name)

    if (typeof location.params !== 'object') {
      location.params = {}
    }

    if (currentRoute && typeof currentRoute.params === 'object') {
      for (const key in currentRoute.params) {
        if (!(key in location.params) && paramNames.indexOf(key) > -1) {
          location.params[key] = currentRoute.params[key]
        }
      }
    }

    if (record) {
      location.path = fillParams(record.path, location.params, `named route "${name}"`)
      return _createRoute(record, location, redirectedFrom)
    }
  } else if (location.path) {
    // 如果 未使用命名路由，
    //
    location.params = {}
    for (let i = 0; i < pathList.length; i++) {
      const path = pathList[i]
      const record = pathMap[path]
      // path.match 测试是否匹配到了url，
      // 匹配成功 -》
      if (matchRoute(record.regex, location.path, location.params)) {
        // 如果匹配成功，直接返回
        return _createRoute(record, location, redirectedFrom)
      }
    }
  }
  // no match
  return _createRoute(null, location)
}

```




























## 参考链接
- [vue.js 技术揭秘](https://ustbhuangyi.github.io/vue-analysis/)
- [Vue技术内幕](http://hcysun.me/vue-design/art/)
