"use strict";

module.exports = {
  domain: "http://localhost:3000",  //该服务对外的域名，配合反向代理使用
  host: "127.0.0.1",    //该服务绑定的地址
  port: 3000,
  modules: {
    qq: true,
    weixin: true,
  },
  db: {
    host: "127.0.0.1",
    port: 6379,
    connect_timeout: 30000,    //毫秒
    retry: 2  //重试次数
  },
  log: {
    name: "3p",
    path: "./logs/error.log",
  }
}
