### 生成routeMap信息

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


### 定义addRoutes，新增routeMap记录方法
在 create-matcher.js文件中，
``` js
function addRoutes (routes) {
  createRouteMap(routes, pathList, pathMap, nameMap)
}
```
这里暴露出了`createRouteMap`方法，可以动态添加路由信息，动态改变`pathList`,`pathMap`，`nameMap`
