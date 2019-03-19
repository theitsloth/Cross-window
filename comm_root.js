/**
 * SimpleCWC v0
 * message.protocol = "SimpleCWCv0";
 * message.phase = "server" | "client";
 * message.type = "req" | "res" | "sub" | "unsub" | "pub" |
 * 	              "reg" | "unreg" | "add" | "del" | "qry" | "error"
 * message.messageId = MsgId
 * 
 * error:
 * error.at = MsgId
 * error.type = String
 * error.message = String
 * error.details = Any
 * 
 * reg/unreg:
 * reg.name = Name
 * >.secret = Number
 * unreg.secret = Number
 * >.success = true
 * AddressBook = Arr<{ Name, Postable, Secret }>
 * 
 * req/res:
 * req.target = Name
 * req.data = Any
 * res.to = ReqId
 * res.data = Any
 * ReplyCodes = Dict<ReqId, (data) => undefined>
 * 
 * pub/sub:
 * pub.channel = String
 * pub.data = Any
 * >.clients = Number
 * sub.channel = String
 * >.clients = Number
 * >.listenerId = ListenerId
 * >>.channel = String
 * >>.data = Any
 * >>.listener = ListenerId
 * unsub.id = ListenerId
 * Listeners = Array<{ Id, Channel, Window }>
 * 
 * get/set:
 * get.name = VarName
 * >.value = Any
 * set.name = VarName
 * set.value = Any
 * >.previous = Any
 * Memory = Dict<VarName, Any>
 * 
 * add/del/qry:
 * add.secret = Secret
 * add.name = ListName
 * >.list = Array<Name>
 * del.secret = Secret
 * del.name = ListName
 * >.list = Array<Name>
 * qry.name = ListName
 * >.list = Array<Name>
 * Lists = Dict<string, Array<Name>>
 */
DEBUG = false;
(function(stdlib){
	// State containers
	addressBook = [];
	replyCodes = [];
	listeners = [];
	memory = {};
	lists = {};
	//#region Miscellaneous
	var protocol = "SimpleCWCv0";
	function generateId() {
        return Math.floor(Math.random() * Math.pow(10, 10));
    }
	function getTopWindow() {
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
	}
	// Ensure we're top
	if (getTopWindow() != window.self) return;
	stdlib.initWindow = getTopWindow();
	//#endregion
	//#region logic
	function send(target, message) {
		message.protocol = protocol;
		message.phase = "client";
		if (target.closed)
			throw new window.Error("The target window is closed.");
		target.postMessage(message, "*");
	}
	// Event handler
	/**
	 * Handles onmessage event, but can be called on anything that fulfills the param interface.
	 * @param {{data: object, source: {postMessage: function(object, string), closed: boolean}}} event 
	 */
	function receiveMessage(event) {
        var msg = event.data;
		var sender = event.source;
		if (DEBUG) console.log("Received", msg, "from", sender);
		if (typeof msg !== "object" ||
			msg.protocol !== protocol ||
			msg.phase !== "server") return;
		try {
			//#region reg/unreg
			// Register
			if (msg.type === "reg") {
				if (addressBook.find(x => x.name === msg.name))
					throw NameInUseError(msg.name);
				let secret = generateId();
				addressBook.push({
					name: msg.name,
					secret: secret,
					postable: sender,
				});
				// Let the sender know about their secret
				send(sender, {
					messageId: msg.messageId,
					secret: secret,
				});
				return;
			}
			// Delete registration (this only affects req/res)
			else if (msg.type === "unreg") {
				if (!addressBook.find(x => x.secret === msg.secret))
					throw BadSecretError(msg.secret);
				addressBook = addressBook.filter(x =>
					x.secret !== msg.secret);
				// Inform the sender that their quit was successful
				send(sender, {
					messageId: msg.messageId,
					success: true,
				});
				return;
			}
			//#endregion
			//#region req/res
			else if (msg.type === "req") {
				let tgt = addressBook.find(x => x.name === msg.target);
				if (!tgt) throw NameNotFoundError(msg.target);
				if (tgt.postable.closed) {
					addressBook = addressBook.filter(x => x.name === msg.target);
					throw NameNotFoundError(msg.target);
				}
				// Reply code is different so receivers 
				// can't abuse message id-s
				var code = generateId();
				send(tgt.postable, {
					type: "req",
					target: msg.target,
					data: msg.data,
					replyCode: code,
				});
				replyCodes[code] = (data) => {
					try {
						send(sender, {
							data: data,
							messageId: msg.messageId,
							type: "res",
						});
					} catch (e) {
						console.info("failed to forward reply:",
							"\nRequest: ", msg, 
							"\nRequester: ", sender,
							"\nReply: ", data);
					}
				};
				return;
			}
			else if (msg.type === "res") {
				if (typeof replyCodes[msg.to] !== "function")
					throw ReplyCodeNotFoundError(msg.to);
				replyCodes[msg.to](msg.data);
				replyCodes[msg.to] = undefined;
				send(sender, {
					messageId: msg.messageId,
					type: "receipt",
				});
				return;
			}
			//#endregion
			//#region pub/sub
			else if (msg.type === "sub") {
				var id = generateId();
				listeners.push({
					postable: sender,
					channel: msg.channel,
					id: id,
				});
				send(sender, {
					messageId: msg.messageId,
					clients: listeners.filter(x => 
						x.channel === msg.channel).length,
					id: id,
				});
				return;
			}
			else if (msg.type === "unsub") {
				if (!listeners.find(x => x.id == msg.id))
					throw SubscriptionNotFoundError(msg.id);
				listeners = listeners.filter(x => x.id != msg.id);
				send(sender, {
					messageId: msg.messageId,
					success: true,
				});
			}
			else if (msg.type === "pub") {
				let dead = [];
				listeners.filter(x => x.channel === msg.channel).forEach(x => { 
					try { 
						send(x.postable, {
							type: "pub",
							data: msg.data,
							channel: x.channel,
							listener: x.id,
						});
					} catch(e) {
						dead.push(x.id);
					}
				});
				listeners = listeners.filter(x => !(dead.includes(x.id)));
				send(sender, {
					messageId: msg.messageId,
					clients: listeners.filter(x => 
						x.channel === msg.channel).length,
				});
				return;
			}
			//#endregion
			//#region get/set
			else if (msg.type === "get") {
				send(sender, {
					messageId: msg.messageId,
					value: memory[msg.name],
				});
				return;
			}
			else if (msg.type === "set") {
				previousValue = memory[msg.name];
				memory[msg.name] = msg.value;
				send(sender, {
					messageId: msg.messageId,
					previous: previousValue,
				});
				return;
			}
			//#endregion
			//#region add/del/qry
			else if (msg.type === "add") {
				var addr = addressBook.find(x => x.secret === msg.secret)
				if (addr === null)
					throw BadSecretError(msg.secret);
				var name = addr.name;
				if (lists[msg.name] === undefined) lists[msg.name] = [];
				lists[msg.name].push(name);
				send(sender, {
					messageId: msg.messageId,
					list: lists[msg.name],
				});
				return;
			}
			else if (msg.type = "del") {
				var addr = addressBook.find(x => x.secret === msg.secret)
				if (addr === null)
					throw BadSecretError(msg.secret);
				var name = addr.name;
				if (lists[msg.name] === undefined || 
					!lists[msg.name].find(x => x == name)) 
					throw NotInListError(name, msg.name);
				lists[msg.name] = list[msg.name].filter(x => x != name);
				send(sender, {
					messageId: msg.messageId,
					list: lists[msg.name],
				});
				return;
			}
			else if (msg.type === "qry") {
				if (lists[msg.name] === undefined) send(sender, {
					messageId: msg.messageId,
					list: [],
				});
				else send(sender, {
					messageId: msg.messageId,
					list: lists[msg.name],
				});
				return;
			}
			//#endregion
			
		} catch(e) {
			e.messageId = msg.messageId;
			console.error(e);
			if (e instanceof window.Error)
				throw e;
			send(sender, e);
		}
	}
	//#endregion
	//#region Errors
	function Error(type, message, details) {
		this.type = type;
		this.message = message;
		this.details = details;
		this.error = true;
	}
	function NameInUseError(name) {
		return new Error(
			"NameInUse",
			"The name is already used. \
			Every registered service needs a unique name.",
			{name}
		);
	}
	function BadSecretError(secret) {
		return new Error(
			"BadSecret",
			"No registration was found with this secret. \
			Maybe the registration is already deleted?",
			{secret}
		);
	}
	function NameNotFoundError(name) {
		return new Error(
			"NameNotFound",
			"No service with that name was found. \
			Maybe it isn't loaded yet or it was deleted?",
			{name}
		);
	}
	function ReplyCodeNotFoundError(code) {
		return new Error(
			"ReplyCodeNotFound",
			"The reply code doesn't seem to exist. \
			Maybe you have already answered it?",
			{code}
		);
	}
	function SubscriptionNotFoundError(id) {
		return new Error(
			"SubscriptionNotFound",
			"The ID doesn't refer to any subscription. \
			Maybe you tried to unsubscribe twice?",
			{id}
		)
	}
	function NotInListError(name, list) {
		return new Error(
			"NameNotFound",
			"Your name wasn't found in the specified list. \
			Maybe you tried to delete yourself twice?",
			{name, list}
		)
	}
	//#endregion

	window.addEventListener("message", receiveMessage, false);
	stdlib.receiveMessage = receiveMessage;
})(window);