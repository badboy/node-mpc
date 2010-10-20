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
  ["mpc/client", "http://ajax.googleapis.com/ajax/libs/jquery/1.4.2/jquery.min.js"],
  function(client) {

    return {
      start: function () {
        $(function () {
          location.hash = ""; // start fresh, we dont maintain any important state

          function websocketSend(msg) {
            socket.send(JSON.stringify(msg));
          }

          function statusUpdate() {
            websocketSend({'command': ['status', 'currentsong']});
          }

          function strong(txt) {
            return "<strong>"+txt+"</strong>";
          }

          var updateInterval;
          var mpd_version = '0';

          $("#controls").delegate("a", "click", function(e) {
            e.preventDefault();
            var a = $(this);
            var action = a.attr('href').substr(1);
            if(action.indexOf('|') != -1) {
              action = action.split("|").join(" ");
            }
            websocketSend({'command': action});
          });

          $(".error").bind('click', function(e) {
            $(this).hide();
          });
          $("#stats").bind('click', function(e) {
            $(this).hide();
          });

          var socket;
          var connected = function(s) {
            socket = s;
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
              statusUpdate();
              updateInterval = setInterval(statusUpdate, 25000);
            }
            else if(data == "idle_connected") {
              websocketSend({'command': 'idle'});
            }
            else if(data == "OK") {
              console.log(data);
              statusUpdate();
            }
            else if(data.error) {
              $(".error p").text(data.error).parent().show();
              console.log(data.error);
            }
            else if(data.version) {
              mpd_version = data.version;
            }
            // that's where the magic happens.
            else if(data.response) {
              data = data.response;

              if(data.file) {
                var str = ''
                if(data.Artist) {
                  str += data.Artist
                }
                if(data.Title) {
                  str += " - "+data.Title;
                }
                if(str.length == 0 && data.Name) {
                  str = data.Name;
                }
                else {
                  str = data.file;
                }
                str = (Number(data.Pos)+1) + '. ' + str;
                $("#currentsong").text(str);
              }

              if(data.state) {
                if(data.state == "play") {
                  $("#state").text("Playing: ");
                }
                else if(data.state == "pause") {
                  $("#state").text("[Paused] ");
                }
                else {
                  $("#state").text("[Stopped] ");
                }
              }

              if(data.time) {
                var time = data.time.split(":");
                var elapsed = time[0];
                var total   = time[1];

                var mins = (elapsed / 60)|0;
                var secs = elapsed % 60;
                var t_mins = (total / 60)|0;
                var t_secs = total % 60;

                var elapsed_text = mins+":"+(secs<10?'0':'')+secs;
                var total_text   = t_mins+":"+(t_secs<10?'0':'')+t_secs;

                $("#time").text("[" + elapsed_text + (total==0?'':(" / " + total_text)) + "]");
              }

              if(data.volume) {
                $("#volume").text("Volume: "+data.volume+"%");
              }

              // idle invoked
              if(data.changed) {
                websocketSend({'command': 'idle'});
                statusUpdate();
              }

              // stats
              if(data.uptime) {
                var uptime_full = data.uptime;
                var hour = (uptime_full / 60 / 60 % 60)|0;
                var min  = (uptime_full / 60 % 60)|0;
                var sec  = (uptime_full % 60)|0;
                var uptime = hour+"h, "+min+"min, "+sec+"s";

                var playtime = data.playtime;
                hour = (playtime / 60 / 60 % 60)|0;
                min  = (playtime / 60 % 60)|0;
                sec  = (playtime % 60)|0;
                var cur_playtime = hour+":"+min+":"+sec;

                var s = ''
                s += strong('Version: ') + mpd_version + "<br/>";
                s += strong('Uptime: ') + uptime + "<br/>";
                s += strong('Time playing: ') + cur_playtime + "<br/>";
                s += "<br/>";

                s += strong('Artist names: ') + data.artists + "<br/>";
                s += strong('Album names: ') + data.albums + "<br/>";
                s += strong('Songs in databse: ') + data.songs + "<br/>";
                s += "<br/>";

                $("#stats").html(s).show();
              }
            }
            else {
              // dunno what to do here
              if(data != "pong") {
                console.log(data);
              }
            }
          };
          client.connect(connect, connected);
        })
      }
    }
  }
);
