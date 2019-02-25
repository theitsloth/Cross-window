
// ##### Package header
(function(stdlib){
	var exports = {};
	
	//#region Definitions
	const protocol = "SimpleCWCv0";

	//#region static
	generateId = function() {
		return Math.floor(Math.random() * Math.pow(10, 10));
	}
	getTopWindow = function() {
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

	// Wrapper for listeners
	getListener = (id, handler, isPersistent = false) => {
		if (typeof handler !== "function")
			throw new TypeError("handler is not a function!");
		var ret = (e => {
			msg = e.data;
			if (typeof msg !== "object" ||
				msg.protocol !== this.protocol ||
				msg.phase !== "client" ||
				(id !== undefined && msg.messageId !== id)) return;
			// Delete self if persistence wasn't required
			if (!isPersistent) 
				window.removeEventListener("message", ret, false);
			// Call the defined handler and return its return value
			/** @todo Decide thisArg */
			return handler.call(window, e);
		});
		return ret;
	} 

	send = (data, callback) => {
		if (typeof data !== "object")
			throw new TypeError("Data is not an object!");
		if (typeof callback !== "function")
			throw new TypeError("Callback is not a function!");
		var id = generateId();
		var listener = getListener(id, callback);
		window.addEventListener("message", listener, false);
		data.messageId = id;
		data.protocol = this.protocol;
		data.phase = "server";
		getTopWindow().postMessage(data, "*");
		return listener;
	}

	/**
	 * Listen on a given name with a given function
	 * @param {string | number | boolean} name The name of the service 
	 * @param {function} requestHandler The request handler
	 * @returns {Promise<{handler: function, name: string | number | boolean, destroy: function}>}
	 * Listener
	 */
	listen = (name, requestHandler) => new Promise((res, rej) => {
		if (name === undefined) name = generateId();
		// Define locals
		if (typeof name !== "string" && 
			typeof name !== "number" &&
			typeof name !== "boolean")
			throw new TypeError("Name is not a primitive");
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
			get destroy() {
				return () => new Promise((resolve, reject) => {
					send({
						type: "unreg",
						secret: _secret,
					}, res => {
						if (res.success) {
							window.removeEventListener("message", delegate);
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
				window.addEventListener("message", delegate);
				res(listener);
			}
		});
		// Construct delegate
		var delegate = getListener(undefined, async ev => {
			var msg = ev.data;
			// If it isn't for us or we aren't listening, return
			if (msg.target !== name || _status !== 1) return;
			var replyData = null;
			try {
				// Call our handler (catch if it throws)
				/** @todo define "this" */
				var handlerReturnValue = ret.handler.call(window, msg.data);
				if (hendlerReturnValue instanceof Promise) {
					handlerReturnValue = await handlerReturnValue;
				}
				replyData = {
					error: false,
					value: handlerReturnValue,
				};
			} catch(ex) {
				if (ex instanceof Error) {
					throw new Error(
					"Throwing Error objects over message is not supported. "+
					"Check your code for internal errors.");
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

	request = (name, data) => new Promise((res, rej) => {
		var msg = {
			type: "req",
			target: name,
			data: data,
		};
		send(msg, res => {
			if (res.error || typeof res.data !== "object") rej(res);
			else if (res.data && res.data.error) rej(res.data.value);
			else res(res.data.value);
		});
	});

	abide = (name) => new Promise((res, rej) => {
		try {
			await listen(name, data => res(data));
		} catch(e) { rej(e); }
	});

	//#endregion Definitions
	//#region Exports
	exports.protocol = protocol;
	exports.Listen = Listen;

	//#endregion Exports
	// ##### Package footer
	if (stdlib.Comm !== undefined) console.error("Multiple Comm instances!");
	stdlib.Comm = exports;
})(window);
