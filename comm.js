
// ##### Package header
(function(global){
	// In a worker
	if (!global.addEventListener) {
		let listeners = [];
		global.addEventListener = h => {
			if (typeof h !== "function")
				throw new Error("Listener must be function!");
			listeners.push(h);
		}
		global.removeEventListener = h => {
			listeners = listeners.filter(x => x !== h);
		}
		onmessage = e => {
			listeners.forEach(l => l.call(global, e));
		}
	}
	var exports = {};
	
	//#region Definitions
	const protocol = "SimpleCWCv0";

	//#region static
	var generateId = function() {
		return Math.floor(Math.random() * Math.pow(10, 10));
	}
	var getTopWindow = function() {
		if (!window)
			throw new Error("Not in a window!");
		var cur = global.self;
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

	// Wrapper for listeners
	var getListener = (id, handler, isPersistent = false) => {
		if (typeof handler !== "function")
			throw new TypeError("handler is not a function!");
		var ret = (e => {
			msg = e.data;
			if (typeof msg !== "object" ||
				msg.protocol !== protocol ||
				msg.phase !== "client" ||
				(id !== undefined && msg.messageId !== id)) return;
			// Delete self if persistence wasn't required
			if (!isPersistent) 
				global.removeEventListener("message", ret, false);
			// Call the defined handler and return its return value
			/** @todo Decide thisArg */
			return handler.call(global, msg);
		});
		return ret;
	} 

	var send = (data, callback) => {
		if (typeof data !== "object")
			throw new TypeError("Data is not an object!");
		if (typeof callback !== "function")
			throw new TypeError("Callback is not a function!");
		var id = generateId();
		var listener = getListener(id, callback);
		global.addEventListener("message", listener, false);
		data.messageId = id;
		data.protocol = protocol;
		data.phase = "server";
		// In window
		if (window)
			getTopWindow().postMessage(data, "*");
		// In worker
		else 
			postMessage(data);
		return listener;
	}

	/**
	 * Listen on a given name with a given function
	 * @param {string | number | boolean} name The name of the service 
	 * @param {function} requestHandler The request handler
	 * @async
	 * @returns {handler: function, name: string | number | boolean, destroy: function}
	 * Listener
	 */
	var listen = (name, requestHandler) => new Promise((res, rej) => {
		if (name === undefined) name = generateId();
		// Define locals
		if (typeof name !== "string" && 
			typeof name !== "number" &&
			typeof name !== "boolean")
			rej(new TypeError("Name is not a primitive"));
		const _name = name;
		var _secret = null;
		var _handler = null;
		// 0: preparing, 1: active, 2: destroyed
		var _status = 0;
		// Define object
		var listener = {
			// Handler is a property, it can be assumed to be a function
			get handler() {
				return _handler;
			},
			set handler(val) {
				if (typeof val !== "function")
					throw new TypeError("handler must be a function!");
				_handler = val;
			},
			// name and destroy are constants.
			get name() {
				return _name;
			},
			// Async function
			get destroy() {
				return () => new Promise((resolve, reject) => {
					send({
						type: "unreg",
						secret: _secret,
					}, res => {
						if (res.success) {
							global.removeEventListener("message", delegate);
							_status = 2;
							_secret = undefined;
							resolve();
						}
						else reject(res);
					});
				});
			}
		};
		// Use our new made setter
		try { listener.handler = requestHandler; }
		catch(e) { rej(e); }
		// Register
		send({
			type: "reg",
			name: _name,
		}, response => {
			if (response.error) rej(response);
			else {
				_secret = response.secret;
				_status = 1;
				global.addEventListener("message", delegate);
				res(listener);
			}
		});
		// Construct delegate
		var delegate = getListener(undefined, async msg => {
			// If it isn't for us or we aren't listening, return
			if (msg.target !== name || _status !== 1) return;
			var replyData = null;
			try {
				// Call our handler (catch if it throws)
				/** @todo define "this" */
				var handlerReturnValue = listener.handler.call(global, msg.data);
				if (handlerReturnValue instanceof Promise) {
					handlerReturnValue = await handlerReturnValue;
				}
				replyData = {
					error: false,
					value: handlerReturnValue,
				};
			} catch(ex) {
				if (ex instanceof Error) {
					console.error(new Error(
					"Throwing Error objects over message is not supported. "+
					"Check your code for internal errors."));
					throw ex;
				}
				replyData = {
					error: true,
					value: ex,
				};
			}
			send({
				type: "res",
				to: msg.replyCode,
				data: replyData,
			}, receipt => {
				if (receipt.type !== "receipt") 
					throw new Error("Fatal error on reply!");
			});
		}, true);
	});

	/** Sends a request to a service and returns the reply
	 * @param {string | number | boolean} name Name of the service
	 * @param {any} data Data sent with the request
	 * @async
	 * @returns {any} Controlled by service
	 * @throws {any} Controlled by service
	 */
	var request = (name, data) => new Promise((resolve, reject) => {
		var msg = {
			type: "req",
			target: name,
			data: data,
		};
		send(msg, result => {
			if (result.error || typeof result.data !== "object") reject(result);
			else if (result.data && result.data.error) reject(result.data.value);
			else resolve(result.data.value);
		});
	});

	/** Spawns a single-use service that destroys itself 
	 * immediately after having been triggered.
	 * @param name Name of the temporary service
	 * @async
	 * @returns {any}
	 */
	var abide = (name) => new Promise((res, rej) => {
		try {
			var listener;
			listen(name, data => {
				listener.destroy();
				/* Resolve very soon, but after finish
				so that the response is sent before
				we consider the communication complete */
				setTimeout(() => res(data), 1);
			})
			.then(ret => listener = ret)
			.catch(e => rej(e));
		} catch(e) { rej(e); }
	});

	//#endregion Definitions
	//#region Exports
	exports.protocol = protocol;
	exports.listen = listen;
	exports.request = request;
	exports.abide = abide;

	//#endregion Exports
	// ##### Package footer
	if (global.Comm !== undefined) console.error("Multiple Comm instances!");
	global.Comm = exports;
})(this);
