
import  { minRoute} from './app-simple';
 console.log("ddssasdfas")
var routes = [
  { path: '/', component: Home }, // all paths are defined without the hash.
  { path: '/foo/:id', component: Foo },
  { path: '/bar',
    component: Bar,
    children: [
      {
        path: '/baba',
        component: baba
      }
    ] }
]

var handle = minRoute({
  id: 'app',
  routes:routes
})

handle.beforeEach(function(route){
  console.log('into',route)
  console.log("ddd")
})

document.querySelector('#btn-go').addEventListener('click', function() {
  handle.push({path: '/bar',params:{id:9999}});
})
