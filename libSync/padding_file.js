const path = require("path");
const nb = require("./native_binary");

// only for unit tests
const mf = require("./media_file");
const fs = require("fs");
const assert = require("assert");

const PAD_SUFFIX = "-LTCsyncPAD";

function suffix_filename(name, suffix) {
  const ext = path.extname(name);
  const prefix = ext ? name.slice(0, 0 - ext.length) : name;
  return prefix + suffix + ext;
}

function $suffix_filename() {
  assert.equal(suffix_filename("file.txt", "suff"), "filesuff.txt");
  assert.equal(suffix_filename("dir/file.txt", "suff"), "dir/filesuff.txt");
  assert.equal(suffix_filename("file", "suff"), "filesuff");
  assert.equal(suffix_filename(".file", "suff"), ".filesuff");
  assert.equal(suffix_filename("file.", "suff"), "filesuff.");
}

function write_padding_file(prototype, duration, callback) {
  /* Ideally, I want to generate padding files that have the same *
   stream layout at their prototypes. I have run into some limitations
   with audio streams in video files. Some files have codecs that
   ffmpeg can decode but not encode, e.g., pcm_bluray in MTS files;
   AAC stremas have a priming sample that introduces ambiguity as to
   their durations[1]; and MP4 containers cannot encapsulate PCM
   streams.
   Until a more comprehensive solution is in place, I'm generating
   files that contain either video or audio.
   [1] https://stackoverflow.com/questions/42410479/ffmpeg-wrong-audio-file-after-conversion-in-aac */
  const vs = prototype.ffprobe.streams.find(s => s.codec_type=="video");
  const as = prototype.ffprobe.streams.find(s => s.codec_type=="audio");
  if (!vs && !as) {
    callback(new Error(`cannot pad file without audio or video ${prototype.ffprobe.format.filename}`));
    return;
  }
  let args = ["-y", "-hide_banner", "-loglevel", "error"];
  // input arguments
  if (vs) {
    // `color` takes additional parameter, `d=seconds`; an alternative to `-t`
    args=args.concat(`-f lavfi -i color=c=black:s=${vs.width}x${vs.height}:r=${vs.r_frame_rate}`.split(" "));
  } else if (as) {
    // `anullsrc` takes additional parameter, `n=samples`; an alternative to `-t`
    args=args.concat(`-f lavfi -i anullsrc=cl=mono:r=${as.sample_rate}`.split(" "));
  }
  // output codec arguments
  if (vs) {
    args=args.concat(`-c:v ${vs.codec_name}`.split(" "));
  } else if (as) {
    args=args.concat(`-c:a ${as.codec_name}`.split(" "));
  }
  // consider rounding `duration` to an even number of frames when video is present
  args=args.concat(["-t", duration]);
  const padding_filename = suffix_filename(prototype.ffprobe.format.filename, PAD_SUFFIX)
  args.push(padding_filename);
  const ffmpeg = nb.spawn("ffmpeg", args);
  let o = "";
  let e = "";
  ffmpeg.stdout.on("data", function(chunk) {
    o+=chunk;
  });
  ffmpeg.stderr.on("data", function(chunk) {
    e+=chunk;
  });
  ffmpeg.on("exit", function(code, signal) {
    if (e) {
      callback(new Error(e), null);
    } else if (o) {
      callback(new Error(o), null);
    } else {
      callback(null, padding_filename);
    }
  });
}

function $write_padding_file() {
  mf.probe_file(path.join(__dirname, "../samples/counter24+ltc.mp4"), (e, f) => {
    assert.equal(e, null);
    write_padding_file(f, 3.0, (e, p) => {
      assert.equal(e, null);
      assert.equal(p, path.join(__dirname, "../samples/counter24+ltc-LTCsyncPAD.mp4"));
      mf.probe_file(p, (e, f) => {
        assert.equal(e, null);
        //assert.equal(f.ffprobe.format.duration, 3.0);
        fs.unlinkSync(p);
      });
    });
  });
}


if (require.main === module) {
  $suffix_filename();
  $write_padding_file();
} else {
  module.exports.PAD_SUFFIX = PAD_SUFFIX;
  module.exports.write_padding_file = write_padding_file;
}
