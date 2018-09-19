/*    内部接口    */
  function init(selector) {
    var render = document.querySelector(selector),
        routeMap = resolvePath();

    if(!~window.location.href.indexOf('#')){
      window.history.replaceState({}, "index", "#/")
    } else {
      renderRoute()
    }

    window.addEventListener('popstate', function(e) {
      renderRoute();
    })
  }

  function renderRoute() {
    var currentHash = getHash(),
        routeMap = resolvePath(),
        current;

    current = routeMap[currentHash];

    render.innerHTML = current.template
  }

  function resolvePath() {
    var len = routes.length,
        pathRoute = {};

    while(len--) {
      var singleRoute = routes[len];

      pathRoute[singleRoute.path] = {
        component: singleRoute.component,
        template: singleRoute.component.template
      }
    }

    return pathRoute;
  }

  function getHash() {
    var href = window.location.href,
        pos = href.indexOf('#');

    return href.slice(pos+1)
  }
