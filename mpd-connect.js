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

  function mpdSend(data) {
    mpd.write(data + "\n");
  };

  // We always send JSON
  function send(data) {
    client.send(JSON.stringify(data))
  }

  // If buffer is filled, handle the data and send the response.
  function handleData(data) {
    var songinfo = false;
    var dat = {};
    var lines = data.split("\n");

    // We got some songinfo (from 'playlistinfo' command or similar)
    if(lines[0].split(": ")[0] == "file") {
      songinfo = true;
      dat.songinfo = [];
    }

    lines.forEach(function(e) {
      if(e != "OK" && e != '') {
        d = e.split(": ");
        key = d[0];
        value = d[1];
        if(songinfo) {
          var l = dat.songinfo.length;
          if(key == "file") {
            // Be sure to send every 5 entries. Easier to handle then a load of data.
            if(l > 5) {
              send({'response': dat});
              dat.songinfo = [];
            }
            var dd = {};
            dd[key] = value;
            dat.songinfo.push(dd);
          }
          else {
            dat.songinfo[l-1][key] = value;
          }
        } else {
          dat[key] = value;
        }
      }
    });
    send({'response': dat});
  }

  client.on('message', function(msg){
    var data = JSON.parse(msg);

    if(data == "ping") {
      send("pong")
    }
    else if(data.mpd_host || data.mpd_port) {
      mpd = net.createConnection(data.mpd_port || 6600, data.mpd_host || 'localhost');
      mpd.addListener('connect', function() {
        console.log("Connected to mpd on "+(data.mpd_host||'localhost')+':'+(data.mpd_port||6600));
        send('connected');
      });

      mpd_idle = net.createConnection(data.mpd_port || 6600, data.mpd_host || 'localhost');
      mpd_idle.addListener('connect', function() {
        console.log("Second connection to mpd established (for 'idle' support)");
        send('idle_connected');
      });
      mpd_idle.addListener('data', function(data) {
        mpd.emit('data', [data]);
      });

      mpd.addListener('end', function(data) {
        if(client.writable) {
          send({'fatalError':'Connection to mpd closed'});
        }
      });
      mpd_idle.addListener('end', function(data) {
        if(client.writable) {
          send({'fatalError':'Connection to mpd closed'});
        }
      });

      var buffer = "";

      mpd.addListener('data', function(data) {
        data = data.toString('utf8');
        if(md = data.match(/^OK MPD (\d+\.\d+\.\d+)\n/)) {
          console.log("mpd returned version "+md[1]);
          send({'version': md[1] });
        }
        else {
          if(data.match(/ACK \[(\d+)@(\d+)\] {(.*)} (.+)/)) {
            console.log("error: "+data);
            send({'error': data});
          } else {
            if(buffer == "" && data == "OK\n") { // just received "OK\n" → everything is fine.
              send('OK');
            } else {
              var l = data.length;
              // received everything → start working.
              if(data.substr(l-3) == "OK\n") {
                buffer += data;
                handleData(buffer);
                buffer = "";
              } else {
                buffer += data;
              }
            }
          }
        }
      });
    }
    else if(data.command) {
      console.log("got command: "+data.command);
      if(data.command == "idle") { // special case because of second socket connection
        mpd_idle.write("idle\n");
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
