/* @flow */

import { warn } from './warn'
import Regexp from 'path-to-regexp'

// $flow-disable-line
const regexpCompileCache: {
  [key: string]: Function
} = Object.create(null)

export function fillParams (
  path: string, // 经过处理，加上 父路由的 path
  params: ?Object,  // 路由携带参数对象
  routeMsg: string  //
): string {
  try {
    const filler =
      regexpCompileCache[path] ||
      (regexpCompileCache[path] = Regexp.compile(path))
    // Regexp.compile 快速填充url 字符串中的参数值
    /*
    var pathToRegexp = require('path-to-regexp')
    var url = '/user/:id/:name'
    var data = {id: 10001, name: 'bob'}
    console.log(pathToRegexp.compile(url)(data))

    output: /user/10001/bob
     */
    return filler(params || {}, { pretty: true })
  } catch (e) {
    // 没有params 没有匹配到对应的 url
    if (process.env.NODE_ENV !== 'production') {
      warn(false, `missing param for ${routeMsg}: ${e.message}`)
    }
    return ''
  }
}
