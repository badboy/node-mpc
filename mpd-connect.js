var sys   = require('sys');
var net   = require('net');
var http  = require('http');
var fs    = require('fs');
var puts  = sys.puts;
var print = sys.print;

var io       = require('socket.io');
var paperboy = require('paperboy');

var utils     = require('./utils'),
    listeners = utils.listeners;

var public_root = fs.realpathSync("public");
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

server.listen(8888);
console.log('node-mpc HTTP daemon running on port 8888 on localhost');

var socket = io.listen(server);

socket.on('connection', function(client) {
  console.log("Connection");

  var mpd, mpd_idle;

  function mpdSend(data) {
    mpd.write(data + "\n");
  };

  // We always send JSON
  function send(data) {
    client.send(JSON.stringify(data))
  }

  var subscription;

  client.on('message', function(msg){
    var data = JSON.parse(msg);

    if(data == "ping") {
      send("pong")
    }
    else if(data.mpd_host || data.mpd_port) {
      mpd = net.createConnection(data.mpd_port || 6600, data.mpd_host || 'localhost');
      mpd.addListener('connect', function() {
        puts("connected to mpd");
        send('connected');
      });

      mpd_idle = net.createConnection(data.mpd_port || 6600, data.mpd_host || 'localhost');
      mpd_idle.addListener('connect', function() {
        puts("connected to mpd for idle");
        send('idle_connected');
      });
      mpd_idle.addListener('data', function(data) {
        mpd.emit('data', [data]);
      });

      mpd.addListener('end', function(data) {
        mpd_idle.end();
        send({'fatalError':'Connection to mpd closed'});
      });
      mpd_idle.addListener('end', function(data) {
        mpd.end();
        send({'fatalError':'Connection to mpd closed'});
      });

      mpd.addListener('data', function(data) {
        data = data.toString('utf8');
        if(data.match(/OK MPD (\d+\.\d+\.\d+)/)) {
          console.log("mpd returned version "+RegExp.$1);
          send({'version': RegExp.$1 });
        }
        else {
          if(data.match(/ACK \[(\d+)@(\d+)\] {(.*)} (.+)/)) {
            console.log("error: "+data);
            send({'error': data});
          } else {
            dat = {};
            if(data == "OK\n") {
              send('OK');
            } else {
              lines = data.split("\n");
              lines.forEach(function(e) {
                if(e != "OK" && e != '') {
                  d = e.split(": ");
                  key = d[0];
                  value = d[1];
                  dat[key] = value;
                }
              });
              send({'response': dat});
            }
          }
        }
      });
    }
    else if(data.command) {
      console.log("got command: "+data.command);
      if(data.command == "idle") {
        mpd_idle.write("idle\n");
      }
      else if(typeof data.command == 'object') {
        var d = "command_list_begin\n"+
                data.command.join("\n") +
                "\ncommand_list_end";
        mpdSend(d);
      } else {
        mpdSend(data.command);
      }
    }
  });

  client.send(JSON.stringify("hello world"));

  client.on('disconnect', function(){
    mpd.end();
    mpd_idle.end();
    console.log("Disconnect");
  });
});
