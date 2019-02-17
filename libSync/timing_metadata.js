/* timing_metadata.js: find start and end times for audio and video
 * files using LTC embedded in audio. */

const path = require("path");
const fs = require("fs");
const process = require("process");
const os = require("os");

const assert = require("assert");

const nb = require("./native_binary");
const ffprobe = require("./ffprobe").ffprobe;
const ltc = require("./ltc");


/* Generates an ltc_frames[] array for each audio stream in the
 * ffprobe object. The number of elements in this array correcponds to
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
                    "../../samples/counter24+ltc.mp4"),
          (err, f) => {
            assert(!err);
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
  ffprobe(path.join(__dirname,
                    "../../samples/2018-12-12/card1-scarlet-29.97/A001_C037_12121V.mov"),
          (err, f) => {
            assert(!err);
            extract_ltc(f, (e, f, framesets) => {
              assert(!e);
              assert.equal(framesets.length, 0);
            });
          });
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
                    "../../samples/counter24+ltc.mp4"),
          (err, f) => {
            extract_ltc(f, (e, f, framesets) => {
              assert.equal(choose_ltc(f, framesets).frames.length, 127);
            })
          });
  ffprobe(path.join(__dirname,
                    "../../samples/2018-12-11/ZOOM0004_Tr1.WAV"),
          (err, f) => {
            extract_ltc(f, (e, f, framesets) => {
              assert.equal(choose_ltc(f, framesets).frames.length, 316);
            })
          });
  ffprobe(path.join(__dirname,
                    "../../samples/2018-12-11/ZOOM0004_LR.WAV"),
          (err, f) => {
            extract_ltc(f, (e, f, framesets) => {
              assert.equal(choose_ltc(f, framesets).frames, null);
            })
          });
  ffprobe(path.join(__dirname,
                    "../../samples/2018-12-11/ZOOM0004_Tr2.WAV"),
          (err, f) => {
            extract_ltc(f, (e, f, framesets) => {
              assert.equal(choose_ltc(f, framesets).frames, null);
            })
          });
  ffprobe(path.join(__dirname,
                    "../../samples/2018-12-12/card1-scarlet-29.97/A001_C037_12121V.mov"),
          (err, f) => {
            extract_ltc(f, (e, f, framesets) => {
              assert.equal(choose_ltc(f, framesets).frames, null);
            })
          });
}

function start_time_from_stream(ffstream, ltc_frames) {
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

function $start_time_from_stream() {
  const ffstream = {
    start_time: 10,             // this stream starts 10 seconds into the file
    sample_rate: 48000,
  };
  const ltc_frames = [null, {
    seconds: 3600,  frames: 0,  // this frame has TC 01:00:00:00
    dropframe: false,
    samples: [48000, 49999]},   // this frame starts 1 second into the audio stream
                      null];
  assert.equal(start_time_from_stream(ffstream, ltc_frames), 3600-10-1);
  ffprobe(path.join(__dirname,
                    "../../samples/counter24+ltc.mp4"),
          (err, ffprobe) => {
            extract_ltc(ffprobe, (err, ffprobe, framesets) => {
              let {stream, frames} = choose_ltc(ffprobe, framesets);
              assert.equal(
                start_time_from_stream(stream, frames),
                17373.495791666668)
            });
          });
  ffprobe(path.join(__dirname,
                            "../../samples/2018-12-11/ZOOM0004_Tr1.WAV"),
          (err, ffprobe) => {
            extract_ltc(ffprobe, (err, ffprobe, framesets) => {
              let {stream, frames} = choose_ltc(ffprobe, framesets);
              assert.equal(
                start_time_from_stream(stream, frames),
                66857.09902083334)
            });
          });
}

function Bounds(start, end) {
  this.start = start;
  this.end = end;
  // if start > end, recording goes over midnight; consider % 24hour
  // or similar
}
Bounds.prototype.overlap=function(bounds) {
  function contains(bounds, n) {
    return bounds.start<=n && bounds.end>=n;
  }
  return contains(this, bounds.start) || contains(this, bounds.end) ||
    contains(bounds, this.start) || contains(bounds, this.end);
}
function $Bounds$overlap() {
  assert(new Bounds(1,4).overlap(new Bounds(2, 3)));
  //assert(overlap({start: 1, end: 4}, {start:2, end: 3}));
  
  assert(new Bounds(1, 4).overlap(new Bounds(2, 5)));
  assert(new Bounds(1, 4).overlap(new Bounds(0, 3)));
  assert(new Bounds(1, 4).overlap(new Bounds(0, 5)));
  assert(new Bounds(1, 4).overlap(new Bounds(4, 5)));
  assert(new Bounds(1, 4).overlap(new Bounds(0, 1)));
  assert(!(new Bounds(1, 2).overlap(new Bounds(3, 4))));
  assert(!(new Bounds(3, 4).overlap(new Bounds(1, 2))));

  // if a recording goes over midnight, it can still overlap
  //assert(new Bounds(23*60*60, 1*60*60).overlap(new Bounds( 1, 2)));
  assert(!(new Bounds(23*60*60, 1*60*60).overlap(new Bounds( 60*60+1, 60*60+2))));
}
Bounds.prototype.duration=function() {
  return this.end - this.start;
}
function $Bounds$duration() {
  assert(new Bounds(1, 4).duration(), 3);
  // for files without LTC, bounds.duration() is ffprobe.format.duration
  assert(new Bounds(null, 4).duration(), 4);
}

/* Returns metadata about an audio or video file. The return object is
 * a combination of ffprobe(1) data and LTC timing information. For
 * LTC, result includes only bounds in seconds since
 * 00:00:00:00. Upcoming versions my include additional information,
 * such as quality of LTC signal, framerate, etc. */
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
                    const start_time=start_time_from_stream(stream, frames);
                    ltc = {
                      bounds: new Bounds(start_time,
                                         start_time+eval(ffprobe.format.duration)),
                    }
                  }
                  callback(null,
                           {ffprobe: ffprobe,
                            ltc: ltc});
                }
              });
            }
          });
}

function $probe_file() {
  probe_file(path.join(__dirname,
                            "../../samples/counter24+ltc.mp4"),
                  (e, file) => {
                    assert.equal(file.ltc.bounds.start, 17373.495791666668);
                    assert.equal(file.ltc.bounds.end, 17378.850791666668);
                  });
  probe_file(path.join(__dirname,
                            "../../samples/2018-12-11/ZOOM0004_Tr1.WAV"),
                  (e, file) => {
                    assert.equal(file.ltc.bounds.start, 66857.09902083334);
                    assert.equal(file.ltc.bounds.end, 66870.30035383334);
                  });
  probe_file(path.join(__dirname,
                            "../../samples/2018-12-11/ZOOM0004_Tr2.WAV"),
                  (e, file) => {
                    assert.equal(file.ltc, null);
                  });
  probe_file(path.join(__dirname,
                            "../../samples/2018-12-12/card1-scarlet-29.97/A001_C037_12121V.mov"),
                  (e, file) => {
                    assert.equal(file.ltc, null);
                  });
}

if (require.main === module) {
  $extract_ltc();
  $choose_ltc();
  $start_time_from_stream();
  $Bounds$overlap();
  $Bounds$duration();
  $probe_file();
} else {
  module.exports.probe_file = probe_file;
  module.exports.Bounds = Bounds;
}
