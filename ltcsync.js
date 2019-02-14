
const electron=require("electron");
const path = require("path");
const tm = require("./libSync/timing_metadata");
const sessions = require("./libSync/sessions");

/* Housekeeping */
console=electron.remote.getGlobal("console");
document.editing_session = new sessions.EditingSession();

/* User error handling */
function display_error(err) {
  const container=document.getElementById("errors");
  const e=container.appendChild(document.createElement("div"))
  e.innerHTML=err;
  setTimeout(() => container.removeChild(e), 2000);
}


/* Scaling */

function longest_bounds(editing_session) {
  const all_groups = editing_session.non_ltc_files.files.length ?
        editing_session.groups.concat(editing_session.non_ltc_files) :
        editing_session.groups;
  return all_groups.map(
  //return editing_session.groups.map(
    g => g.bounds().duration()).reduce(
      (acc, v) => Math.max(acc, v), 0);
}

// this belongs in libSync
function pretty_time(seconds) {
  const d=new Date(seconds*1000);
  
  return `${d.getUTCHours().toString().padStart(2, "0")}:${d.getUTCMinutes().toString().padStart(2, "0")}:${d.getUTCSeconds().toString().padStart(2, "0")}.${d.getUTCMilliseconds().toString().padEnd(3, "0")}`;
}
function $pretty_time() {
  console.log(pretty_time(0));
  console.log(pretty_time(59));
  console.log(pretty_time(60));
  console.log(pretty_time(130));
  console.log(pretty_time(3601));
  console.log(pretty_time(3601.5));
}


/* Data rendering */

function file_to_html(file, group_bounds) {
  const e=document.createElement("tr");

  e.appendChild(document.createElement("td"));
  if (file.ltc) {
    e.lastChild.innerHTML=pretty_time(file.ltc.bounds.start);
  }
  e.appendChild(document.createElement("td")).innerHTML=pretty_time(eval(file.ffprobe.format.duration));

  const fnc=e.appendChild(document.createElement("td"));
  fnc.setAttribute("class", "name");
  const fn=fnc.appendChild(document.createElement("span"));
  fn.innerHTML = path.basename(file.ffprobe.format.filename);
  const lb=longest_bounds(document.editing_session);
  const width=eval(file.ffprobe.format.duration)/lb;
  const margin_left=file.ltc ? (file.ltc.bounds.start-group_bounds.start)/lb : 0;
  fn.setAttribute("style", `width: ${width*100}%; margin-left: ${margin_left*100}%`);
  
  return e;
}

function file_group_to_html(group) {
  const e=document.createElement("tbody");
  let sorted_files=group.files;

  if (group.bounds().start === null && group.files.length) {
    // group===session.non_ltc_files
    const h=e.appendChild(document.createElement("tr"));
    h.setAttribute("class", "group-header");
    h.appendChild(document.createElement("td"));
    h.appendChild(document.createElement("td"));
    h.appendChild(document.createElement("th")).innerHTML=`Files without embedded timecode: ${group.files.length}`;
  } else if (group.files.length > 1) {
    const h=e.appendChild(document.createElement("tr"));
    h.setAttribute("class", "group-header");
    h.appendChild(document.createElement("td")).innerHTML=pretty_time(group.bounds().start);
    h.appendChild(document.createElement("td")).innerHTML=pretty_time(group.bounds().duration());
    h.appendChild(document.createElement("th")).innerHTML=`Group of ${group.files.length} overlapping files`;
    sorted_files=group.files.slice().sort((f0, f1) => f0.ltc.bounds.start - f1.ltc.bounds.start);
  }

  sorted_files.forEach(f => e.appendChild(file_to_html(f, group.bounds())));

  return e;
}

function editing_session_to_html(session) {
  const e=document.createElement("table");

  const h=e.appendChild(document.createElement("thead")).appendChild(document.createElement("tr"));
  h.appendChild(document.createElement("th")).innerHTML="Start TC";
  h.appendChild(document.createElement("th")).innerHTML="Duration";
  h.appendChild(document.createElement("th")).innerHTML="File notes";
  
  session.groups.slice().sort((g0, g1) => g0.bounds().start-g1.bounds().start).forEach(g => {
    e.appendChild(file_group_to_html(g));

    e.appendChild(document.createElement("tbody")).appendChild(document.createElement("tr")).appendChild(document.createElement("td"));
    e.lastChild.setAttribute("class", "dummy-spacer");
  });
  if (session.non_ltc_files.files.length) {
    e.appendChild(file_group_to_html(session.non_ltc_files));
  }
  return e;
}


/* Adding files: either from menu (through RPC) or through
 * drag-and-ndrop. */

function addFiles(paths) {
  paths.forEach(p => tm.probe_file(p, (err, file) => {
    if (err) {
      display_error(err.message);
    } else if (document.editing_session.add_file(file)) {
      const fd=document.getElementById("filedisplay");
      while (fd.firstChild) {
        fd.removeChild(fd.lastChild);
      }
      fd.appendChild(editing_session_to_html(document.editing_session));
    } else {
      display_error(`skipping duplicate file: ${p}`);
    }
  }));
}

electron.ipcRenderer.on("addFiles", function(event, paths) {
  addFiles(paths);
});

document.addEventListener("drop", function (e) {
  e.preventDefault();
  e.stopPropagation();
  addFiles(Array.from(e.dataTransfer.files, p => p.path));
});

document.addEventListener("dragover", function (e) {
  e.preventDefault();
  e.stopPropagation();
});
