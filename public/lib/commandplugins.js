/*
 * List of built in plugins for tweet processing
 *
 */

require.def("mpc/commandplugins",
  ["text!../templates/songinfo.ejs.html"],
  function(templateText) {
    var template = _.template(templateText);

    var mpd_version = "0.0.0";
    var lastState = "play";
    var lastXFade = 0;

    var changedPlaylist = false;

    var pauseSymbol = "=";
    var playSymbol = "▸";

    var PLAYTIME = {
          elapsed: 0,
          total_text: "",
          interval: null,
    }

    function strong(txt) {
      return "<strong>"+txt+"</strong>";
    }

    function statusUpdate(websocket) {
      websocket.send({'command': ['status', 'currentsong']});
    }

    function togglePlayPause(state) {
      var a = $(".playpause a");
      if(state == "play") {
        a.attr("href", "#pause");
        a.text(pauseSymbol);
        a.parent().addClass('pause');
      }
      else if(state == "pause") {
        a.attr("href", "#play");
        a.text(playSymbol);
        a.parent().removeClass('pause');
      }
      else {
        a.attr("href", "#play");
        a.text(playSymbol);
        a.parent().removeClass('pause');
      }
    }

    function formatState(state) {
      var txt;
      if(state == "play") {
        txt = "Playing:";
      }
      else if(state == "pause") {
        txt = "[Paused]";
      }
      else {
        txt = "[Stopped]";
      }
      return txt;
    }

    function formatDisplay(song) {
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

      return str;
    }

    function formatTime(t) {
      var time = '';
      var hours = (t / 60 / 60)|0;
      var mins  = (t / 60 % 60)|0;
      var secs  = (t % 60)|0;

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

      return time;
    }

    function formatSong(song) {
      return {
        'display': formatDisplay(song),
        'time': formatTime(song.Time),
        'pos': Number(song.Pos),
        'id': Number(song.Id)
      };
    }

    function showInfo(msg) {
      $("#info").hide().children().text(msg).parent().fadeIn().delay(2000).fadeOut();
    }

    var currentSongId;
    function setCurSong(pos) {
      $(".tweet .state").text("");

      if(currentSongId) {
        $(".pos"+currentSongId).removeClass("current");
        $(".pos"+currentSongId+" .state").text("");
        $(".pos"+pos).addClass("current");
        $(".current .state").text(formatState(lastState));
      }
      currentSongId = pos;
    }

    return {
      handleVersion: {
        match: "version",
        func: function handleVersion(data) {
          mpd_version = data;
        }
      },

      handleStatusUpdate: {
        match: "status,currentsong",
        func: function handleStatusUpdate(data) {
          setCurSong(data.Pos);
        }
      },

      handlePlaylist: {
        match: "playlistinfo",
        func: function handlePlaylist(data) {
          if(changedPlaylist) {
            changedPlaylist = false;
            $("#stream li.entry").remove();
          }
          var stream = $("#stream");
          _(data.songinfo).each(function(song) {
            var songi = formatSong(song);
            songi["current"] = currentSongId;
            songi["lastState"] = formatState(lastState);
            var html = template(songi);
            stream.append(html);
          });
        }
      },

      handleRepeat: {
        match: "status",
        func: function handleRepeat(data) {
          var a = $(".repeat a");
          if(data.repeat == 1) {
            a.parent().addClass("on");
            a.attr("href", "#repeat/0");
          } else {
            a.parent().removeClass("on");
            a.attr("href", "#repeat/1");
          }
        }
      },

      handleRandom: {
        match: "status",
        func: function handleRandom(data) {
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
      },

      handleCrossfade: {
        match: "status",
        func: function handleCrossfade(data) {
          if(lastXFade != Number(data.xfade)) {
            lastXFade = Number(data.xfade);
            if(data.xfade == "0") {
              $(".crossfade").removeClass("on");
              $(".crossfade a").attr('title', "Crossfade off");
              showInfo("Crossfade is off");
            } else {
              $(".crossfade").addClass("on");
              $(".crossfade a").attr('title', "Crossfade: "+data.xfade+"s");
              showInfo("Crossfade set to "+data.xfade+" seconds.");
            }
          }
        }
      },

      // idle invoked, gets send as "changed"
      handleChanged: {
        match: "idle",
        func: function handleChanged(data, websocket) {
          websocket.send({'command': 'idle'});

          if(data.changed == "playlist") {
            changedPlaylist = true;
            websocket.send({'command': 'playlistinfo'});
          }

          statusUpdate(websocket);
        }
      },

      handleStats: {
        match: "stats",
        func: function handleStats(data, websocket) {
          var uptime_full = data.uptime;
          var hour = (uptime_full / 60 / 60 % 60)|0;
          var min  = (uptime_full / 60 % 60)|0;
          var sec  = (uptime_full % 60)|0;
          var uptime = hour+"h, "+min+"min, "+sec+"s";

          var playtime = data.playtime;
          var cur_playtime = formatTime(playtime);

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
      },


      handleState: {
        match: "status",
        func: function handleState(data) {
          lastState = data.state;
          togglePlayPause(lastState);
          $(".current .state").text(formatState(lastState));
        }
      },

      handleTime: {
        match: "status",
        func: function handleTime(data) {
          var time = data.time.split(":");
          PLAYTIME.elapsed = time[0];
          var total        = time[1];

          var elapsed_text = formatTime(PLAYTIME.elapsed);
          PLAYTIME.total_text = formatTime(total);

          // Update playtime on client-side.
          if(PLAYTIME.timeInterval) {
            clearInterval(PLAYTIME.timeInterval);
          }
          if(data.state == "play") {
            PLAYTIME.timeInterval = setInterval(function(){
              PLAYTIME.elapsed++;
              var elapsed_text = formatTime(PLAYTIME.elapsed);

              $("#meta #playtime").text("["+elapsed_text + (total==0?'':(" / " + PLAYTIME.total_text))+"]");
            } , 999);
          }

          $("#meta #playtime").text("["+elapsed_text + (total==0?'':(" / " + PLAYTIME.total_text))+"]");
        }
      },

      handleVolume: {
        match: "status",
        func: function handleVolume(data) {
          $("#volume").text("Volume: "+data.volume+"%");
        }
      },
    }
  }
);
