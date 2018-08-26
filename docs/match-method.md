### match 匹配方法
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
