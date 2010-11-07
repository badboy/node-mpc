var net   = require('net');
var http  = require('http');
var fs    = require('fs');

var io       = require('socket.io');
var paperboy = require('paperboy');

var port = process.argv[2] || 8888;
var host = process.argv[3] || "localhost";

var public_root = fs.realpathSync("public"); // just one thing to wait for.
var server = http.createServer(function (request, response) {
  function respondError(error) {
    console.log(error);
    response.writeHead(501, {
      'Content-Type': 'text/plain'
    });
    response.end(error);
  };

  var url = require('url').parse(request.url, true);
  console.log("Request "+url.pathname);

  // We've got nothing to do for now, just respond with files.
  paperboy
    .deliver(public_root, request, response)
    .addHeader('Date', (new Date()).toUTCString())
    .error(function(statCode, msg) {
      response.writeHead(statCode, {'Content-Type': 'text/plain'});
      response.write("Error: " + statCode + ': ' + msg);
      response.close();
    })
    .otherwise(function(err) {
      var statCode = 404;
      response.writeHead(statCode, {'Content-Type': 'text/plain'});
      response.end('not found');
    });
});

server.listen(port, host);
console.log('node-mpc HTTP daemon running on '+host+':'+port);

var socket = io.listen(server);

socket.on('connection', function(client) {
  console.log("Connection from "+client.sessionId);

  var mpd, mpd_idle;
  var lastCommand = [];
  var lastArguments = [];

  function mpdSend(data, idle) {
    if(idle)
      mpd_idle.write(data + "\n");
    else
      mpd.write(data + "\n");
  };

  // We always send JSON
  function send(data) {
    //console.log(data);
    client.send(JSON.stringify(data))
  }

  // If buffer is filled, handle the data and send the response.
  function handleData(data, fromIdle) {
    var songinfo = false;
    var dat = {};

    var command;
    var args;
    if(fromIdle) {
      command = "idle";
    } else {
      command = lastCommand.shift();
      args = lastArguments.shift();
    }

    // We got some songinfo (from 'playlistinfo' command or similar)
    var songInfoCommands = [ "playlistinfo", "search" ];
    if(songInfoCommands.indexOf(command) != -1) {
      songinfo = true;
      dat.songinfo = [];
    }

    var lines = data.split("\n");
    lines.forEach(function(e) {
      if(e != "OK" && e != '') {
        d = e.split(": ");
        key = d[0];
        value = d[1];
        if(songinfo) {
          var l = dat.songinfo.length || 1;
          if(key == "file") {
            // Be sure to send every 6 entries. Easier to handle then a load of data.
            // TODO: test this against a playlist of 2000 or more entries.
            if(l > 5) {
              var d = {};
              d[command] = dat;
              d[command]._arguments = args;
              send(d);
              dat.songinfo = [];
            }
            dat.songinfo.push({file: value});

          } else {
            dat.songinfo[l-1][key] = value;
          }
        } else {
          dat[key] = value;
        }
      }
    });
    var d = {};
    d[command] = dat;
    d[command]._arguments = args;
    send(d);
  }

  var buffer = "";
  function parseData(data, fromIdle) {
    if(md = data.match(/^OK MPD (\d+\.\d+\.\d+)\n/)) {
      console.log("mpd returned version "+md[1]);
      send({'version': md[1] });
    }
    else {
      // ACK [5@0] {} unknown command "command"
      if(data.match(/ACK \[(\d+)@(\d+)\] {(.*)} (.+)/)) {
        console.log("error: "+data);
        send({'error': data});
        lastCommand.shift();
      } else {
        if(buffer == "" && data == "OK\n") { // just received "OK\n" → everything is fine.
          var d = {};
          d[lastCommand.shift()] = "OK";
          send(d);
        } else {
          var ind;

          // because we're sending a load of commands to mpd,
          // it may occur that we receive just text without any "OK" on one run
          // next time even 2 ore more "OK"s might be in the data string.
          //
          // So we split at every "OK\n" and handle them separately.
          while((ind = data.indexOf("OK\n")) > -1) {
            var d = data.substr(0, ind);
            data = data.substr(ind+3);
            buffer += d;
            handleData(buffer, fromIdle);
            buffer = "";
          }
          if(data.length > 0) {
            buffer += data;
          }
        }
      }
    }
  }

  client.on('message', function(msg){
    var data = JSON.parse(msg);

    if(data == "ping") {
      send("pong")
    }
    else if(data.mpd_host || data.mpd_port) {
      mpd = net.createConnection(data.mpd_port || 6600, data.mpd_host || 'localhost');
      mpd.on('connect', function() {
        console.log("Connected to mpd on "+(data.mpd_host||'localhost')+':'+(data.mpd_port||6600));
        send('connected');
      });

      mpd_idle = net.createConnection(data.mpd_port || 6600, data.mpd_host || 'localhost');
      mpd_idle.on('connect', function() {
        console.log("Second connection to mpd established (for 'idle' support)");
        send('idle_connected');
      });
      mpd_idle.on('data', function(data) {
        data = data.toString('utf8');
        //console.log("got data from idle:");
        //console.log(data);
        parseData(data, true);
      });

      mpd.on('end', function(data) {
        if(client.writable) {
          send({'fatalError':'Connection to mpd closed'});
        }
      });
      mpd_idle.on('end', function(data) {
        if(client.writable) {
          send({'fatalError':'Connection to mpd closed'});
        }
      });


      mpd.on('data', function(data) {
        data = data.toString('utf8');

        parseData(data);
      });
    }
    // Client sent a command, proxy it!
    else if(data.command) {
      var commandSplitted = data.command.toString().split(" ");

      // idle goes straight to the second socket
      // and does not return immediate.
      if(data.command != "idle") {
        lastCommand.push(commandSplitted[0]);
        if(commandSplitted.length > 1)
          lastArguments.push(commandSplitted.slice(1));
        else
          lastArguments.push([]);
      }

      // special case because of second socket connection
      if(data.command == "idle") {
        mpdSend("idle", true);
      }
      else if(typeof data.command == 'object') { // got an array here → send command_list
        var d = "command_list_begin\n"+
                data.command.join("\n") +
                "\ncommand_list_end";
        mpdSend(d);
      } else {
        mpdSend(data.command);
      }
    }
  });

  // welcome new clients.
  client.send(JSON.stringify("hello world"));

  // if the client disconnects,
  // there's no one left to control mpd.
  client.on('disconnect', function(){
    mpd.end();
    mpd_idle.end();
    console.log("Disconnect");
  });
});
