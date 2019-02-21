

const path = require("path");
const mf = require("./media_file");

const assert = require("assert");


/* A group of files that overlap temporally. Users typically want to
 * synchronize files in a group to the same timeline. Conversely,
 * files in different groups have no overlap and belong on separate
 * timelines. */
function FileGroup() {
  this.files = [];
}
FileGroup.prototype.bounds = function() {
  if (!this.files.length) {
    return null;
  } else {
    const files_with_ltc = this.files.filter(f => f.bounds().start);
    if (!files_with_ltc.length) {
      return new mf.Bounds(
        null,
        this.files.map(f => f.bounds().duration).reduce((acc, d) => Math.max(acc, d)));
    } else {
      return files_with_ltc.map(f=>f.bounds()).reduce((acc, b) => acc.union(b));
    }
  }
}
function $FileGroup$bounds() {
  const group_with_ltc = new FileGroup();
  group_with_ltc.files = [
    new mf.MediaFile({format: {duration: "2"}}, {start_time: 1}),
    new mf.MediaFile({format: {duration: "2"}}, {start_time: 2}),
  ];
  assert.deepEqual(group_with_ltc.bounds(), new mf.Bounds(1, 3));

  const group_without_ltc = new FileGroup();
  group_without_ltc.files = [
    new mf.MediaFile({format: {duration: "2"}}, null),
    new mf.MediaFile({format: {duration: "1"}}, null),
  ];
  assert.deepEqual(group_without_ltc.bounds(), new mf.Bounds(null, 2));
}
FileGroup.prototype.compare = function(group) {
  return this.bounds().start-group.bounds().start;
}
function $FileGroup$compare() {
  const g0 = new FileGroup();
  g0.files = [
    new mf.MediaFile({format: {duration: "2"}}, {start_time: 1}),
    new mf.MediaFile({format: {duration: "2"}}, {start_time: 2}),
  ];
  const g1 = new FileGroup();
  g1.files = [
    new mf.MediaFile({format: {duration: "2"}}, {start_time: 2}),
    new mf.MediaFile({format: {duration: "2"}}, {start_time: 3}),
  ];
  assert(g0.compare(g1) < 0);
  assert(g1.compare(g0) > 0);
}
FileGroup.prototype.add_file = function(file) {
  this.files.push(file);
  return this;
}


/* The state of a user-visible editing environment */
function EditingSession() {
  this.groups = [];
  this.non_ltc_files = new FileGroup();
}
EditingSession.prototype.all_files = function() {
  return this.groups.concat(this.non_ltc_files).map(
    g => g.files).reduce(
      (acc, fs) => acc.concat(fs),
      []);
}
EditingSession.prototype.add_file = function(file) {
  if (this.all_files().find(
    f => f.ffprobe.format.filename===file.ffprobe.format.filename)) {
    // file has already been added
    return false;
  } else if (file.bounds().start===null) {
    // maybe a file from the same recording already exists in this session
    const related_ltc_file = this.all_files().find(f => f.ltc && f.from_same_recording_session(file));
    if (related_ltc_file) {
      file.ltc_file = related_ltc_file;
      return this.add_file(file);
    } else {
      this.non_ltc_files.add_file(file);
      return file;
    }
  } else {
    const overlaps_with = this.groups.filter(g => g.bounds().overlap(file.bounds()));
    if (overlaps_with.length==0) {
      this.groups.push((new FileGroup()).add_file(file));
    } else if (overlaps_with.length==1) {
      overlaps_with[0].add_file(file);
    } else {
      // the file overlaps with multiple, non-overlapping groups--this
      // means the file is a bridge between these groups, and with the
      // addition of this file, the groups must combine into a single,
      // larger group
      const conjunction = new FileGroup();
      this.groups.push(conjunction);
      overlaps_with.forEach(g => {
        g.files.forEach(f => conjunction.add_file(f));
        this.groups[this.groups.findIndex(e => e===g)]=null;
      });
      this.groups = this.groups.filter(g => g);
      conjunction.add_file(file);
    }
    // if this file is from the same recording session as some existing, non-ltc files, refile them
    const related_files = this.non_ltc_files.files.filter(f => f.from_same_recording_session(file));
    if (related_files.length) {
      this.non_ltc_files.files = this.non_ltc_files.files.filter(f => !f.from_same_recording_session(file));
      related_files.forEach(f => {
        f.ltc_file = file;
        this.add_file(f);
      });
    }
    return file;
  }
}
function $EditingSession$add_file() {
  function stub_file(name, start, duration) {
    return new mf.MediaFile(
      {format: {filename: name, duration: duration}, streams: []},
      {start_time: start});
  }
  const e = new EditingSession();
  assert.equal(e.groups.length, 0);
  assert.equal(e.all_files().length, 0);

  // first file, goes to its own group
  assert(e.add_file(stub_file("one.mp4", 1, 2)));
  assert.equal(e.groups.length, 1);
  assert.equal(e.groups[0].files.length, 1);
  assert.deepEqual(e.groups[0].bounds(), new mf.Bounds(1, 2));
  assert.equal(e.all_files().length, 1);

  // non-overlapping, goes to its own group
  assert(e.add_file(stub_file("two.mp4", 4, 1)));
  assert.equal(e.groups.length, 2);
  assert.equal(e.groups[1].files.length, 1);
  assert.deepEqual(e.groups[1].bounds(), new mf.Bounds(4, 1));
  assert.equal(e.all_files().length, 2);

  // overlaps with "one.mp4", goes to that group
  assert(e.add_file(stub_file("three.mp4", 2, 1.5)));
  assert.equal(e.groups.length, 2);
  assert.equal(e.groups[0].files.length, 2);
  assert.deepEqual(e.groups[0].bounds(), new mf.Bounds(1, 2.5));
  assert.equal(e.all_files().length, 3);

  // bridges both groups
  assert(e.add_file(stub_file("four.mp4", 2, 2)));
  assert.equal(e.groups.length, 1);
  assert.equal(e.groups[0].files.length, 4);
  assert.deepEqual(e.groups[0].bounds(), new mf.Bounds(1, 4));
  assert.equal(e.all_files().length, 4);

  // attempting to add a file that already exists modifies nothing and
  // returns false
  assert(!e.add_file(stub_file("four.mp4", 2, 2)));

  // adding a file with no LTC frames
  assert(e.add_file(new mf.MediaFile({format: {filename: "non-ltc.mov"}}, null)));

  // nothing has changed in the LTC groups...
  assert.equal(e.groups.length, 1);
  assert.equal(e.groups[0].files.length, 4);
  assert.deepEqual(e.groups[0].bounds(), new mf.Bounds(1, 4));
  // ..but overall file count has gone up
  assert.equal(e.all_files().length, 5);
  // and this file ends up in the approapriate group:
  assert.equal(e.non_ltc_files.files.length, 1);

  // files from one recording session group together
  mf.probe_file(path.join(__dirname, "../build/samples/ZOOM0004_LR.WAV"), (err, z_lr) => {
    assert(!err);
    assert(!z_lr.bounds().start);
    mf.probe_file(path.join(__dirname, "../build/samples/ZOOM0004_Tr1.WAV"), (err, z_tr1) => {
      assert(!err);
      assert(z_tr1.bounds().start);
      mf.probe_file(path.join(__dirname, "../build/samples/ZOOM0004_Tr2.WAV"), (err, z_tr2) => {
        assert(!err);
        assert(!z_tr2.bounds().start);

        // add file with LTC first
        const e = new EditingSession();
        e.add_file(z_tr1);
        e.add_file(z_tr2);
        e.add_file(z_lr);
        // all three files end up in one group
        assert.equal(e.groups.length, 1);
        assert.equal(e.groups[0].files.length, 3);
        // and none end up in NON-LTC group, even though only tr1 has actual ltc
        assert.equal(e.non_ltc_files.files.length, 0);
      });
    });
  });
  mf.probe_file(path.join(__dirname, "../build/samples/ZOOM0004_LR.WAV"), (err, z_lr) => {
    assert(!err);
    assert(!z_lr.bounds().start);
    mf.probe_file(path.join(__dirname, "../build/samples/ZOOM0004_Tr1.WAV"), (err, z_tr1) => {
      assert(!err);
      assert(z_tr1.bounds().start);
      mf.probe_file(path.join(__dirname, "../build/samples/ZOOM0004_Tr2.WAV"), (err, z_tr2) => {
        assert(!err);
        assert(!z_tr2.bounds().start);

        // add file with LTC last
        const e = new EditingSession();
        e.add_file(z_tr2);
        e.add_file(z_lr);
        e.add_file(z_tr1);
        // all three files end up in one group
        assert.equal(e.groups.length, 1);
        assert.equal(e.groups[0].files.length, 3);
        // and none end up in NON-LTC group, even though only tr1 has actual ltc
        assert.equal(e.non_ltc_files.files.length, 0);
      });
    });
  });
}


if (require.main === module) {
  $FileGroup$bounds();
  $FileGroup$compare();
  $EditingSession$add_file();
} else {
  module.exports.FileGroup = FileGroup;
  module.exports.EditingSession = EditingSession;
}
