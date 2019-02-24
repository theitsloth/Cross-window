DEBUG = false;
function Comm() {
	//#region state containers
	this.protocol = "SimpleCWCv0";
	this.pending = [];
	this.subs = []; // {channel:string, id:int, handler:(msg => undefined)}
	this.requestHandler = () => {
		throw new Error("Registered but no handler set!");
	};
	this.name = undefined;
	this.secret = undefined;
	//#endregion

	//#region private
	receiveMessage = (event) => {
		var msg = event.data;
		var sender = event.source;
		if (DEBUG) console.log("Received", msg);
		if (typeof msg !== "object" ||
			msg.protocol !== this.protocol ||
			msg.phase !== "client") return;
		if (typeof this.pending[msg.messageId] === "function")
			this.pending[msg.messageId].call(this, msg);
		// Handling sub messages
		if (msg.type == "pub") {
			subs.find(x => x.id === msg.listener).handler(data);
		}
		// Handling requests
		if (msg.type == "req" && msg.target === this.name) {
			handleRequest(msg).then(x => {
				send({
					type: "res",
					to: msg.replyCode,
					data: {
						error: false,
						value: x
					}
				}, rec => {
					if (rec.type !== "receipt") 
						throw new Error("Fatal error on reply!");
				});
			}).catch(x => {
				send({
					type: "res",
					to: msg.replyCode,
					data: {
						error: true,
						value: x
					}
				}, rec => {
					if (rec.type !== "receipt")
						throw new Error("Fatal error on reply!");
				});
			});
		}
	};
	handleRequest = async (msg) => {
		var ret;
		try {
			ret = this.requestHandler(msg.data);
			if (ret instanceof Promise)
				return await ret;
			else return ret;
		} catch(e) {
			throw e;
		}
	}
	send = (data, callback) => {
		var id = Comm.generateId();
		this.pending[id] = callback;
		data.messageId = id;
		data.protocol = this.protocol;
		data.phase = "server";
		Comm.getTopWindow().postMessage(data, "*");
	}
	//#endregion private
	//#region public
	//#region reg/unreg
	this.register = (name = undefined) => new Promise((resolve, reject) => {
		if (name === undefined) name = Comm.generateId();
		var msg = {
			type: "reg",
			name: name,
		};
		send(msg, res => {
			if (res.error) reject(res);
			else {
				this.name = name;
				this.secret = res.secret;
				resolve();
			}
		});
	});
	this.unregister = () => new Promise((resolve, reject) => {
		if (this.name === undefined) 
			reject(new Error("Not registered yet."));
		var msg = {
			type: "unreg",
			secret: this.secret,
		};
		send(msg, res => {
			if (res.success) resolve();
			else reject(res);
		})
	});
	//#endregion reg/unreg
	//#region req/res
	this.onRequest = (handler) => {
		if (typeof handler !== "function")
			throw new Error("The handler doesn't seem to be \
							a function.");
		this.requestHandler = handler;
	}
	this.request = (name, data) => new Promise((resolve, reject) => {
		var msg = {
			type: "req",
			target: name,
			data: data,
		};
		send(msg, res => {
			if (res.error) reject(res);
			else if (res.data && res.data.error) reject(res.data.value);
			else resolve(res.data.value);
		});
	});
	//#endregion req/res
	//#region pub/sub
	this.publish = (channel, data) => new Promise((resolve, reject) => {
		var msg = {
			type: "pub",
			channel,
			data,
		};
		send(msg, res => {
			if (res.error) reject(res);
			else resolve(res.clients);
		});
	});
	this.subscribe = (channel, handler) => new Promise((resolve, reject) => {
		if (typeof handler !== "function")
			reject(new Error("Handler must be a function!"));
		var msg = {
			type: "sub",
			channel,
		};
		send(msg, res => {
			if (res.error) reject(res);
			else {
				subs.push({
					channel: channel,
					id: res.listenerId,
					handler: handler,
				});
				resolve(res.clients);
			}
		})
	});
	this.unsubscribe = (channel) => new Promise((resolve, reject) => {
		var id = subs.find(x => x.channel === channel).id;
		var msg = {
			type: "unsub",
			id: id,
		};
		send(msg, res => {
			if (res.error) reject(res);
			else if (res.success) {
				resolve(res.success);
				subs = subs.filter(x => x.id !== id);
			}
		});
	});
	//#endregion pub/sub
	//#region get/set
	this.get = (name) => new Promise((resolve, reject) => {
		var msg = {
			type: "get",
			name: name,
		};
		send(msg, res => {
			if (res.error) reject(res);
			else resolve(res.value);
		});
	});
	this.set = (name, value) => new Promise((resolve, reject) => {
		var msg = {
			type: "set",
			name: name,
			value: value,
		};
		send(msg, res => {
			if (res.error) reject(res);
			else resolve(res.previous);
		});
	});
	//#endregion get/set
	//#region add/del/qry
	this.addTo = (name) => new Promise((resolve, reject) => {
		var msg = {
			type: "add",
			secret: this.secret,
			name,
		};
		send(msg, res => {
			if (res.error) reject(res);
			else resolve(res.list);
 		});
	});
	this.delFrom = (name) => new Promise((resolve, reject) => {
		var msg = {
			type: "del",
			secret: this.secret,
			name,
		};
		send(msg, res => {
			if (res.error) reject(res);
			else resolve(res.list);
		});
	});
	this.query = (name) => new Promise((resolve, reject) => {
		var msg = { type: "qry", name };
		send(msg, res => {
			if (res.error) reject(res);
			else resolve(res.list);
		});
	});
	//#endregion add/del/qry
	//#endregion public
	window.addEventListener("message", receiveMessage, false);
}

//#region static
Comm.generateId = function() {
	return Math.floor(Math.random() * Math.pow(10, 10));
}
Comm.getTopWindow = function() {
	var cur = window.self;
	// change to the local top window
	cur = cur.top;
	// If that is a popup
	while (cur.opener !== null) {
		// change to its opener's root window
		cur = cur.opener.top;
	}
	// When it's the original, return it
	return cur;
};
//#endregion

async function Once(name) {
	var client = new Comm();
	await client.register(name);
	return await new Promise((res, rej) =>
	client.onRequest(async m => {
		await client.unregister()
			.except(e => rej(e));
		res(m);
	}));	
}