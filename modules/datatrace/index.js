"use strict";

var cfg = require("./config");
var restify = require('restify');

module.exports = {
  getUidBySessId: function(sess_id, callback){  //根据会话id得到对应的用户id

    //for test
    //return callback(null, 7);

    var api = restify.createJsonClient({
      url: cfg.host,
      requestTimeout: cfg.requestTimeout,
      headers: {
        AUTH: sess_id
      }
    });

    api.get("/user/profile", function(err, req, res, obj){
      //处理接口请求异常
      if(err){
        callback(err);
        return;
      }
      //处理接口返回的错误响应
      if(!obj.status){
        callback(new Error(obj.msg));
        return;
      }
      //返回用户id
      callback(null, obj.data.id);
    });
  },

  getSessIdForUid: function(u_id, callback){  //为指定的用户id创建登录会话id

    //for test
    //return callback(null, "123adsfasdf");

    var api = restify.createJsonClient({
      url: cfg.host,
      requestTimeout: cfg.requestTimeout
    });

    api.post("/user/IDLogin", {id: u_id, key: cfg.secret}, function(err, req, res, obj){
      //处理接口请求异常
      if(err){
        callback(err);
        return;
      }
      //处理接口返回的错误响应
      if(!obj.status){
        callback(new Error(obj.msg));
        return;
      }
      //返回用户的会话id
      callback(null, obj.data.session);
    });
  }
}
