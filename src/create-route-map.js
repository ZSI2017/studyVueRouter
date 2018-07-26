/* @flow */

import Regexp from 'path-to-regexp'
import { cleanPath } from './util/path'
import { assert, warn } from './util/warn'

// 解析传入的 routes 数组。分别放在
// pathList , pathMap, nameMap 数组中。
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

function addRouteRecord (
  pathList: Array<string>,
  pathMap: Dictionary<RouteRecord>,
  nameMap: Dictionary<RouteRecord>,
  route: RouteConfig,
  parent?: RouteRecord,
  matchAs?: string
) {
  const { path, name } = route
  if (process.env.NODE_ENV !== 'production') {
    // path is required； 必须的
    assert(path != null, `"path" is required in a route configuration.`)
    // component 应该是具体的vue 组件实例，不能为 string 类型
    assert(
      typeof route.component !== 'string',
      `route config "component" for path: ${String(path || name)} cannot be a ` +
      `string id. Use an actual component instead.`
    )
  }

  const pathToRegexpOptions: PathToRegexpOptions = route.pathToRegexpOptions || {}
  /*
   *  提供path-to-regexp 的 options 对象。
   *  path:
   *  keys:
   *  options:
   *      sensitive: false;
   *      strict: false;
   *      end: true
   *
   */
  const normalizedPath = normalizePath(
    path,
    parent,
    pathToRegexpOptions.strict
  )

  if (typeof route.caseSensitive === 'boolean') {
    // 大小写敏感
    pathToRegexpOptions.sensitive = route.caseSensitive
  }

  const record: RouteRecord = {
    path: normalizedPath,
    regex: compileRouteRegex(normalizedPath, pathToRegexpOptions),
    components: route.components || { default: route.component }, // 命名路由组件
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

  if (route.children) {
    // Warn if route is named, does not redirect and has a default child route.
    // If users navigate to this route by name, the default child will
    // not be rendered (GH Issue #629)
    //使用父类的命名路由，不会渲染默认子路由，必须使用path 路由。
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
    } else if (process.env.NODE_ENV !== 'production' && !matchAs) {
      // 定义了相同的 name
      warn(
        false,
        `Duplicate named routes definition: ` +
        `{ name: "${name}", path: "${record.path}" }`
      )
    }





}

function compileRouteRegex (path: string, pathToRegexpOptions: PathToRegexpOptions): RouteRegExp {
  // 利用 path-to-regex 转换为regex正则
  const regex = Regexp(path, [], pathToRegexpOptions)
  //  var re = pathToRegexp('/:foo/:bar')
  // keys = [{ name: 'foo', prefix: '/', ... }, { name: 'bar', prefix: '/', ... }]
  if (process.env.NODE_ENV !== 'production') {
    const keys: any = Object.create(null)
    regex.keys.forEach(key => {
      // 对于重复的 path name 发出警告。
      warn(!keys[key.name], `Duplicate param keys in route with path: "${path}"`)
      keys[key.name] = true
    })
  }
  return regex
}

function normalizePath (path: string, parent?: RouteRecord, strict?: boolean): string {
  if (!strict) path = path.replace(/\/$/, '')
  if (path[0] === '/') return path
  if (parent == null) return path
  // 父子组件嵌套时，拼接path路径。
  return cleanPath(`${parent.path}/${path}`)
}
