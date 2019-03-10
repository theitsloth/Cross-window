/*
In these two, service readiness is assumed
	child =req=> parent
		call: string - name
		id: number - message identifier
		args: Array - arguments
	parent =res=> child
		id: number - same as on req
		return: Any - return value
		error: Any - thrown error
	child =qry=> parent
		query: true
		id: number - message identifier
	parent =qrs=> child
		id: number - same as on qry
		names: Array<string> - method names list
*/

/** 
 * If given args, a server to a child. If not, a client to a parent
 * @param {Window} tgt The target window
 * @param {object} service Dictionary of exposed functions
 */
function Parent(tgt = undefined, service = undefined) {
	var protocol = "TreeCWCv0"
	// Parent window, arguments are target window and exposed service
	if (tgt instanceof Window && service !== undefined) {
		window.addEventListener("message", event => {
			var msg = event.data;
			var sender = event.source;
			if (msg.protocol != protocol || sender !== tgt) return;
			if (msg.call) {
				// Functions
				var succ = data => sender.postMessage({
					id: msg.id,
					protocol,
					return: data,
				}, "*");
				var fail = data => sender.postMessage({
					id: msg.id,
					protocol,
					error: data,
				}, "*");
				// Ensure it's callable
				if (typeof service[msg.call] !== "function")
					fail("NotCallable");
				// Handling
				try {
					ret = service[msg.call](...msg.args);
					if (ret instanceof Promise)
						return ret.then(x => succ(x))
								  .catch(x => fail(x));
					return succ(ret);
				} catch(e) {
					return fail(e);
				}
			}
			else if (msg.query) {
				var names = [];
				for (var key in service.keys()) {
					if (service.hasOwnPropery &&
						!service.hasOwnPropery(key)) continue;
					names.push(key);
				}
				sender.postMessage({
					id: msg.id,
					protocol,
					names,
				}, "*");
			}
		});
	} 
	// Child window, retrieve the above from the parent
	else { 
		var pending = [];
		var namelist = [];
		window.addEventListener("message", event => {
			var msg = event.data;
			var sender = event.source;
			if (msg.protocol != protocol || (
				sender !== window.parent && sender !== window.opener)) return;
			if (pending[msg.id]) pending[msg.id](msg);
		});
		var send = (data, callback) => {
			id = generateId();
			data.id = id;
			data.protocol = protocol;
			pending[id] = callback;
			console.log("sent", data, "from", window.self);
			window.parent.postMessage(data, "*");
		}
		this.init = () => new Promise(resolve => send({ query: true }, data => {
			namelist.forEach(e => this[e] = undefined);
			data.names.forEach(e => {
				this[e] = parseFunc(e, send);
			});
			namelist = data.names;
			resolve(this);
		}));
	} // End of child window case
}

/**
 * If given a window, a client to the window. If given an object, a server to the parent 
 * @param {Window | Any} arg 
 */
function Child(arg = undefined) {
	var protocol = "TreeCWCv0"
	// Child window, argument is the exposed service
	if (!(arg instanceof Window)) { 
		var service = arg;
		window.addEventListener("message", event => {
			var msg = event.data;
			var sender = event.source;
			if (msg.protocol != protocol || (
				sender !== window.parent && sender !== window.opener)) return;
			if (msg.call) {
				// Functions
				var succ = data => sender.postMessage({
					id: msg.id,
					protocol,
					return: data,
				}, "*");
				var fail = data => sender.postMessage({
					id: msg.id,
					protocol,
					error: data,
				}, "*");
				// Ensure it's callable
				if (typeof service[msg.call] !== "function")
					fail("NotCallable");
				// Handling
				try {
					ret = service[msg.call](...msg.args);
					if (ret instanceof Promise)
						return ret.then(x => succ(x))
								  .catch(x => fail(x));
					return succ(ret);
				} catch(e) {
					return fail(e);
				}
			}
			else if (msg.query) {
				var names = [];
				for (var key in service.keys()) {
					if (service.hasOwnPropery &&
						!service.hasOwnPropery(key)) continue;
					names.push(key);
				}
				sender.postMessage({
					id: msg.id,
					protocol,
					names,
				}, "*");
			}
		});
	} 
	// Parent window, argument is the child window, retrieve the above.
	else {
		var tgt = arg;
		var pending = [];
		var namelist = [];
		window.addEventListener("message", event => {
			var msg = event.data;
			var sender = event.source;
			if (msg.protocol != protocol || sender !== tgt) return;
			if (pending[msg.id]) pending[msg.id](msg);
		});
		
		var send = (data, callback) => {
			id = generateId();
			data.id = id;
			data.protocol = protocol;
			pending[id] = callback;
			console.log("sent", data, "from", window.self);
			tgt.postMessage(data, "*");
		};
		this.init = () => new Promise(resolve => send({ query: true }, data => {
			namelist.forEach(e => this[e] = undefined);
			data.names.forEach(e => {
				this[e] = parseFunc(e, send);
			});
			namelist = data.names;
			resolve();
		}));
	}
}

function parseFunc(name, send) {
	return function() {
		var args = Array.from(arguments);
		return new Promise((resolve, reject) => {
			send({
				call: name,
				args,
			}, data => {
				if (data.error) reject(data.error);
				else resolve(data.return);
			});
		}); // End of promise
	} // End of returned lambda
} // End of parseFunc
function generateId() {
	return Math.floor(Math.random() * Math.pow(10, 10));
}