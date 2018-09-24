/*    内部接口    */

import pathToRegexp from 'path-to-regexp';
import {supportPushState, flatten,getHash,getUrl  } from './util/utils'

window.minRoute = init;

export  const minRoute = init;

function init(options) {
    var render = document.querySelector('#'+options.id),
        routes = options.routes,
        routeMap = resolvePath(),
        beforeEachHooks = [],
        afterEachHooks = [],
        errorCds = [],
        currentRoute = {},
        current = createRoute({
           path: '/'
         }, null),
        queueInit = [
          beforeEachHooks,
          renderRoute,
          afterEachHooks
        ];

  if(!~window.location.href.indexOf('#')){
    window.history.replaceState({}, "index", "#/")
  } else {
    transitionTo(getHash())
  }

  window.addEventListener(supportPushState ? 'popstate' : 'hashchange', function(e) {
      transitionTo(getHash());
  })

  // 路由匹配渲染模块
  function renderRoute(current) {
    console.log(current)
    render.innerHTML = current.template ? current.template : ''
  }

  /**
   * 生成 route 配置对应的的 path 映射表
   * 利用regex 匹配path,并获取到path上的params
   * @return {[type]} [description]
   */
  function transitionTo(location, onAbort, onComplete) {
    var route = match(location),
        queue = flatten(queueInit),
        len = queue.length,
        iterator = function(fn) {
          try {
            fn(route)
          } catch(e) {
            onAbort && onAbort(e);

            errorCds.forEach(function(item) {
              item(e)
            })
          }
        };

    for(var i = 0; i <= len; i++) {
      if (i == len) {
        onComplete && onComplete(route);
        current = route;

        return;
      }
      iterator(queue[i])
    }
  }

/**
 *
 * @param  {[type]} rawLocation [description]
 * @return {[type]}             [description]
 */
function match(rawLocation) {
  var location = normalizeLocation(rawLocation);

  return createRoute(location, null);
}

function normalizeLocation(raw) {
  var location = typeof raw === 'string' ? {path: raw} : raw,
      hash = location.path,       // 当前页面中的hash值，
      pathMap = resolvePath();    // path映射

  for( var path in pathMap) {
    if (pathMap.hasOwnProperty(path)) {
      var record = pathMap[path],
          m = hash.match(record.regex);

      if (m) {
        for (var i = 1, len = m.length; i < len; i++) {

          var key = record.regex.keys[i-1];

          if(key) {
            if(!location.params) {
              location.params = {};
            }

            location.params[key.name] = m[i];
          }
        }

        location = Object.assign(location, record);
        return location;
      }
    }
  }

  return location
}

function createRoute(location, record) {
  var query = location.query || {},
      route = {
        name: location.name || (record && record.name),
        template: location.template || ( record && record.template),
        record: record,
        meta: record && record.meta || {},
        path: location.path || '/',
        hash: location.hash || '',
        query: location.query,
        params: location.params || {}
      }

  return Object.freeze(route)
}

/**
 * 暂时针对没有父子嵌套的路由，
 * @return {[type]} [description]
 */
  function resolvePath() {
    var len = routes.length,
        pathMap = {};

    while(len--) {
      addRoute(routes[len], pathMap)
    }

    return pathMap;
  }

  /**
   * 通过path-to-regex 转化path
   */
  function compileRouteRegex(path) {
    return pathToRegexp(path)
  }

  /**
   * 全局的路由守卫
   */
  function beforeEach(fn) {
    beforeEachHooks.push(fn);
  }

  /**
   * 全局的路由守卫
   */
  function afterEach(fn) {
    afterEachHooks.push(fn);
  }

  /**
   * 钩子函数注册
   * @return {[type]} [description]
   */
  function registerHook() {

  }

  /**
   * 手动添加路由配置信息
   */
  function addRoute(route, pathRoute) {
    pathRoute[route.path] = {
      path: route.path,
      regex: compileRouteRegex(route.path),
      component: route.component,
      template: route.component.template,
      meta: route.meta || {}
    };
  }

  /**
   * 路由前进
   * @return {[type]} [description]
   */
  function go(n) {
    window.history.go(n)
  }

  function push(location) {
    transitionTo(location, null, function() {
      window.history.pushState(null,null,getUrl(location.path))
    })
  }

  /**
   * 路由后退
   * @return {[type]} [description]
   */
  function back() {
    window.history.go(-1)
  }

  /**
   * 路由前进
   * @type {[type]}
   */
  function forward() {
    window.history.go(1)
  }

  /**
   *  路由跳转中错误回调
   */
  function onError(errorCb) {
    errorCds.push(errorCb);
  }

  return {
    go: go,
    back: back,
    forward: forward,
    push: push,
    onError: onError,
    addRoute: addRoute,
    beforeEach: beforeEach,
    afterEach: afterEach,
  };
}
