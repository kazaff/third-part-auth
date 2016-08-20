##第三方登录中间件


###场景描述
---

目前只实现针对qq，微信登录功能，具体流程如下：

- 用户使用注册账号登录追源网站后，在个人资料栏目绑定自己的微信账号：

	- 点击微信或qq图标
	- 手机微信扫一扫弹出的微信二维码，或在qq鉴权页面登录qq
	- 用户确认授权
	- 完成绑定

- 用户下一次登录网站系统时，可以使用之前绑定过的微信账号：

	- 点击网站登录
	- 选择微信登录方式
	- 手机微信扫描网站弹出的微信二维码，或在qq鉴权页面登录qq
	- 用户确认授权
	- 完成网站登录

[作废块]

- 用户在公司对应的微信服务号中通过点击对应的访问链接，跳转到网站首页后保持已登录状态

[/作废块]

###实现细节
---

#####网站账号和微信账号的绑定

![](http://pic.yupoo.com/kazaff/FMVYRaUJ/2ZH4T.png)

1. 根据微信开放平台提供的[接口](https://open.weixin.qq.com/cgi-bin/showdocument?action=dir_list&t=resource/res_list&verify=1&id=open1419316505&token=&lang=zh_CN)，网站前台显示二维码供用户扫描，并填写**redirect_uri**参数为`本中间件`提供的服务地址，**state**参数要包含当前登录用户的**会话id**，包含需要`本中间件`回调的url地址，以"|"分割，例如：

	https://open.weixin.qq.com/connect/qrconnect?xxxxxxxxxx&state=123|http%3a%2f%2fblog.kazaff.me


2. `本中间件`对应的服务地址会得到用户授权的**access_token**，并通过调用相关微信接口取得用户的**unionid**；

3. `本中间件`通过之前携带的登录用户的**会话id**，请求系统的后台服务换取当前用户的id，并将用户的id和上一步获取得到的**unionid**对应关系存储在redis中；

4. 以上操作均完成后返回到第1步传递的前台url地址，并携带url参数：

	- status：表示结果状态，0||1
	- msg：当status为0时，携带错误信息
	- type：当status为1时，表示绑定的类型，例如：weixin

#####网站微信账号登录

![](http://pic.yupoo.com/kazaff/FMVYRkiQ/Gpqe.png)

0. 网站前台显示二维码供用户扫描，并填写**redirect_uri**参数为`本中间件`提供的服务地址，**state**参数要包含需要`本中间件`回调的url地址；

	https://open.weixin.qq.com/connect/qrconnect?xxxxxxxxxx&state=http%3a%2f%2fblog.kazaff.me


1. 用户登录时扫描二维码后，微信接口会引导用户到`本中间件`的服务地址，`本中间件`会从redis中根据**unionid**取得用户的id；

2. `本中间件`会根据用户的id请求系统后台服务，后台服务需要创建该用户的会话id，并结合该用户登录所需相关信息一起返回给`本中间件`；

3. 以上操作均完成后返回到第1步传递的前台url地址，并携带url参数：

	- status：表示结果状态，-1，0，1，其中-1表示当前用户还未注册本网站系统
	- msg：当status为0时，携带错误信息
	- type：当status为1时，表示绑定的类型，例如：weixin


[作废块]

#####微信公众号登录

1. 用户点击公众号对应的链接后，用户本被引导到`本中间件`的服务地址，该服务会使用微信[接口](http://mp.weixin.qq.com/wiki/17/c0f37d5704f0b64713d5d2c37b468d75.html)得到用户的**unionid**；

2. `本中间件`会根据**unionid**从redis中获取用户的id；

3.  `本中间件`会根据用户的id请求追源后台服务，后台服务需要创建该用户的会话id，并结合该用户登录所需相关信息一起返回给`本中间件`；

4. `本中间件`将得到的用户信息和会话id作为url参数将用户引导到指定的前台网站地址；

5. 前台系统对应接受回调的地址会执行逻辑将得到的用户会话id和用户信息进行响应的持久化，并将用户重定向到登录后的首页。


#####微信公众号access_token的获取和维护

1. `本中间件`会根据配置的appid和appsecrect请求微信[接口](http://mp.weixin.qq.com/wiki/11/0e4b294685f817b95cbed85ba5e82b8f.html)，以得到**access_token**；

2. 该**access_token**会提供给上面提到的“微信公众号登录”流程的第一步使用；

3. `本中间件`会根据第一步返回的有效期进行自动延期**access_token**，该操作要和其它操作保持并行，以保持在延期过程中**access_token**的有效性（但这一点，官方提示：公众平台后台会保证在刷新短时间内，新老access_token都可用，这保证了第三方业务的平滑过渡）。

[/作废块]


###安全性
---

`本中间件`请求系统后台服务时，应进行一定的认证逻辑，因为后台服务接口都是暴露给前台系统用户使用的，很容易被第三方利用来伪造登录，**后果很严重**。最好可以让该接口只接受内网请求，不过也可以暂时使用一个固定的密钥来简单实现认证。

###所需后台系统接口描述
---

- 用于根据用户会话id获取用户uid的接口
	- get类型
	- 接口地址：/user/profile
	- 携带参数：

	```
	自定义请求头 AUTH，用来携带用户会话id
	```

	- 响应类型：

	```
	{
		status:true,	//状态
		msg:"",	//错误提醒
		data:{
			id: 7	//用户id
		}
	}

	```


- 用于根据给定用户uid创建会话id的接口
	- post类型
	- 接口地址：/user/IDLogin
	- 携带参数：

	```
	id： 用户id
	key： 用于通信双方识别的密钥，类似微信接口所需的appsecret
	```

	- 响应类型：

	```
	{
		status:true,	//状态
		msg:"",	//错误提醒
		data:{
			session:"a!@#QERQWEdfadf!@%(%&^*)"	//会话id
		}
	}

	```

###配置文件解析
---

这里只列出配置文件的位置，其内容是自解释的：

- /config.js
- /modules/datatrace/config.js
- /modules/weixin/config.js
- /modules/qq/config.js

根据需要修改实际项目所需的配置。

###运行
---

	node app.js

建议使用pm2来管理，不过由于所使用的log库的原因，不要以cluser方式运行，否则日志文件会乱，有兴趣用在自己项目里的朋友，可以根据官方文档修改log配置即可。


###MORE
---
更多内容，可查看:

[微信第三方登录](http://blog.kazaff.me/2015/11/24/%E5%BE%AE%E4%BF%A1%E7%AC%AC%E4%B8%89%E6%96%B9%E7%99%BB%E5%BD%95/)

[QQ第三方登录](http://blog.kazaff.me/2015/11/25/qq%E7%AC%AC%E4%B8%89%E6%96%B9%E7%99%BB%E5%BD%95/)
