"use strict";

var cfg = require("./config");
var api = require("../datatrace");
var restify = require('restify');


//针对qq在oauth中使用的jsonp方式
function parseJsonp(data){
  return /(openid":")(.*)(")/.exec(data)[2];
}

module.exports = {
  init: function(server, db){

    //处理接口服务路由前缀
    var prefix = "qq";
    if(cfg.uri_prefix){
      prefix = cfg.uri_prefix;
    }

    //用于账号绑定的qq回调地址
    server.get(prefix + "/binding/callback", function(req, res, next){

      var state = req.params.state.split("|");
      var token = state[0]; //获取用户的会话id
      var url = state[1]; //获取需要跳转的前台系统地址

      if(!token){ //前台系统没有携带用户会话id
        req.log.error(new Error("session_id not found"));
        res.redirect(url + "?status=0&msg=无法识别用户账号", next);
      }else if(req.params.usercancel){ //表明qq用户禁止授权
        res.redirect(url + "?status=0&msg=用户禁止授权", next);
      }else if(req.params.msg){
        req.log.error(new Error(req.params.msg));
        res.redirect(url + "?status=0&msg=服务器异常", next);
      }else{

        api.getUidBySessId(token, function(err, uid){
          if(err){
            req.log.error(err);
            res.redirect(url + "?status=0&msg=无法识别用户账号", next);
          }else{

            //根据qq给予的code换取access_token
            var domain = require("../../config").domain;
            var qqAPI = restify.createStringClient({
              url: "https://graph.qq.com",
            });

            qqAPI.get("/oauth2.0/token?grant_type=authorization_code&client_id="+cfg.appid+
                          "&client_secret="+cfg.appsecret+
                          "&code="+req.params.code+
                          "&redirect_uri="+encodeURIComponent(domain+"/"+prefix+"/binding/callback"),

                function(err, request, response, data) {
                  if(err){
                    req.log.error(err);
                    res.redirect(url + "?status=0&msg=qq服务请求失败", next);
                  }else if(response.header("location")){
                    //由于restify不会自动解析rewrite跳转（也就是301或302响应头），
                    //所以我们这里直接获取qq返回的重定向地址，解析地址取得需要的参数
                    var params = require('url').parse(response.header("location"), true).query;

                    if(params.code){
                      req.log.error(new Error({code: params.code, msg: params.msg}));
                      res.redirect(url + "?status=0&msg=服务器异常", next);
                    }else if(params.access_token){
                      //用access_token换取用户的openid
                      qqAPI.get("/oauth2.0/me?access_token="+params.access_token, function(err, request, response, data){
                        if(err){
                          req.log.error(err);
                          res.redirect(url + "?status=0&msg=qq服务请求失败", next);
                        }else{
                          //qq服务器在缺少请求参数的时候会直接返回错误信息，
                          //它太老了以至于根本不是json结构，而是采用的jsonp，我们就需要自己剥离出需要的参数了，Onz
                          //var data = eval(data);  //这里由于使用了eval，所以需要小心安全问题

                          var openid = parseJsonp(data);
                          if(openid){

                            //把用户id和qq得到的openid绑定在redis中
                            db.multi()
                              .hmset("u2o"+uid,  {
                                "q": openid,
                              })
                              .set("q2u"+openid, uid)
                              .exec(function(err, replies){
                                if(err){
                                  req.log.error(err);
                                  res.redirect(url + "?status=0&msg=服务故障", next);
                                }else{
                                  res.redirect(url + "?status=1&type=qq", next);
                                }
                              });

                          }else{
                            req.log.error(new Error("严重问题，有可能碰到中间人攻击，请查看服务器DNS是否被改动，或者服务器处于使用代理环境！"));
                            res.redirect(url + "?status=0&msg=服务器异常", next);
                          }
                        }
                      });

                    }else{
                      req.log.error(new Error("严重问题，有可能碰到中间人攻击，请查看服务器DNS是否被改动，或者服务器处于使用代理环境！"));
                      res.redirect(url + "?status=0&msg=服务器异常", next);
                    }

                  }else{
                    //qq服务器在缺少请求参数的时候会直接返回错误信息，
                    req.log.error(new Error(data));
                    res.redirect(url + "?status=0&msg=服务器异常", next);
                  }
              });
          }
        });
      }
    });

    //用于同步登录的qq回调地址
    server.get(prefix + "/login/callback", function(req, res, next){
      var url = req.params.state; //获取需要跳转的前台系统地址

      if(req.params.usercancel){ //表明qq用户禁止授权
        res.redirect(url + "?status=0&msg=用户禁止授权", next);
      }else if(req.params.msg){
        req.log.error(new Error(req.params.msg));
        res.redirect(url + "?status=0&msg=服务器异常", next);
      }else{
        //根据qq给予的code换取access_token
        var domain = require("../../config").domain;
        var qqAPI = restify.createStringClient({
          url: "https://graph.qq.com",
        });

        qqAPI.get("/oauth2.0/token?grant_type=authorization_code&client_id="+cfg.appid+
                      "&client_secret="+cfg.appsecret+
                      "&code="+req.params.code+
                      "&redirect_uri="+encodeURIComponent(domain+"/"+prefix+"/login/callback"),

            function(err, request, response, data) {
              if(err){
                req.log.error(err);
                res.redirect(url + "?status=0&msg=qq服务请求失败", next);
              }else if(response.header("location")){
                //由于restify不会自动解析rewrite跳转（也就是301或302响应头），
                //所以我们这里直接获取qq返回的重定向地址，解析地址取得需要的参数
                var params = require('url').parse(response.header("location"), true).query;

                if(params.code){
                  req.log.error(new Error({code: params.code, msg: params.msg}));
                  res.redirect(url + "?status=0&msg=服务器异常", next);
                }else if(params.access_token){
                  //用access_token换取用户的openid
                  qqAPI.get("/oauth2.0/me?access_token="+params.access_token,
                    function(err, request, response, data){
                      if(err){
                        req.log.error(err);
                        res.redirect(url + "?status=0&msg=qq服务请求失败", next);
                      }else{
                        //qq服务器在缺少请求参数的时候会直接返回错误信息，
                        //它太老了以至于根本不是json结构，而是采用的jsonp，我们就需要自己剥离出需要的参数了，Onz
                        //var data = eval(data);  //这里由于使用了eval，所以需要小心安全问题

                        var openid = parseJsonp(data);
                        if(openid){

                          //根据用户qq的openid获取用户的id
                          db.get("q2u"+openid, function(err, reply){
                            if(err){
                              req.log.error(err);
                              res.redirect(url + "?status=0&msg=服务故障", next);
                            }else if(!reply){
                              res.redirect(url + "?status=-1", next);
                            }else{
                              api.getSessIdForUid(reply, function(err, session_id){
                                if(err){
                                  req.log.error(err);
                                  res.redirect(url + "?status=0&msg=服务故障", next);
                                }else{
                                  res.redirect(url + "?status=1&token=" + session_id, next);
                                }
                              });
                            }
                          });

                        }else{
                          req.log.error(new Error("严重问题，有可能碰到中间人攻击，请查看服务器DNS是否被改动，或者服务器处于使用代理环境！"));
                          res.redirect(url + "?status=0&msg=服务器异常", next);
                        }
                      }
                    });

                }else{
                  req.log.error(new Error("严重问题，有可能碰到中间人攻击，请查看服务器DNS是否被改动，或者服务器处于使用代理环境！"));
                  res.redirect(url + "?status=0&msg=服务器异常", next);
                }

              }else{
                //qq服务器在缺少请求参数的时候会直接返回错误信息，
                req.log.error(new Error(data));
                res.redirect(url + "?status=0&msg=服务器异常", next);
              }
            });
      }
    });
  },
}
