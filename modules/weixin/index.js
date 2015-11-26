"use strict";

var cfg = require("./config");
var api = require("../datatrace");
var restify = require('restify');

module.exports = {
  init: function(server, db){

    //处理接口服务路由前缀
    var prefix = "weixin";
    if(cfg.uri_prefix){
      prefix = cfg.uri_prefix;
    }

    //用于账号绑定的微信回调地址
    server.get(prefix + "/binding/callback", function(req, res, next){

      var state = req.params.state.split("|");
      var token = state[0]; //获取用户的会话id
      var url = state[1]; //获取需要跳转的前台系统地址

      if(!token){ //前台系统没有携带用户会话id
        req.log.error(new Error("session_id not found"));
        res.redirect(url + "?status=0&msg=无法识别用户账号", next);
      }else if(!req.params.code){ //若没有携带code参数，则表明微信用户禁止授权
        res.redirect(url + "?status=0&msg=用户禁止授权", next);
      }else{
        api.getUidBySessId(token, function(err, uid){
          if(err){
            req.log.error(err);
            res.redirect(url + "?status=0&msg=无法识别用户账号", next);
          }else{
            //根据微信给予的code换取access_token
            var weixinAPI = restify.createJsonClient({
              url: "https://api.weixin.qq.com"
            });

            weixinAPI.get("/sns/oauth2/access_token?appid=" + cfg.appid + "&secret=" + cfg.appsecret + "&code=" + req.params.code + "&grant_type=authorization_code",
              function(err, request, response, obj){
                if(err){
                  req.log.error(err);
                  res.redirect(url + "?status=0&msg=微信服务请求失败", next);
                }else if(obj.errcode){  //微信接口返回错误提示
                  req.log.error(obj);
                  res.redirect(url + "?status=0&msg=微信服务请求失败", next);
                }else{
                  //把用户id和微信得到的openid绑定在redis中
                  db.multi()
                    .hmset("u2o"+uid,  {
                      "w": obj.openid,
                    })
                    .set("w2u"+obj.openid, uid)
                    .exec(function(err, replies){
                      if(err){
                        req.log.error(err);
                        res.redirect(url + "?status=0&msg=服务故障", next);
                      }else{
                        res.redirect(url + "?status=1&type=weixin", next);
                      }
                    });
                }
            });
          }
        });
      }
    });

    //用于同步登录的微信回调地址
    server.get(prefix + "/login/callback", function(req, res, next){

      var url = req.params.state; //获取需要跳转的前台系统地址

      if(!req.params.code){ //若没有携带code参数，则表明微信用户禁止授权
        res.redirect(url + "?status=0&msg=用户禁止授权", next);
      }else{
        //根据微信给予的code换取access_token
        var weixinAPI = restify.createJsonClient({
          url: "https://api.weixin.qq.com"
        });

        weixinAPI.get("/sns/oauth2/access_token?appid=" + cfg.appid + "&secret=" + cfg.appsecret + "&code=" + req.params.code + "&grant_type=authorization_code",
          function(err, request, response, obj){
            if(err){
              req.log.error(err);
              res.redirect(url + "?status=0&msg=微信服务请求失败", next);
            }else if(obj.errcode){  //微信接口返回错误提示
              req.log.error(obj);
              res.redirect(url + "?status=0&msg=微信服务请求失败", next);
            }else{
              //根据用户的微信openid获取用户的id
              db.get("w2u"+obj.openid, function(err, reply){
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
            }
        });
      }
    });

    //todo 用于微信公众号转跳的入口地址
    // server.get(prefix + "/redirect", function(req, res, next){
    //
    // });
  },

}
