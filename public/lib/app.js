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
  ["mpc/client", "text!../templates/songinfo.ejs.html", "http://ajax.googleapis.com/ajax/libs/jquery/1.4.2/jquery.min.js"],
  function(client, templateText) {

    var template = _.template(templateText);

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

          function formatSong(song) {
            var str = ''
            if(song.Artist) {
              str += song.Artist
            }
            if(song.Title) {
              if(str.length > 0) {
                str += " - ";
              }
              str += song.Title;
            }
            if(str.length == 0) {
              if(song.Name) {
                str = song.Name;
              } else {
                str = song.file;
              }
            }

            var time = '';
            var hours = (song.Time / 60 / 60)|0;
            var mins  = (song.Time / 60 % 60)|0;
            var secs = (song.Time % 60)|0;

            if(hours == 0 && mins == 0 && secs == 0) {
              time = '';
            } else {
              if(hours > 0) {
                time += hours+':';
                if(mins < 10) time += "0";
              }
              time += mins+":";
              time += (secs < 10 ? "0" : '')+secs;
            }

            return {'display': str, 'time': time, 'pos': Number(song.Pos), 'id': Number(song.Id)};
          }

          function formatState(state) {
            var a = $(".playpause a");
            var txt;
            if(state == "play") {
              txt = "Playing:";
              a.attr("href", "#pause");
              a.text("=");
              a.parent().addClass('pause');
            }
            else if(state == "pause") {
              txt = "[Paused]";
              a.attr("href", "#play");
              a.text("▸");
              a.parent().removeClass('pause');
            }
            else {
              txt = "[Stopped]";
              a.attr("href", "#play");
              a.text("▸");
              a.parent().removeClass('pause');
            }
            return txt;
          }

          var updateInterval;
          var mpd_version = '0';
          var currentSongId;
          var lastState = "play";

          $("#controls").delegate("a", "click", function(e) {
            e.preventDefault();
            var a = $(this);
            var action = a.attr('href').substr(1);
            console.log("clicked: "+action);
            if(action.indexOf('/') != -1) {
              action = action.split("/").join(" ");
            }
            websocketSend({'command': action});
          });

          $("#stream").delegate("a", "click", function(e) {
            e.preventDefault();
            var a = $(this);
            var action = a.attr('href').substr(1);
            console.log("tweet.clicked: "+action);
            if(action.indexOf('/') != -1) {
              action = action.split("/").join(" ");
            }
            websocketSend({'command': action});
          });

          $(".error").bind('click', function(e) {
            $(this).hide();
          });
          $(".stats").bind('click', function(e) {
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
              websocketSend({'command': "playlistinfo"});
              //updateInterval = setInterval(statusUpdate, 25000);
            }
            else if(data == "idle_connected") {
              websocketSend({'command': 'idle'});
            }
            else if(data == "OK") {
              statusUpdate();
            }
            else if(data.error) {
              $(".error p").text(data.error).parent().show();
            }
            else if(data.version) {
              mpd_version = data.version;
            }
            // that's where the magic happens.
            else if(data.response) {
              data = data.response;

              if(data.songinfo) {
                var stream = $("#stream");
                _(data.songinfo).each(function(song) {
                  var songi = formatSong(song);
                  songi["current"] = currentSongId;
                  songi["lastState"] = formatState(lastState);
                  var html = template(songi);
                  stream.append(html);
                });
              }

              if(data.file) {
                $(".tweet .state").text("");

                if(currentSongId) {
                  $(".pos"+currentSongId).removeClass("current");
                  $(".pos"+currentSongId+" .state").text("");
                  $(".pos"+data.Pos).addClass("current");
                  $(".current .state").text(formatState(lastState));
                }
                currentSongId = data.Pos;
              }

              if(data.state) {
                lastState = data.state;
                $(".current .state").text(formatState(lastState));
              }

              if(data.random) {
                var a = $(".random a");
                if(data.random == 1) {
                  a.parent().removeClass("off");
                  a.parent().addClass("on");
                  a.attr("href", "#random/0");
                } else {
                  a.parent().removeClass("on");
                  a.parent().addClass("off");
                  a.attr("href", "#random/1");
                }
              }

              if(data.repeat) {
                var a = $(".repeat a");
                if(data.repeat == 1) {
                  a.parent().addClass("on");
                  a.attr("href", "#repeat/0");
                } else {
                  a.parent().removeClass("on");
                  a.attr("href", "#repeat/1");
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

                $("#meta #playtime").text("["+elapsed_text + (total==0?'':(" / " + total_text))+"]");
              }

              if(data.volume) {
                $("#volume").text("Volume: "+data.volume+"%");
              }

              // idle invoked
              if(data.changed) {
                websocketSend({'command': 'idle'});
                if(data.changed == "playlist") {
                  $("#stream li.entry").remove();
                  websocketSend({'command': 'playlistinfo'});
                }
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
                var cur_playtime = hour+":"+(min<10?"0":"")+min+":"+(sec<10?"0":"")+sec;

                var s = ''
                s += strong('Version: ') + mpd_version + "<br/>";
                s += strong('Uptime: ') + uptime + "<br/>";
                s += strong('Time playing: ') + cur_playtime + "<br/>";
                s += "<br/>";

                s += strong('Artist names: ') + data.artists + "<br/>";
                s += strong('Album names: ') + data.albums + "<br/>";
                s += strong('Songs in database: ') + data.songs;

                $(".stats .text").html(s);
                $(".stats").toggle();
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
        });
      }
    }
  }
);
