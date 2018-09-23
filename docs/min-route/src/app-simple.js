/*    内部接口    */

window.minRoute = init;

function init(options) {
    var render = document.querySelector('#'+options.id),
        routes = options.routes,
        routeMap = resolvePath(),
        beforeEachHooks = [],
        afterEachHooks = [],
        errorCds = [],
        currentRoute = {},
        queueInit = [
          beforeEachHooks,
          renderRoute,
          afterEachHooks
        ];

  if(!~window.location.href.indexOf('#')){
    window.history.replaceState({}, "index", "#/")
  } else {
    transitionTo()
  }


  window.addEventListener(supportPushState ? 'popstate' : 'hashchange', function(e) {
      transitionTo(e);
    })

  // 路由匹配渲染模块
  function renderRoute(current) {
    render.innerHTML = current.component ? current.component.template : ''
  }

  /**
   * 生成 route 配置对应的的 path 映射表
   * 利用regex 匹配path,并获取到path上的params
   * @return {[type]} [description]
   */
  function matchRoute(hash) {
    var currentHash = hash,        // 当前页面中的hash值，
        pathMap = resolvePath(),    // path映射
        location = {
          hash: hash,
          params: {},
        }

    for( var path in pathMap) {
      if (pathMap.hasOwnProperty(path)) {
        var record = pathMap[path],
            m = hash.match(record.regex);
        if (m) {
          for (var i = 1, len = m.length; i < len; i++) {

            var key = record.regex.keys[i-1]

            if(key) {
              location.params[key.name] = m[i];
            }

          }
          location.record = record;
          return location;
        }
      }
    }

    return location
  }

  function transitionTo(e, onAbort, onComplete) {
    var location = matchRoute(getHash()),
        current = {
          hash: location.hash,
          params: location.params,
          component: location.record && location.record.component,
          path: location.record && location.record.path
        }

        queue = flatten(queueInit),
        len = queue.length,
        iterator = function(fn) {
          try {
            fn(current)
          } catch(e) {
            onAbort && onAbort(e);

            errorCds.forEach(function(item) {
              item(e)
            })
          }
        };

    for(var i = 0; i <= len; i++) {
      if (i == len) {
        onComplete && onComplete();

        return;
      }
      iterator(queue[i])
    }
  }

/**
 * 暂时针对没有父子嵌套的路由，
 * @return {[type]} [description]
 */
  function resolvePath() {
    var len = routes.length,
        pathMap = {};

    while(len--) {
      addRoute( routes[len], pathMap)
    }

    return pathMap;
  }

  function getHash() {
    var href = window.location.href,
        pos = href.indexOf('#');

    if(pos == -1) {
      return ''
    }

    return decodeURI(href.slice(pos+1));
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
    onError: onError,
    addRoute: addRoute,
    beforeEach: beforeEach,
    afterEach: afterEach,
  };
}
