var cfg = require("./config");

var bunyan = require('bunyan');
//目前这种简单的配置，导致log不支持[cluster](https://github.com/trentm/node-bunyan#stream-type-rotating-file)
var log = bunyan.createLogger({
  name: cfg.log.name,
  serializers: {request: bunyan.stdSerializers.req},
  streams: [{
    path: cfg.log.path,
    type: 'rotating-file',
    period: '1d',   // daily rotation
    count: 3
  }]
});

//连接redis
var redis = require("redis"),
    db = redis.createClient({
      host: cfg.db.host,
      port: cfg.db.port,
      connect_timeout: cfg.db.connect_timeout,
      max_attempts: cfg.db.retry
    });

//redis报错处理
db.on("error", function(err){
  log.error(err);
  console.log(err);

  var killTimer = setTimeout(function () {
      process.exit(1);
  }, 30000);
  killTimer.unref();

  server.close();
});


//创建服务器
var restify = require('restify');
var server = restify.createServer({
  log: log
});

//处理全局的异常捕获
server.on("uncaughtException", function(request, response, route, error){
    log.error(error);
    response.send(error.statusCode, {status: false, msg: "server error"});
});
server.on("NotFound", function(request, response, error, cb){
    log.error(error);
    response.send(error.statusCode, {status: false, msg: error.message});
});
server.on("MethodNotAllowed", function(request, response, error, cb){
    log.error(error);
    response.send(error.statusCode, {status: false, msg: error.message});
});
server.on("VersionNotAllowed", function(request, response, error, cb){
    log.error(error);
    response.send(error.statusCode, {status: false, msg: error.message});
});
server.on("UnsupportedMediaType", function(request, response, error, cb){
    log.error(error);
    response.send(error.statusCode, {status: false, msg: error.message});
});

//加载必要插件
server.use(restify.queryParser());  //url参数解析
server.use(restify.requestLogger()); //为请求装载日志实例

//跨域允许
restify.CORS.ALLOW_HEADERS.push('auth');
server.pre(restify.CORS());

//根据配置加载服务路由
Object.keys(cfg.modules).forEach(function(type){
  if(cfg.modules[type]){
    var module = require("./modules/"+ type);
    module.init(server, db);
  }
});

//定义本中间件提供的2个rest服务
var api = require("./modules/datatrace");
server.get("/bindings", function(req, res, next){ //用于显示当前用户的第三方绑定账号状态
  var token = req.header("AUTH", false);
  if(!token){
    req.log.error(new Error("request have no auth"));
    res.send({status: false, msg: "携带参数缺失"});
    next();
  }else{
    api.getUidBySessId(token, function(err, uid){
      if(err){
        req.log.error(err);
        res.send({status: false, msg: err.message});
        next();
      }else{
        //根据uid查看该用户的第三方账号绑定状态
        db.hgetall("u2o"+uid, function(err, replies){
          if(err){
            req.log.error(err);
            res.send({status: false, msg: err.message});
          }else{
            var result = {
              weixin: false,
              qq: false
            };
            if(replies){
              result.weixin = replies.w?true:false;
              result.qq = replies.q?true:false;
            }

            res.send({status: true, data: result});
          }
          next();
        });
      }
    });
  }
});

server.del("/bindings-clear/:type", function(req, res, next){  //用于清除当前用户的特定第三方账号绑定关系
  var token = req.header("AUTH", false);
  if(!token){
    req.log.error(new Error("request have no auth"));
    res.send({status: false, msg: "携带参数缺失"});
    next();
  }else{
    api.getUidBySessId(token, function(err, uid){
      if(err){
        req.log.error(err);
        res.send({status: false, msg: err.message});
        next();
      }else{
        if(req.params.type == "weixin"){

          db.hget("u2o"+uid, "w", function(err, openid){
            if(err){
              req.log.error(err);
              res.send({status: false, msg: err.message});
            }else{
              db.multi()
                .hdel("u2o"+uid, "w")
                .del("w2u"+openid)
                .exec(function(err, replies){
                  if(err){
                    req.log.error(err);
                    res.send({status: false, msg: err.message});
                  }else{
                    res.send({status: true});
                  }
                  next();
                });
            }
          });

        }else if(req.params.type == "qq"){

          db.hget("u2o"+uid, "q", function(err, openid){
            if(err){
              req.log.error(err);
              res.send({status: false, msg: err.message});
            }else{
              db.multi()
                .hdel("u2o"+uid, "q")
                .del("q2u"+openid)
                .exec(function(err, replies){
                  if(err){
                    req.log.error(err);
                    res.send({status: false, msg: err.message});
                  }else{
                    res.send({status: true});
                  }
                  next();
                });
            }
          });
        }else{  //未识别的类型一律返回成功状态
          res.send({status: true});
          next();
        }
      }
    });
  }
});

db.on("ready", function(){
  //绑定服务端口
  server.listen(cfg.port, cfg.host, function() {
    console.log('%s listening at %s', server.name, server.url);
  });
});
