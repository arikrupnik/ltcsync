/* timing_metadata.js: find start and end times for audio and video
 * files using LTC embedded in audio. */

const path = require("path");
const fs = require("fs");
const process = require("process");
const os = require("os");
const nb = require("./native_binary");
const ltc = require("./ltc");

const assert = require("assert");

/* runs ffprobe on file and returns {format, stream[]} */
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
  const filename = "../samples/counter24+ltc.mp4"
  ffprobe(path.join(__dirname, filename),
          (err, f) => {
            assert.equal(err, null);

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
                            eval(f.streams[0].duration)) < 0.001);
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

/* Generates an ltc.Dump for each channel in each audio stream in the
 * ffprobe object. */
function extract_ltc(ffprobe, callback) {
  const audio_streams = ffprobe.streams.filter(s => s.codec_type==="audio");
  if (audio_streams.length==0) {
    callback(null, []);
  } else {
    let audio_streams_to_process=0;
    let dumps = [];
    for (const stream of audio_streams) {
      const file_base=path.join(os.tmpdir(), path.basename(ffprobe.format.filename));
      for (let channel=0; channel<stream.channels; channel++) {
        audio_streams_to_process++;
        const wav_file=`${file_base}+${process.hrtime().join(".")}.${stream.index}.${channel}.wav`;
        const ffmpeg=nb.spawn(
          "ffmpeg", ["-hide_banner",
                     "-y",
                     "-loglevel", "error",
                     "-i", ffprobe.format.filename,
                     "-map", `0:${stream.index}`,
                     "-map_channel", `0.${stream.index}.${channel}`,
                     wav_file]);
        ffmpeg.stdout.on("data", function(chunk) {
          console.log(chunk.toString());
        });
        let e = "";
        ffmpeg.stderr.on("data", function(chunk) {
          e += chunk.toString();
        });
        ffmpeg.on("exit", function(code, signal) {
          if (code !=0) {
            callback(new Error(e), null);
          } else {
            ltc.dump(wav_file, (err, dump) => {
              if (err) {
                callback(err, null);
              } else {
                fs.unlinkSync(wav_file);
                dump.s = stream.index;
                dump.c = channel;
                dumps.push(dump);
                if (!--audio_streams_to_process) {
                  callback(null, dumps.sort(function(d0, d1) {
                    const s0 = ffprobe.streams[d0.s];
                    const s1 = ffprobe.streams[d1.s];
                    const q0 = d0.quality(s0.duration, s0.sample_rate);
                    const q1 = d1.quality(s1.duration, s1.sample_rate);
                    return q1 - q0;
                  }));
                }
              }
            });
          }
        });
      }
    }
  }
}

function $extract_ltc() {
  ffprobe(path.join(__dirname,
                    "../samples/counter24+ltc.mp4"),
          (err, f) => {
            assert.equal(err, null);
            extract_ltc(f, (e, dumps) => {
              assert(!e);

              assert.equal(dumps.length, 2);

              assert.equal(dumps[0].s, 1);
              assert.equal(dumps[0].c, 0);
              assert.equal(dumps[0].frames.length, 127);
              let stream0 = f.streams[dumps[0].s];
              assert.equal(dumps[0].quality(stream0.duration, stream0.sample_rate), 0.9922651415713483);

              assert.equal(dumps[1].s, 1);
              assert.equal(dumps[1].c, 1);
              assert.equal(dumps[1].frames.length, 0);
              let stream1 = f.streams[dumps[1].s];
              assert.equal(dumps[1].quality(stream1.duration, stream1.sample_rate), 0);
            });
          });
}


/* Temporal bounds of a file or a group of files. `start` and
 * `duration` are in seconds. */
function Bounds(start, duration) {
  this.start = start;
  this.duration = duration;
}
Bounds.prototype.overlap=function(bounds) {
  const b = [this, bounds].sort((b0, b1) => b0.start - b1.start);
  return (b[0].start + b[0].duration) >= b[1].start;
}
/* Returns a new object that is the union of the two. */
Bounds.prototype.union = function(bounds) {
  const b = [this, bounds].sort((b0, b1) => b0.start - b1.start);
  const e0 = b[0].start + b[0].duration;
  const e1 = b[1].start + b[1].duration;
  return new Bounds(b[0].start, Math.max(e0, e1)-b[0].start);
}
function $Bounds() {
  // b1 entirely inside b0
  assert          (new Bounds(1, 3).overlap(new Bounds(2, 1)));
  assert.deepEqual(new Bounds(1, 3).union  (new Bounds(2, 1)), new Bounds(1, 3));
  // b1 starts during b0, continues past its end
  assert          (new Bounds(1, 3).overlap(new Bounds(2, 3)));
  assert.deepEqual(new Bounds(1, 3).union  (new Bounds(2, 3)), new Bounds(1, 4));
  // b1 starts before b0, ends inside it
  assert          (new Bounds(1, 3).overlap(new Bounds(0, 2)));
  assert.deepEqual(new Bounds(1, 3).union  (new Bounds(0, 2)), new Bounds(0, 4));
  // b1 entirely contains b0
  assert          (new Bounds(1, 3).overlap(new Bounds(0, 5)));
  assert.deepEqual(new Bounds(1, 3).union  (new Bounds(0, 5)), new Bounds(0, 5));
  // b1 starts just as b0 ends
  assert          (new Bounds(1, 3).overlap(new Bounds(3, 1)));
  assert.deepEqual(new Bounds(1, 3).union  (new Bounds(3, 1)), new Bounds(1, 3));
  // b0 starts just as b1 ends
  assert          (new Bounds(1, 3).overlap(new Bounds(0, 1)));
  assert.deepEqual(new Bounds(1, 3).union  (new Bounds(0, 1)), new Bounds(0, 4));
  // b1 entirely after b0
  assert        (!(new Bounds(1, 1).overlap(new Bounds(3, 1))));
  assert.deepEqual(new Bounds(1, 1).union  (new Bounds(3, 1)), new Bounds(1, 3));
  // b1 entirely before b0
  assert        (!(new Bounds(3, 1).overlap(new Bounds(1, 1))));
  assert.deepEqual(new Bounds(3, 1).union  (new Bounds(1, 1)), new Bounds(1, 3));

  // if a recording goes over midnight, it can still overlap
  //assert(new Bounds(23*60*60, 2*60*60).overlap(new Bounds( 1, 1)));
  assert(!(new Bounds(23*60*60, 2*60*60).overlap(new Bounds(2*60*60+1, 1))));
}


/* MediaFile is the basic building block of `libSync`. A `MediaFile`
 * represents metadata about an audio or video file. It contains a
 * combination of ffprobe(1) data and LTC timing information.

 * `ffprobe` is the verbatim output of ffprobe(1)
 * `ltc` is an array of LTC dumps, one per channel in each audio
 * stream, to which MediaFile adds two pieces of information: the
 * index of the audio stream from which the frames came, and the
 * channel number within the stream. */
function MediaFile(ffprobe, ltc) {
  this.ffprobe = ffprobe;
  this.ltc = ltc;
  // Some audio recorders, e.g. ZOOM, write different tracks of a
  // recording to different files in a directory. While only one of
  // these files might have LTC in it, all files from the session
  // align temporally. In these cases, the non-ltc files can set this
  // value as a pointer to the file that does contain LTC. See also
  // MediaFile.from_same_recording_session()
  this.ltc_file = null;
}

MediaFile.prototype.ltc_quality = function() {
  if (!this.ltc || !this.ltc.length) {
    return 0;
  }
  const best_ltc = this.ltc[0];
  const stream = this.ffprobe.streams[best_ltc.s];
  return best_ltc.quality(stream.duration, stream.sample_rate);
}

MediaFile.prototype.has_ltc = function() {
  return this.ltc_quality() > 0.75;
}

/* Main entry point into this module. Callback argument is a MediaFile
 * object containing metadata about the argument audio or video
 * file. */
function probe_file(filename, callback) {
  ffprobe(filename,
          (err, ffprobe) => {
            if (err) {
              callback(err, null);
            } else {
              extract_ltc(ffprobe, (err, dumps) => {
                if (err) {
                  callback(err, null)
                } else {
                  callback(null, new MediaFile(ffprobe, dumps));
                }
              });
            }
          });
}

function $probe_file() {
  probe_file(path.join(__dirname, "../samples/counter24+ltc.mp4"),
             (err, media_file) => {
               assert.equal(err, null);
               assert.equal(media_file.ltc.length, 2);
               assert.equal(media_file.ltc_quality(), 0.9922651415713483);
               assert(media_file.has_ltc());
             });
  probe_file(path.join(__dirname, "../samples/ZOOM0004_Tr1.WAV"),
             (err, media_file) => {
               assert.equal(err, null);
               assert.equal(media_file.ltc.length, 1);
               assert.equal(media_file.ltc_quality(), 0.9973724496862045);
               assert(media_file.has_ltc());
             });
  probe_file(path.join(__dirname, "../samples/ZOOM0004_Tr2.WAV"),
             (err, media_file) => {
               assert.equal(err, null);
               assert.equal(media_file.ltc.length, 1);
               assert.equal(media_file.ltc_quality(), 0.003213453898935812);
               assert(!media_file.has_ltc());
             });
}

MediaFile.prototype.wc_start = function() {
  if (!this.has_ltc()) {
    return null;
  } else {
    // .start_time appears only for containers that support arbitrary
    // offsets; in other cases it is 0 by definition
    const stream = this.ffprobe.streams[this.ltc[0].s];
    const stream_offset = stream.start_time || 0;
    return this.ltc[0].wc_start(stream.sample_rate) - stream_offset;
  }
}
function $MediaFile$wc_start() {
  const probe = {
    streams: [{sample_rate: 48000,
               start_time: 10,             // this stream starts 10 seconds into the file
               duration: 2000 * 3 /48000}] // this stream is three frames long (for quality=1.0)
  };
  const dump = new ltc.Dump("00000000   00:59:59:23 |    46000    47999  \n" +
                            // this frame's wall clock is 1am
                            // and it starts 1 second into the audio stream
                            "00000000   01:00:00:00 |    48000    49999  \n" +
                            "00000000   01:00:00:01 |    50000    51999  \n");
  dump.s = 0;
  assert.equal(new MediaFile(probe, [dump]).wc_start(), 3600-10-1);

  probe_file(path.join(__dirname, "../samples/LTC_00_58_00_00__1mins_25.wav"),
              (err, media_file) => {
                assert.equal(err, null);
                assert.equal(media_file.wc_start(), 58*60)
              });

  probe_file(path.join(__dirname, "../samples/ZOOM0004_Tr1.WAV"),
             (err, media_file) => {
               assert.equal(err, null);
               assert.equal(media_file.wc_start(), 66857.09902083334)
             });
}

MediaFile.prototype.bounds = function() {
  let wc_start = this.wc_start();
  if (wc_start===null && this.ltc_file) {
    wc_start = this.ltc_file.wc_start();
  }
  return new Bounds(wc_start,
                    eval(this.ffprobe.format.duration));
}
function $MediaFile$bounds() {
  const ltc_file = new MediaFile({format: {duration: 2}}, "fake LTC");
  ltc_file.wc_start = function() {return 1};
  assert.deepEqual(ltc_file.bounds(), new Bounds(1, 2));
  const non_ltc_file = new MediaFile({format: {duration: 2}}, []);
  assert.deepEqual(non_ltc_file.bounds(), new Bounds(null, 2));
  // if the files are from the same recording session:
  non_ltc_file.ltc_file = ltc_file;
  assert.deepEqual(non_ltc_file.bounds(), new Bounds(1, 2));

  probe_file(path.join(__dirname, "../samples/counter24+ltc.mp4"),
             (err, media_file) => {
               assert.equal(err, null);
               assert.deepEqual(media_file.bounds(), new Bounds(17373.495791666668, 5.355));
             });
  probe_file(path.join(__dirname, "../samples/ZOOM0004_Tr1.WAV"),
             (err, media_file) => {
               assert.equal(err, null);
               assert.deepEqual(media_file.bounds(), new Bounds(66857.09902083334, 13.201333));
             });
  probe_file(path.join(__dirname, "../samples/ZOOM0004_Tr2.WAV"),
             (err, media_file) => {
               assert.equal(err, null);
               assert.deepEqual(media_file.bounds(), new Bounds(null, 13.201333));
             });
}

MediaFile.prototype.from_same_recording_session = function(media_file) {
  const ff0 = this.ffprobe;
  const ff1 = media_file.ffprobe;
  // there must be a more elegant way to express this invariant
  return ff0.streams.length==1 && ff1.streams.length==1 &&
    ff0.streams[0].codec_type==="audio" && ff1.streams[0].codec_type=="audio" &&
    ff0.streams[0].duration_ts &&
    ff0.streams[0].duration_ts===ff1.streams[0].duration_ts;
}
function $MediaFile$from_same_recording_session() {
  probe_file(path.join(__dirname, "../samples/ZOOM0004_LR.WAV"), (err, z_lr) => {
    assert.equal(err, null);
    probe_file(path.join(__dirname, "../samples/ZOOM0004_Tr1.WAV"), (err, z_tr1) => {
      assert.equal(err, null);
      probe_file(path.join(__dirname, "../samples//ZOOM0004_Tr2.WAV"), (err, z_tr2) => {
        assert.equal(err, null);
        probe_file(path.join(__dirname, "../samples/ltc.wav"), (err, ltc) => {
          assert.equal(err, null);
          assert(z_lr.from_same_recording_session(z_tr1));
          assert(z_lr.from_same_recording_session(z_tr2));
          assert(z_tr1.from_same_recording_session(z_tr2));
          assert(!z_lr.from_same_recording_session(ltc));
          assert(!z_tr1.from_same_recording_session(ltc));
          assert(!z_tr2.from_same_recording_session(ltc));
        });
      });
    });
  });
}

/* Helps sort MediaFiles repeatably for display */
MediaFile.prototype.compare = function(file) {
  const start_diff = this.bounds().start - file.bounds().start;
  if (start_diff) {
    return start_diff;
  } else {
    return this.ffprobe.format.filename.localeCompare(file.ffprobe.format.filename);
  }
}
function $MediaFile$compare() {
  function MFstub(name, start_time) {
    MediaFile.call(this, {format: {filename: name, duration: 10}}, []);
    this.wc_start = () => start_time;
  }
  MFstub.prototype = Object.create(MediaFile.prototype);

  assert(new MFstub("a", 1).compare(new MFstub("a", 1)) == 0);
  assert(new MFstub("a", 1).compare(new MFstub("a", 2)) < 0);
  assert(new MFstub("a", 2).compare(new MFstub("a", 1)) > 0);
  assert(new MFstub("a", 1).compare(new MFstub("b", 1)) < 0);
  assert(new MFstub("b", 1).compare(new MFstub("a", 1)) > 0);
  assert(new MFstub("b", 1).compare(new MFstub("a", 1)) > 0);

  assert(new MFstub("b", null).compare(new MFstub("a", null)) > 0);
  assert(new MFstub("a", null).compare(new MFstub("b", null)) < 0);
}


if (require.main === module) {
  $ffprobe();
  $extract_ltc();
  $Bounds();
  $probe_file();
  $MediaFile$wc_start();
  $MediaFile$bounds();
  $MediaFile$from_same_recording_session();
  $MediaFile$compare();
} else {
  module.exports.Bounds = Bounds;
  module.exports.MediaFile = MediaFile;
  module.exports.probe_file = probe_file;
}
