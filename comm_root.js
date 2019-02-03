/**
 * SimpleCWC v0
 * message.protocol = "SimpleCWCv0";
 * message.phase = "server" | "client";
 * message.type = "req" | "res" | "sub" | "unsub" | "pub" |
 * 	              "reg" | "unreg" | "error"
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
 */
(function(stdlib){
	// State containers
	addressBook = [];
	replyCodes = [];
	listeners = [];
	memory = {};
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
	if (getTopWindow() != window.self && !ForceCommRootRole) return;
	stdlib.initWindow = getTopWindow();
	//#endregion
	//#region logic
	function send(target, message) {
		message.protocol = protocol;
		message.phase = "client";
		target.postMessage(message, "*");
	}
	// Event handler
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
					send(sender, {
						data: data,
						messageId: msg.messageId,
						type: "res",
					});
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
				listeners.filter(x => x.channel === msg.channel)
					.forEach(x => { send(x.postable, {
						type: "pub",
						data: msg.data,
						channel: x.channel,
						listener: x.id,
					});
				});
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
				previousValue = memory[msg.value];
				memory[msg.name] = msg.value;
				send(sender, {
					messageId: msg.messageId,
					previous: previousValue,
				});
				return;
			}
			//#endregion
		} catch(e) {
			e.messageId = msg.messageId;
			console.log(e);
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
	//#endregion

    window.addEventListener("message", receiveMessage, false);
})(window);