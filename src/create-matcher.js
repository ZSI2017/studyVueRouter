/* @flow */

import type VueRouter from './index'
import { resolvePath } from './util/path'
import { assert, warn } from './util/warn'
import { createRoute } from './util/route'
import { fillParams } from './util/params'
import { createRouteMap } from './create-route-map'
import { normalizeLocation } from './util/location'

export type Matcher = {
  match: (raw: RawLocation, current?: Route, redirectedFrom?: Location) => Route;
  addRoutes: (routes: Array<RouteConfig>) => void;
};

export function createMatcher (
  routes: Array<RouteConfig>,
  router: VueRouter
): Matcher {
  const { pathList, pathMap, nameMap } = createRouteMap(routes)

  function addRoutes (routes) {
    createRouteMap(routes, pathList, pathMap, nameMap)
  }

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

  // 在路由匹配后， 处理重定向，
  function redirect (
    record: RouteRecord,
    location: Location
  ): Route {
    const originalRedirect = record.redirect
    /**
     *  redirect: to =>  { 目标路由作为参数，  return 字符串路径/ 路径对象  }
     */
    let redirect = typeof originalRedirect === 'function'
      ? originalRedirect(createRoute(record, location, null, router))
      : originalRedirect

    if (typeof redirect === 'string') {
      redirect = { path: redirect }
    }

    if (!redirect || typeof redirect !== 'object') {
    // 检查 redirect 的 合法性，
      if (process.env.NODE_ENV !== 'production') {
        warn(
          false, `invalid redirect option: ${JSON.stringify(redirect)}`
        )
      }
      return _createRoute(null, location)
    }

    const re: Object = redirect
    const { name, path } = re    // 重定向的目标，可以是 具体 path ，也可以是命名的路由，
    let { query, hash, params } = location

    query = re.hasOwnProperty('query') ? re.query : query
    hash = re.hasOwnProperty('hash') ? re.hash : hash
    params = re.hasOwnProperty('params') ? re.params : params

    if (name) {
      // resolved named direct
      const targetRecord = nameMap[name]   // 从保存的nameMap[name] 中，获取指定的命名路由。
      if (process.env.NODE_ENV !== 'production') {
        assert(targetRecord, `redirect failed: named route "${name}" not found.`)
      }
      // 走统一的路由匹配的match 方法。
      return match({
        _normalized: true,
        name,
        query,
        hash,
        params
      }, undefined, location)
    } else if (path) {
      // 1. resolve relative redirect 处理相对路由
      const rawPath = resolveRecordPath(path, record)
      // 2. resolve params  返回填充了 params 的 url
      const resolvedPath = fillParams(rawPath, params, `redirect route with path "${rawPath}"`)
      // 3. rematch with existing query and hash
      // 重新匹配 现有的 hash，
      return match({
        _normalized: true,
        path: resolvedPath,
        query,
        hash
      }, undefined, location)
    } else {
      // 不合法的 redirect 选项
      if (process.env.NODE_ENV !== 'production') {
        warn(false, `invalid redirect option: ${JSON.stringify(redirect)}`)
      }
      // 同样返回一个 路由对象
      return _createRoute(null, location)
    }
  }

// 路由匹配后，通过别名 映射到其它的路由规则上。
// 传入参数 alias(record, location, record.matchAs)
  function alias (
    record: RouteRecord,
    location: Location,
    matchAs: string
  ): Route {
    const aliasedPath = fillParams(matchAs, location.params, `aliased route with path "${matchAs}"`)
    // 获取到 alias 匹配到的对象
    const aliasedMatch = match({
      _normalized: true,
      path: aliasedPath
    })
    if (aliasedMatch) {
      const matched = aliasedMatch.matched
      const aliasedRecord = matched[matched.length - 1]
      location.params = aliasedMatch.params
      // url没有变化，但是别名匹配到url,也要同步更新 name, meta 信息
      return _createRoute(aliasedRecord, location)
    }
    return _createRoute(null, location)
  }

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

  return {
    match,
    addRoutes
  }
}

function matchRoute (
  regex: RouteRegExp,
  path: string,
  params: Object
): boolean {
  // 通过正则 匹配path,
  const m = path.match(regex)

  if (!m) {
    return false
  } else if (!params) {
    return true
  }

  for (let i = 1, len = m.length; i < len; ++i) {
    const key = regex.keys[i - 1]
    const val = typeof m[i] === 'string' ? decodeURIComponent(m[i]) : m[i]
    if (key) {
      // Fix #1994: using * with props: true generates a param named 0
      /* children: [
       *   {path: '*', component: NotFound}
       *    ]
       */
      // 保存 通过正则 匹配到url中对应的 参数
      params[key.name || 'pathMatch'] = val
    }
  }

  return true
}

// 拼接加上父路由，
function resolveRecordPath (path: string, record: RouteRecord): string {
  return resolvePath(path, record.parent ? record.parent.path : '/', true)
}
