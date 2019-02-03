# Cross-window
An abstraction on top of window.postMessage to allow for complex strategies involving iframes and popups.

There are two files. One for the master window and one for the clients. The root window must include the file because it acts as a relay
between clients. It needs no further setup or configuration and it can coexist with clients on the same window. 
The client file is a class definition, called `Comm`.  
Most methods are asynchronous, since they expect a response from the master window which may be an error.

`Comm.register( name:string ):Promise<undefined>`  
Registers the service with a name, so it can be targeted by `request` calls. It's important that `onRequest` be called before this,
so the client has a handler for the requests. The default handler just throws an exception.

`Comm.unregister():Promise<undefined>`  
Unregisters the service. Since `onRequest` cannot be unset, this is the way to stop receiving requests.

`Comm.onRequest( handler:Function|Promise<any> ):undefined`  
Sets the request handler, which can be a function or a promise.

`Comm.request( name:string, data:Any ):Promise<Any>`  
Send a request to the specified name, with the specified data. Will resolve with the reply from the name holder.

`Comm.subscribe( channel:string, handler:Function ):Promise<Number>`  
Subscribe to a channel. Every time someone publishes to that channel, the handler will be called. The number of subscribed clients
is returned.

`Comm.unsubscribe( channel:string ):Promise<Number>`  
Remove the subscription from a channel. The number of remaining clients is returned

`Comm.publish( channel:string, data:Any ):Promise<Number>`  
Publish data to a channel. The number of clients is returned.

`Comm.get( name:string ):Promise<Any>`  
Get the value of a server variable. They are public and can be used to manage load order.

`Comm.set( name:string, value:Any ):Promise<Any>`  
Set the value of a server variable. The previous value is returned to make detecting race conditions easier.
