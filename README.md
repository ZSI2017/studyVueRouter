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

##### 生成routeMap信息

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
对routes配置中的每一项执行`addRouteRecord`方法，传入的`pathList`,`pathMap`,`nameMap`等值都是引用类型，所以在执行函数的时候，可以动态添加进去。
`PathList`数组类型，保存着所有的Path, `pathMap`对象，保存 path指向record对象的键值对，而`record` 对象，`nameMap`对象，则保存着`name` 指向`record` 对象的键值对，在addRouteRecord 方法中定义了`record`，
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
里面的`path`,经过`normalizePath`处理，拼接上了parent的path;
`regex`则是通过`compileRouteRegex`处理，引入`path-to-regex`库，将path 转换为 正则，
比如
``` js
  //  var re = pathToRegexp('/:foo/:bar')
  // keys = [{ name: 'foo', prefix: '/', ... }, { name: 'bar', prefix: '/', ... }]
```
`components`属性，如果components不是对象的形式，转换成`{ default: route.component }`,
`instances`组件实例，初始化为对象
`parent`在存在父子路由的时候，指向父路由的`record`

``` js
if (route.children) {
  // Warn if route is named, does not redirect and has a default child route.
  // If users navigate to this route by name, the default child will
  // not be rendered (GH Issue #629)
  // 使用父类的命名路由，不会渲染默认子路由，必须使用path 路由。
  if (process.env.NODE_ENV !== 'production') {
    if (route.name && !route.redirect && route.children.some(child => /^\/?$/.test(child.path))) {
      warn(
        false,
        `Named Route '${route.name}' has a default child route. ` +
        `When navigating to this named route (:to="{name: '${route.name}'"), ` +
        `the default child route will not be rendered. Remove the name from ` +
        `this route and use the name of the default child route for named ` +
        `links instead.`
      )
    }
  }
  route.children.forEach(child => {
    const childMatchAs = matchAs
      ? cleanPath(`${matchAs}/${child.path}`)
      : undefined
    // 当前记录当前子路由。
    addRouteRecord(pathList, pathMap, nameMap, child, record, childMatchAs)
  })
}
```
所以，如果route中配置了`children`,遍历children,使用`matchAs`为每个child拼接出完整的 path，再次调用`addRouteRecord`

``` js
if (route.alias !== undefined) {
  const aliases = Array.isArray(route.alias)
    ? route.alias
    : [route.alias]

  aliases.forEach(alias => {
    const aliasRoute = {
      path: alias,
      children: route.children
    } // alias 对应的别名，同样设置进去。
    addRouteRecord(
      pathList,
      pathMap,
      nameMap,
      aliasRoute,
      parent,
      record.path || '/' // matchAs
    )
  })
}
```
上面出现了`route.alias`别名，对于官方给出的示例:
 ``` js
 routes: [
   { path: '/home', component: Home,
     children: [
       // absolute alias
       { path: 'foo', component: Foo, alias: '/foo' },
       // relative alias (alias to /home/bar-alias)
       { path: 'bar', component: Bar, alias: 'bar-alias' },
       // multiple aliases
       { path: 'baz', component: Baz, alias: ['/baz', 'baz-alias'] }
     ]
   }
 ]
 ```
当用户访问`"/baz"`或者`/home/baz-alias"`时，都会渲染到`/home/baz`对应的组件上去。所以出现`alias`选项，就得遍历数组，为每一个alias 调用`addRouteRecord`,添加path 到 record的映射。

``` js
if (!pathMap[record.path]) {
  // 记录path 对应的 record;
  pathList.push(record.path)
  pathMap[record.path] = record
}

if (name) {
  // 设置了命名路由。
  if (!nameMap[name]) {
    // 保存在nameMap中,方便通过 name 搜索到对应的记录。
    nameMap[name] = record
```
在`pathList`，`pathMap`，`nameMap`中添加新的记录。

##### 定义addRoutes，新增routeMap记录方法
在 create-matcher.js文件中，
``` js
function addRoutes (routes) {
  createRouteMap(routes, pathList, pathMap, nameMap)
}
```
这里暴露出了`createRouteMap`方法，可以动态添加路由信息，动态改变`pathList`,`pathMap`，`nameMap`

##### match 匹配方法
这里的match 方法，就可以回到开始入口 history/base.js 文件中的 `transitionTo`方法里面调用的`this.route.match`,返回Route对象。
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
```
函数里面，最开始执行了`normalizeLocation()` , 具体在util/location.js中。
传入raw是 RawLocation 类型 `declare type RawLocation = string | Location` 可以是string 或者 location 类型，这里字符串使用比较多，
``` js
export function normalizeLocation (
  raw: RawLocation,
  current: ?Route,
  append: ?boolean,
  router: ?VueRouter
): Location {
  // 保存当前 path 值。封装到对象里面。
  let next: Location = typeof raw === 'string' ? { path: raw } : raw
  // named target
  if (next.name || next._normalized) {
    return next
  }

  // relative params
  if (!next.path && next.params && current) {
    next = extend({}, next)
    next._normalized = true
    const params: any = extend(extend({}, current.params), next.params)
    if (current.name) {
      next.name = current.name
      next.params = params
    } else if (current.matched.length) {
      const rawPath = current.matched[current.matched.length - 1].path
      next.path = fillParams(rawPath, params, `path ${current.path}`)
    } else if (process.env.NODE_ENV !== 'production') {
      warn(false, `relative params navigation requires a current route.`)
    }
    return next
  }

  const parsedPath = parsePath(next.path || '')
  const basePath = (current && current.path) || '/'
  // 如果 parsePath.path 为相对路径，
  // 则通过拼接basePath。设置为绝对路径。
  const path = parsedPath.path
    ? resolvePath(parsedPath.path, basePath, append || next.append)
    : basePath

  // 操作query 参数。
  const query = resolveQuery(
    parsedPath.query,
    next.query,
    router && router.options.parseQuery
  )

  let hash = next.hash || parsedPath.hash
  if (hash && hash.charAt(0) !== '#') {
    hash = `#${hash}`
  }

  return {
    _normalized: true,
    path,
    query,
    hash
  }
}
```
直接走到了 `const parsedPath = parsePath(next.path || '')` 处理path 这一步，
然后看`parsePath()`方法，在util/path.js 文件中，
``` js
/*  解析传入的path;
    利用 slice 切分出 不同的部分
    query -> ？ 后面的值 window.location.queryIndex,
    hash -> #  后面的值 window.location.hash;
    path -> url 中不包含任何参数的 window.location.origin
 */
export function parsePath (path: string): {
  path: string;
  query: string;
  hash: string;
}
```
可以看成，解析raw,得到对应的参数。
接着拼接 parsePath.path，得到path。
如果raws是location对象， 可以利用`resolveQuery()`合并raw.query 和 parsePath.query 参数，最后返回新的location 对象。

再回到`match`函数,得到新的location对象后，开始利用 `name` 或者 `path` 匹配路由。这里先看`path`进行匹配的情况，
``` js
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
```
遍历最开始得到的`pathlist`,利用`matchRoute`匹配，并提取出url中携带的参数，存在` location.params`对象中

``` js
  const m = path.match(regex)
```
在`matchRoute`函数中，主要利用传入的 `record.regex`正则匹配path，匹配成功后，调用`_createRoute()`
``` js
// record, location, redirectedFrom
//  判断 redirect 和 alias 后，返回 新创建的Route 对象
  function _createRoute (
    record: ?RouteRecord,
    location: Location,
    redirectedFrom?: Location
  ): Route {
    if (record && record.redirect) {
      // 重定向
      //   重定向的目标，可以是命名的路由， 或者一个方法，动态返回重定向的目标
      return redirect(record, redirectedFrom || location)
    }
      if (record && record.matchAs) {
      // 别名，
      //     访问 ‘/b’ url保存 '/b'， 但是路由匹配则为'/a',就像用户访问 ‘/a’一样。
      return alias(record, location, record.matchAs)
    }
    return createRoute(record, location, redirectedFrom, router)
  }
```
`createRoute`方法，在`util/route.js`文件中，创建经过`Object.freeze`处理后，防止被篡改的Route 对象，
``` js
const route: Route = {
  name: location.name || (record && record.name),
  meta: (record && record.meta) || {},
  path: location.path || '/',
  hash: location.hash || '',
  query,
  params: location.params || {},
  fullPath: getFullPath(location, stringifyQuery),
  matched: record ? formatMatch(record) : []
}
```
跟location对象类似，都有记录路由信息的 name,path,hash,query,params等参数，fullPath则把path,query,hash 拼接起来的完整url, matched 解析record的父子树状结构，循环转化为扁平的数组结构。
回头看看，`createMatcher`方法，最后返回`match` 和 `addRoutes`两个方法，`match()`执行后，就是上面分析出来的创建Route实例，`addRoutes`对外暴露出接口，动态修改`pathList`,`pathMap`, `nameMap`记录。

拿到了路由匹配后的Route实例， 关联着path 到RouteRecord 实例的 pathMap等信息后，就可以开始看具体的路由匹配动作是如何完成的。

### confirmTransition 路由转换。
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
 遍历传入的RouteRecord 数组，获取每一个record对应的components中的key,执行`fn`,`fn`对应`extractGuards`函数中的传入`flatMapComponents()`的匿名函数，函数内部，通过`extractGuard`,提取每个组件中name 对应的钩子函数，比如前面name就是‘beforeRouteLeave’，到这里，就获取到了所有的即将离开的钩子函数。

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
  转到 `util/resolve-components.js`文件，`resolveAsyncComponents`函数返回一个匿名函数，传入参数也是`to`，`from`，`next`，也使用了`flatMapComponents`，遍历matched 数组中每个Route对象上的组件中的key值，在匿名函数内部，flatMapComponents函数中，解析异步组件，定义了`resolve`和`reject`，解析异步组件，在`resolve`里面，通过`match.components[key] = resolvedDef`,拿到导出的异步组件，
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








## 参考链接
- [vue.js 技术揭秘](https://ustbhuangyi.github.io/vue-analysis/)
- [Vue技术内幕](http://hcysun.me/vue-design/art/)
