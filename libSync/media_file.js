/* timing_metadata.js: find start and end times for audio and video
 * files using LTC embedded in audio. */

const path = require("path");
const fs = require("fs");
const process = require("process");
const os = require("os");
const nb = require("./native_binary");
const ltc = require("./ltc");

const assert = require("assert");


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
 * combination of ffprobe(1) data and LTC timing information. For LTC,
 * result includes only file start time. Upcoming versions my include
 * additional information, such as quality of LTC signal, framerate,
 * etc. `ltc.start_time` is the start time of the entire file. This
 * value may be different from the value in the first LTC frame of the
 * file if the file starts in the middle of a frame, or if the stream
 * has a non-zero offset from the start of the container. */
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
MediaFile.prototype.bounds = function() {
  let start_time = null;
  if (this.ltc) {
    start_time = this.ltc.start_time;
  } else if (this.ltc_file) {
    start_time = this.ltc_file.ltc.start_time;
  }
  return new Bounds(start_time,
                    eval(this.ffprobe.format.duration));
}
function $MediaFile$bounds() {
  const ltc_file = new MediaFile({format: {duration: 2}}, {start_time: 1});
  assert.deepEqual(ltc_file.bounds(), new Bounds(1, 2));
  const non_ltc_file = new MediaFile({format: {duration: 2}}, null);
  assert.deepEqual(non_ltc_file.bounds(), new Bounds(null, 2));
  // if the files are from the same recording session:
  non_ltc_file.ltc_file = ltc_file;
  assert.deepEqual(non_ltc_file.bounds(), new Bounds(1, 2));
}
MediaFile.prototype.from_same_recording_session = function(file) {
  const ff0 = this.ffprobe;
  const ff1 = file.ffprobe;
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
MediaFile.prototype.compare = function(file) {
  const start_diff = this.bounds().start - file.bounds().start;
  if (start_diff) {
    return start_diff;
  } else {
    return this.ffprobe.format.filename.localeCompare(file.ffprobe.format.filename);
  }
}
function $MediaFile$compare() {
  assert(new MediaFile({format: {filename: "a"}}, {start_time: 1}).compare(
    new MediaFile({format: {filename: "a"}}, {start_time: 1})) == 0);
  assert(new MediaFile({format: {filename: "a"}}, {start_time: 1}).compare(
    new MediaFile({format: {filename: "a"}}, {start_time: 2})) < 0);
  assert(new MediaFile({format: {filename: "a"}}, {start_time: 2}).compare(
    new MediaFile({format: {filename: "a"}}, {start_time: 1})) > 0);
  assert(new MediaFile({format: {filename: "a"}}, {start_time: 1}).compare(
    new MediaFile({format: {filename: "b"}}, {start_time: 1})) < 0);
  assert(new MediaFile({format: {filename: "b"}}, {start_time: 1}).compare(
    new MediaFile({format: {filename: "a"}}, {start_time: 1})) > 0);
}

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


/* Generates an ltc_frames[] array for each audio stream in the
 * ffprobe object. The number of elements in this array corresponds to
 * number of channels in the stream (e.g., 1 for mono, 2 for
 * stereo). Each element is an array of ltc_frame objects as reported
 * by ltcdump. */
function extract_ltc(ffprobe, callback) {
  const audio_streams = ffprobe.streams.filter(s => s.codec_type==="audio");
  if (audio_streams.length==0) {
    callback(null, ffprobe, []);
  } else {
    let audio_streams_to_process=0;
    let framesets = [];
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
        ffmpeg.stderr.on("data", function(chunk) {
          console.log(chunk.toString());
        });
        ffmpeg.on("exit", function(code, signal) {
          // if code!=0...
          ltc.ltcdump(wav_file, (err, frames) => {
            fs.unlinkSync(wav_file);
            if (!framesets[stream.index]) {
              framesets[stream.index]=[];
            }
            framesets[stream.index][channel]=frames
            if (!--audio_streams_to_process) {
              callback(null, ffprobe, framesets)
            }
          });
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
            extract_ltc(f, (e, f, framesets) => {
              assert(!e);
              f.streams.filter(
                s => s.codec_type==="audio").forEach(
                  s => assert.equal(
                    framesets[s.index].length,
                    s.channels));
              assert.equal(framesets[1][0].length, 127);
              assert.equal(framesets[1][1].length, 0);
            });
          });

  // this file has no audio streams
  /*ffprobe(path.join(__dirname,
                    // missing file
                    "../samples/A001_C037_12121V.mov"),
          (err, f) => {
            assert.equal(err, null);
            extract_ltc(f, (e, f, framesets) => {
              assert(!e);
              assert.equal(framesets.length, 0);
            });
          });*/
}

/* select best LTC frame set */
function choose_ltc(ffprobe, framesets) {
  const result = {stream: null, frames: null};
  for (let s of ffprobe.streams) {
    if (s.codec_type==="audio") {
      for (let ch=0, frames=framesets[s.index][ch]; ch<s.channels; ch++) {
        if ((frames.length > 2) &&  // minimum guarantee of LTC quality
            (!result.frames ||
             (frames.length > result.frames.length))) {
          result.stream = s;
          result.frames = frames;
        }
      }
    }
  }
  return result;
}

function $choose_ltc() {
  ffprobe(path.join(__dirname,
                    "../samples/counter24+ltc.mp4"),
          (err, f) => {
            extract_ltc(f, (e, f, framesets) => {
              assert.equal(choose_ltc(f, framesets).frames.length, 127);
            })
          });
  ffprobe(path.join(__dirname,
                    "../samples/ZOOM0004_Tr1.WAV"),
          (err, f) => {
            extract_ltc(f, (e, f, framesets) => {
              assert.equal(choose_ltc(f, framesets).frames.length, 316);
            })
          });
  ffprobe(path.join(__dirname,
                    "../samples/ZOOM0004_LR.WAV"),
          (err, f) => {
            extract_ltc(f, (e, f, framesets) => {
              assert.equal(choose_ltc(f, framesets).frames, null);
            })
          });
  ffprobe(path.join(__dirname,
                    "../samples/ZOOM0004_Tr2.WAV"),
          (err, f) => {
            extract_ltc(f, (e, f, framesets) => {
              assert.equal(choose_ltc(f, framesets).frames, null);
            })
          });
  /*ffprobe(path.join(__dirname,
                    // missing file
                    "../samples/A001_C037_12121V.mov"),
          (err, f) => {
            extract_ltc(f, (e, f, framesets) => {
              assert.equal(choose_ltc(f, framesets).frames, null);
            })
          });*/
}

function container_start_time(ffstream, ltc_frames) {
  const keyframe = ltc_frames[1]; // first frame is sometimes an unreliable edge case
  // seconds from beginning of file (not just stream) to the first
  // sample of the key LTC frame
  const seconds_to_keyframe =
        keyframe.samples[0] / ffstream.sample_rate +
        (eval(ffstream.start_time) || 0);
  // .start_time appears only for containers that support arbitrary
  // offsets; in other cases it is 0 by definition
  const seconds_at_keyframe = ltc.seconds(keyframe,
                                          ltc.framerate(ltc_frames,
                                                        ffstream.sample_rate));
  return seconds_at_keyframe - seconds_to_keyframe;
}

function $container_start_time() {
  const ffstream = {
    start_time: 10,             // this stream starts 10 seconds into the file
    sample_rate: 48000,
  };
  const ltc_frames = [null, {
    seconds: 3600,  frames: 0,  // this frame has TC 01:00:00:00
    dropframe: false,
    samples: [48000, 49999]},   // this frame starts 1 second into the audio stream
                      null];
  assert.equal(container_start_time(ffstream, ltc_frames), 3600-10-1);
  ffprobe(path.join(__dirname,
                    "../samples/counter24+ltc.mp4"),
          (err, ffprobe) => {
            extract_ltc(ffprobe, (err, ffprobe, framesets) => {
              let {stream, frames} = choose_ltc(ffprobe, framesets);
              assert.equal(
                container_start_time(stream, frames),
                17373.495791666668)
            });
          });
  ffprobe(path.join(__dirname,
                            "../samples/ZOOM0004_Tr1.WAV"),
          (err, ffprobe) => {
            extract_ltc(ffprobe, (err, ffprobe, framesets) => {
              let {stream, frames} = choose_ltc(ffprobe, framesets);
              assert.equal(
                container_start_time(stream, frames),
                66857.09902083334)
            });
          });
}

/* Main entry point into this module. Callback argument is a MediaFile
 * object containing metadata about the argument audio or video
 * file. */
function probe_file(filename, callback) {
  ffprobe(filename,
          (err, ffprobe) => {
            if (err) {
              callback(err, null)
            } else {
              extract_ltc(ffprobe, (err, ffprobe, framesets) => {
                if (err) {
                  callback(err, null)
                } else {
                  let {stream, frames} = choose_ltc(ffprobe, framesets);
                  let ltc = null;
                  if (frames) {
                    ltc = {
                      start_time: container_start_time(stream, frames),
                    }
                  }
                  callback(null, new MediaFile(ffprobe, ltc));
                }
              });
            }
          });
}

function $probe_file() {
  probe_file(path.join(__dirname,
                            "../samples/counter24+ltc.mp4"),
             (err, file) => {
               assert.equal(err, null);
               assert.deepEqual(file.bounds(), new Bounds(17373.495791666668, 5.355));
             });
  probe_file(path.join(__dirname,
                       "../samples/ZOOM0004_Tr1.WAV"),
             (err, file) => {
               assert.equal(err, null);
               assert.deepEqual(file.bounds(), new Bounds(66857.09902083334, 13.201333));
             });
  probe_file(path.join(__dirname,
                       "../samples/ZOOM0004_Tr2.WAV"),
             (err, file) => {
               assert.equal(err, null);
               assert.equal(file.ltc, null);
               assert.deepEqual(file.bounds(), new Bounds(null, 13.201333));
             });
  /*probe_file(path.join(__dirname,
                       // missing file
                       "../samples/A001_C037_12121V.mov"),
             (err, file) => {
               assert.equal(err, null);
               assert.equal(file.ltc, null);
             });*/
}

if (require.main === module) {
  $Bounds();
  $MediaFile$bounds();
  $MediaFile$from_same_recording_session();
  $MediaFile$compare();
  $ffprobe();
  $extract_ltc();
  $choose_ltc();
  $container_start_time();
  $probe_file();
} else {
  module.exports.MediaFile = MediaFile; // only relevant for mocking tests; consider exporting in some other way?
  module.exports.probe_file = probe_file;
  module.exports.Bounds = Bounds;
}
