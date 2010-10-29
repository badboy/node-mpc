# node-mpc #

Simple [mpd][] client using [node.js][] as the server backend and other open-source projects.

Backend:

* [socket.io-node][] as the websocket server.
* [paperboy][] for static file delivery.

Frontend:

* [require.js][] as file and module loader for the frontend.
* [less.js][] as CSS alternative.
* [socket.io][] for the websocket connection.

Design is mostly inspired and taken from [streamie][]. Thanks to cramforce and the other designers.

I took over the \*.less files with just some small modifications, but I didn't remove unneeded things for now.

The client is fully working, but the code needs some cleanup.

## ToDo ##

* Code Cleanup!
* Configurable. Not everyone has mpd running on localhost:6600 and most of them are even secured by password.
* ...
* See [TODO](http://github.com/badboy/node-mpc/blob/master/TODO)

## Setup ##

* `npm install socket.io`
* `npm install paperboy`
* Make sure you're mpd is up and running (no auth support yet)
* `node mpd-connect.js PORT HOST`
* <http://locahost:8888/>
* Now use the client.

[mpd]: http://mpd.wikia.com/wiki/Music_Player_Daemon_Wiki
[node.js]: http://nodejs.org/
[require.js]: http://github.com/jrburke/requirejs
[less.js]: http://github.com/cloudhead/less.js
[paperboy]: http://github.com/felixge/node-paperboy
[socket.io]: http://github.com/LearnBoost/Socket.IO
[socket.io-node]: http://github.com/LearnBoost/Socket.IO-node
[streamie]: http://github.com/cramforce/streamie
