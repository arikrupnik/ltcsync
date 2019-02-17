/* ffprobe.js: extract metadata from files using ffprobe(1). */

const path = require("path");
const nb = require("./native_binary");

const assert = require('assert');


/* runs ffprobe on file and returns {format, [stream]} */
function ffprobe(fullpath, callback) {
  let output="";
  const ffprobe=nb.spawn(
    "ffprobe", ["-hide_banner",
                "-loglevel", "fatal",
                "-show_error", "-show_format", "-show_streams",
                "-print_format", "json",
                fullpath]);
  ffprobe.stdout.on("data", function(chunk) {
    output+=chunk;
  });
  ffprobe.on("close", function(code, signal) {
    const json=JSON.parse(output);
    if (json.error) {
      callback(new Error(json.error.string), null);
    } else {
      callback(null, json);
    }
  });
}

function $ffprobe() {
  ffprobe("/non-file/",
          (err, f) => {
            assert(["No such file or directory", "Invalid argument"].indexOf(err.message) >= 0);
          });
  const filename = "../../samples/counter24+ltc.mp4"
  ffprobe(path.join(__dirname, filename),
          (err, f) => {
            assert(!err);

            assert.equal(f.format.filename,
                         path.resolve(__dirname, filename));
            assert.equal(f.format.format_name, "mov,mp4,m4a,3gp,3g2,mj2");
            assert.equal(f.format.format_long_name, "QuickTime / MOV");
            assert.equal(f.format.start_time, "0.000000");
            assert.equal(f.format.duration, "5.355000");
            assert.equal(f.streams.length, 2);
            
            assert.equal(f.streams[0].codec_type, "video");
            assert.equal(f.streams[0].codec_name, "h264");
            assert.equal(f.streams[0].codec_long_name,
                         "H.264 / AVC / MPEG-4 AVC / MPEG-4 part 10");
            assert.equal(f.streams[0].r_frame_rate, "24/1");
            assert.equal(f.streams[0].avg_frame_rate, "24/1");
            assert.equal(f.streams[0].time_base, "1/12288");
            assert.equal(f.streams[0].start_pts, 0);
            assert.equal(f.streams[0].start_time, "0.000000");
            //assert.equal(f.streams[0].duration_ts, 65544);   // sic in 4.0.2
            //assert.equal(f.streams[0].duration, "5.333984"); // sic in 4.0.2
            assert.equal(f.streams[0].duration_ts, 65536);     // sic in 4.1.1
            assert.equal(f.streams[0].duration, "5.333333");   // sic in 4.1.1
            assert.equal(f.streams[0].nb_frames, "128");
            assert(Math.abs(eval(f.streams[0].time_base) *
                            eval(f.streams[0].duration_ts) -
                            eval(f.streams[0].duration)) < 0.0001);
            assert(Math.abs(eval(f.streams[0].nb_frames) /
                            eval(f.streams[0].r_frame_rate) -
                            eval(f.streams[0].duration)) < 0.001);

            assert.equal(f.streams[1].codec_type, "audio");
            assert.equal(f.streams[1].codec_name, "aac");
            assert.equal(f.streams[1].codec_long_name,
                         "AAC (Advanced Audio Coding)");
            assert.equal(f.streams[1].sample_rate, "48000");
            assert.equal(f.streams[1].channels, 2);
            assert.equal(f.streams[1].r_frame_rate, "0/0");
            assert.equal(f.streams[1].avg_frame_rate, "0/0");
            assert.equal(f.streams[1].time_base, "1/48000");
            assert.equal(f.streams[1].start_pts, 0);
            assert.equal(f.streams[1].start_time, "0.000000");
            assert.equal(f.streams[1].duration_ts, 255984);
            assert.equal(f.streams[1].duration, "5.333000");
            assert.equal(f.streams[1].nb_frames, "251");
            assert(Math.abs(eval(f.streams[1].time_base) *
                            eval(f.streams[1].duration_ts) -
                            eval(f.streams[1].duration)) < 0.0001);
          });
}


if (require.main === module) {
  $ffprobe();
} else {
  module.exports.ffprobe = ffprobe;
}
