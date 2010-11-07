/*
 * Main entry point for our app
 * "start" method gets called by require.js when the initial dependencies are loaded.
 * We always have require.js, jQuery and underscore.js everwhere
 */

// we really do not want to break if somebody leaves a console.log in the code
if(typeof console == "undefined") {
  var console = {
    log: function () {},
    error: function () {}
  }
}
require.def("mpc/app",
  ["mpc/client", "mpc/settings", "mpc/settingsDialog", "mpc/commandplugins", "text!../templates/songinfo.ejs.html", "http://ajax.googleapis.com/ajax/libs/jquery/1.4.2/jquery.min.js"],
  function(client, settings, settingsDialog, commandPlugin, templateText) {

    settings.registerNamespace("general", "General");
    settings.registerKey("general", "mpc-host", "The host where mpc runs.", "localhost");
    settings.registerKey("general", "mpc-port", "Port on which mpc runs.", 6600);

    settings.registerNamespace("auth", "Authorization");
    settings.registerKey("auth", "use-auth", "Use authorization?", false);
    settings.registerKey("auth", "user", "Username for login", "");
    settings.registerKey("auth", "password", "Password for login", "");

    var template = _.template(templateText);

    var pauseSymbol = "=";
    var playSymbol = "▸";

    var connectionCount = 0;

    var commandPlugins = [
      commandPlugin.handleVersion,
      commandPlugin.handleStatusUpdate,
      commandPlugin.handleState,
      commandPlugin.handleTime,
      commandPlugin.handleVolume,
      commandPlugin.handleCrossfade,
      commandPlugin.handlePlaylist,
      commandPlugin.handleRepeat,
      commandPlugin.handleRandom,
      commandPlugin.handleChanged,
      commandPlugin.handleStats,
      commandPlugin.handleSearch
    ];

    function showInfo(msg) {
      $("#info > p").text(msg).parent().fadeIn().delay(2000).fadeOut();
    }

    return {
      start: function () {
        settingsDialog.init.func();
        $(function () {
          location.hash = ""; // start fresh, we dont maintain any important state

          function websocketSend(msg) {
            socket.send(JSON.stringify(msg));
          }

          function strong(txt) {
            return "<strong>"+txt+"</strong>";
          }

          function statusUpdate(websocket) {
            websocketSend({'command': ['status', 'currentsong']});
          }

          var updateInterval;
          var mpd_version = '0';
          var currentSongId;
          var lastState = "play";

          $("#controls > .control").delegate("a", "click", function(e) {
            //e.preventDefault();
            var a = $(this);
            var action = a.attr('href').substr(1);
            if(action.indexOf('/') != -1) {
              action = _(action.split("/")).map(function(e){ return decodeURIComponent(e)}).join(" ");
            }
            //console.log("action is: "+action);
            if(a.parent().hasClass('crossfade')) {
              var xfade = prompt("Crossfade time: ");
              if(xfade) {
                if(isNaN(Number(xfade))) {
                  showInfo("Need number to set crossfade to.");
                } else {
                  websocketSend({'command': "crossfade "+xfade});
                }
              }
            } else if(action.indexOf("search") == 0) {
              var query = prompt("Search for: ");
              websocketSend({'command': 'search any "'+decodeURIComponent(query)+'"'});
            } else {
              websocketSend({'command': action});
            }
          });

          $("#stream").delegate("a", "click", function(e) {
            e.preventDefault();
            var a = $(this);
            var action = a.attr('href').substr(1);
            if(action.indexOf('/') != -1) {
              action = _(action.split("/")).map(function(e){ return decodeURIComponent(e)}).join(" ");
            }
            if(action.indexOf("add ") == 0) {
              a.parent().addClass("added");
            }
            websocketSend({'command': action});
          });

          $("#meta-left").delegate("a", "click", function(e) {
            e.preventDefault();
            var a = $(this);
            if(a.attr('id') == "totop") {
              window.scrollTo(0, 0);
            } else {
              window.scrollTo(0, $(".current").position().top-80);
            }
          });

          $(".error").bind('click', function(e) {
            $(this).hide();
          });
          $("#stats-info").bind('click', function(e) {
            $(this).hide();
          });

          $(".search").bind('click', function(e) {
            $(".searched").remove();
            if(!$(this).hasClass('active')) {
              $(this).addClass('active');
            }
          });

          $(".search-head span.close a").bind('click', function(e) {
            e.preventDefault();
            $(".search").removeClass('active');
            $(".searched").remove();
            $(".entry").show();
            $(".search-head").hide();
          });

          var socket;
          var connected = function(s) {
            socket = s;
          };

          var _websocketSend = function(msg) {
            socket.send(JSON.stringify(msg));
          };
          // connect to the backend system
          var connect = function(data) {
            data = JSON.parse(data); // data must always be JSON
            if(data == "hello world") {
              websocketSend({
                "mpd_host": "localhost",
                "mpd_port": 6600
              });
            }
            else if(data == "connected") {
              connectionCount++;
              console.log("we're connected");
              //updateInterval = setInterval(statusUpdate, 25000);
            }
            else if(data == "idle_connected") {
              connectionCount++;
              console.log("we're connected to the idle connection.");
            }
            else if(data == "OK") {
              statusUpdate();
            }
            else if(data.error) {
              // FIXME: error handler
              $(".error p").text(data.error).parent().show();
            }
            else {
              var key = Object.keys(data)[0];
              //console.log("Received `"+key+"'")
              var found = 0;
              commandPlugins.forEach(function (plugin) {
                if(key.indexOf(plugin.match) == 0) {
                  //console.log(plugin.func.name+" matches data");
                  found++;
                  plugin.func.call(function () {}, data[key], {send: _websocketSend}, plugin);
                }
              });

              //console.log("Found "+found+" plugins to handle '"+key+"'.");
              if(found == 0) {
                console.log(data);
                console.log("^ nothing to handle ^");
              }
            }

            if(connectionCount == 2) {
              $("#logo").append(" at "+"localhost:6600");
              connectionCount = 0;
              console.log("both sockets are succesfully connected. Start now!");

              statusUpdate();
              websocketSend({'command': "playlistinfo"});
              websocketSend({'command': 'idle'});
            }
          };
          client.connect(connect, connected);
        });
      }
    }
  }
);
