# Cross-window
An abstraction on top of window.postMessage to allow for complex strategies involving iframes and popups.

There are two files. One for the master window and one for the clients. The root window must include the file because it acts as a relay between clients. It needs no further setup or configuration and it can coexist with clients on the same window. The client file creates an object called `Comm`.  
Most methods are asynchronous, since they expect a response from the master window which may be an error.

`Comm.listen( name:string, handler:function ):Promise<Listener>`  
Registers the handler with a name, so it can be targeted by `request` calls.

`Comm.request( name:string, data:Any ):Promise<Any>`  
Send a request to the specified name, with the specified data. Will resolve with the reply from the name holder.

`Comm.abide( name:string ):Promise<Any>`  
creates a single-use service, which resolves the promise and deletes itself on the first call. Can be used to wait for cross-window events.

`Listener.handler { get; set; }`  
Setter enforces the value to be a function

`Listener.name { get; }`  
Create-time name (read-only, destroy and create other if you want to change name)

`Listener.destroy():Promise<Uundefined>`  
Unregisters the handler and sets the status to deleted so the handler can't be called.
